// Overnight job (T-27, D18): prepares `date` while the user sleeps. Used by the CLI (jobs/overnight), the Lambda
// and the admin route advance-day. Code computes every number; the reasoning model (Nova, D21) only writes the
// targets-change sentence, reviews next-session targets inside code guardrails, and words the brief. Every model
// output passes zod and a number check against the database before it is stored (DESIGN §7).
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { BriefCard, type DayNumbers, type Macros } from "@dayform/contracts";
import { query } from "../../core/db.ts";
import { structured } from "../../core/llm.ts";
import { addDays, runWeeklyCheckIn, targetsOn, trendAt, weightTrend, eatenOn, type CheckIn } from "../../domain/targets/index.ts";
import { targetFromHistory, type Target } from "../../domain/session/index.ts";
import { ensureFreshPlan } from "../../domain/meal-prep/store.ts";

export const CACHE_FILE = fileURLToPath(new URL("../../../../jobs/overnight/cache/overnight-cache.json", import.meta.url));
export const TZ = () => process.env.DEMO_TZ ?? "Asia/Karachi";

/** The instant of wall time `hhmm` on `date` in DEMO_TZ. */
export function zonedTime(date: string, hhmm: string): Date {
  const guess = Date.parse(`${date}T${hhmm}:00Z`);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: TZ(), hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(guess).map((p) => [p.type, p.value]));
  const wall = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00Z`);
  return new Date(guess - (wall - guess));
}
const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
const macros = (d: DayNumbers): Macros => ({ kcal: d.kcal, protein_g: d.protein_g, carbs_g: d.carbs_g, fat_g: d.fat_g });
/** "push" -> "Push": the card shows "<workout> day". */
const dayLabel = (id: string) => id[0].toUpperCase() + id.slice(1);

// --- Number check: every number a model wrote must be a stored number (rounded the way it was written) ---

/** Numbers in a text ("2,250", "-0.23", "102.5"), as written. */
export const numbersIn = (text: string) => (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((s) => s.replace(/,/g, ""));

/** The written numbers in `text` that match none of `allowed` (compared by absolute value at the written precision). */
export function unknownNumbers(text: string, allowed: number[]): string[] {
  return numbersIn(text).filter((s) => {
    const dp = s.split(".")[1]?.length ?? 0;
    const n = Number(s);
    return !allowed.some((v) => {
      const a = Math.abs(v);
      return Math.abs(Number(a.toFixed(dp)) - n) < 1e-9 || (dp === 0 && Math.abs(a - n) < 0.5 + 1e-9);
    });
  });
}

// --- Guardrails on the model's review of next-session targets (code, DESIGN §7) ---

export interface Px { exercise_id: string; name: string; reps_min: number; reps_max: number; increment_kg: number }

/** Load within ±5% of the rule's weight (clamped, rounded down to 0.5 kg), reps inside the rep range. */
export function enforceGuardrails(rule: Target, proposed: Target, px: Pick<Px, "reps_min" | "reps_max">): Target & { clamped: boolean } {
  const lo = rule.weight_kg * 0.95, hi = rule.weight_kg * 1.05;
  let w = Number.isFinite(proposed.weight_kg) ? proposed.weight_kg : rule.weight_kg;
  if (w < lo) w = Math.ceil(lo * 2) / 2;
  if (w > hi) w = Math.floor(hi * 2) / 2;
  const reps = Math.min(px.reps_max, Math.max(px.reps_min, Math.round(proposed.reps)));
  return { weight_kg: w, reps, clamped: w !== proposed.weight_kg || reps !== proposed.reps };
}

// --- Step 1: yesterday ---

export interface Yesterday {
  date: string;
  eaten: DayNumbers;
  targets: DayNumbers;
  workout: string | null;
  prs: { exercise: string; weight_kg: number; reps: number; e1rm_kg: number }[];
}

export async function yesterdayFacts(date: string): Promise<Yesterday> {
  const y = addDays(date, -1);
  const [eaten, t, sessions, prs] = await Promise.all([
    eatenOn(y),
    targetsOn(y),
    query<{ day_id: string | null }>(sql`SELECT day_id FROM workout_sessions WHERE date = ${y}::date AND status = 'done' ORDER BY started_at LIMIT 1`),
    query<{ exercise: string; weight_kg: number; reps: number; e1rm_kg: number }>(sql`SELECT x.name AS exercise, s.weight_kg, s.reps, s.e1rm_kg
      FROM sets s JOIN workout_sessions w ON w.id = s.session_id JOIN exercises x ON x.id = s.exercise_id
      WHERE w.date = ${y}::date AND (s.pr_e1rm OR s.pr_rep_best) ORDER BY s.logged_at`),
  ]);
  if (!t) throw new Error("No targets: run npm run db:reset");
  return {
    date: y, eaten, targets: t.numbers,
    workout: sessions[0] ? dayLabel(sessions[0].day_id ?? "workout") : null,
    prs: prs.map((p) => ({ exercise: p.exercise, weight_kg: Number(p.weight_kg), reps: Number(p.reps), e1rm_kg: Number(p.e1rm_kg) })),
  };
}

// --- Step 2: check-in and its sentence ---

const Sentence = z.object({ sentence: z.string().min(10).max(300) });

export function checkInNumbers(c: CheckIn): number[] {
  const r = c.reason;
  return [c.previous_kcal, c.kcal, c.change_kcal, r.planned_kg, r.actual_kg, r.avg_intake_kcal, r.intake_days, r.trend_change_14d_kg, r.expenditure_kcal, r.trend_kg, 14, 7];
}

/** Code's own sentence, used when the model's twice fails the number check. */
export const checkInFallback = (c: CheckIn) =>
  `Your weight trend moved ${r1(Math.abs(c.reason.actual_kg))} kg this week against a plan of ${Math.abs(c.reason.planned_kg)} kg, so daily calories go ${c.change_kcal < 0 ? "down" : "up"} by ${Math.abs(c.change_kcal)}.`;

async function explainCheckIn(c: CheckIn, log: (m: string) => void): Promise<string> {
  const allowed = checkInNumbers(c);
  const r = c.reason;
  const facts = {
    reason_code: r.code, weight_change_this_week_kg: r.actual_kg, planned_change_per_week_kg: r.planned_kg,
    previous_kcal: c.previous_kcal, new_kcal: c.kcal, change_kcal: c.change_kcal,
    avg_intake_kcal: r.avg_intake_kcal, estimated_expenditure_kcal: r.expenditure_kcal,
  };
  let prompt = `You are a calm fitness coach speaking to the user ("you", "I"). The weekly check-in changed their daily calorie target. ` +
    `Write one sentence, under 25 words: first how their weight moved this week compared with the plan (negative kg = lost), then what you changed. ` +
    `Example with other numbers: "You gained 0.1 kg this week instead of losing 0.5 kg, so I trimmed 200 calories a day." ` +
    `Use only numbers from these facts (you may round kg to one decimal); no other numbers:\n${JSON.stringify(facts)}`;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { data } = await structured({ name: "explain_targets_change", description: "The sentence explaining the calorie change.", schema: Sentence, prompt, maxTokens: 200 });
    const bad = unknownNumbers(data.sentence, allowed);
    if (!bad.length) return data.sentence.trim();
    log(`targets-change sentence: numbers not in the data (${bad.join(", ")}), attempt ${attempt}`);
    prompt += `\nYour last sentence used numbers that are not in the data: ${bad.join(", ")}. Use only the numbers given.`;
  }
  log("targets-change sentence: using the code sentence");
  return checkInFallback(c);
}

// --- Step 3: next-session targets ---

export interface NextTarget { exercise_id: string; name: string; weight_kg: number; reps: number; reason: string }

async function programDay(date: string) {
  const [day] = await query<{ id: string; name: string }>(sql`SELECT id, name FROM program_days WHERE weekday = ${weekdayOf(date)} ORDER BY position LIMIT 1`);
  if (!day) return null;
  const px = await query<Px & { reps_min: number }>(sql`SELECT p.exercise_id, x.name, p.reps_min, p.reps_max, p.increment_kg
    FROM program_exercises p JOIN exercises x ON x.id = p.exercise_id WHERE p.day_id = ${day.id} ORDER BY p.position`);
  return { ...day, exercises: px.map((p) => ({ ...p, reps_min: Number(p.reps_min), reps_max: Number(p.reps_max), increment_kg: Number(p.increment_kg) })) };
}

const Review = z.object({
  targets: z.array(z.object({ exercise_id: z.string(), weight_kg: z.number(), reps: z.number().int(), note: z.string().max(200) })),
});

async function nextTargets(date: string, day: NonNullable<Awaited<ReturnType<typeof programDay>>>, log: (m: string) => void): Promise<NextTarget[]> {
  const rules = await Promise.all(day.exercises.map(async (px) => {
    const rule = (await targetFromHistory(px.exercise_id, date, px)) ?? { weight_kg: 20, reps: px.reps_min };
    const last = await query<{ weight_kg: number; reps: number }>(sql`SELECT s.weight_kg, s.reps FROM sets s JOIN workout_sessions w ON w.id = s.session_id
      WHERE s.exercise_id = ${px.exercise_id} AND w.date < ${date}::date AND w.date = (SELECT max(w2.date) FROM sets s2 JOIN workout_sessions w2 ON w2.id = s2.session_id
      WHERE s2.exercise_id = ${px.exercise_id} AND w2.date < ${date}::date) ORDER BY s.set_number`);
    return { px, rule, last: last.map((s) => `${Number(s.weight_kg)}x${s.reps}`).join(", ") };
  }));
  let review: z.infer<typeof Review>["targets"] = [];
  try {
    const { data } = await structured({
      name: "review_targets",
      description: "The reviewed target for each exercise.",
      schema: Review,
      maxTokens: 800,
      prompt: `You review a lifter's next-session targets, set by double progression. Keep each rule target unless the last session clearly calls for a small change. Limits: weight within 5% of the rule weight, reps within the rep range. Return one entry per exercise, with a short note.\n${JSON.stringify(rules.map((r) => ({ exercise_id: r.px.exercise_id, name: r.px.name, rep_range: `${r.px.reps_min}-${r.px.reps_max}`, last_session: r.last, rule_target: r.rule })))}`,
    });
    review = data.targets;
  } catch (e) {
    log(`next-session review failed (${(e as Error).message}); keeping the rule targets`);
  }
  return rules.map(({ px, rule, last }) => {
    const proposed = review.find((t) => t.exercise_id === px.exercise_id);
    const g = proposed ? enforceGuardrails(rule, proposed, px) : { ...rule, clamped: false };
    const changed = g.weight_kg !== rule.weight_kg || g.reps !== rule.reps;
    const base = `double progression from ${last || "no history"} (range ${px.reps_min}-${px.reps_max}): ${rule.weight_kg} kg x ${rule.reps}`;
    const reason = changed ? `${base}; review: ${proposed!.note}${g.clamped ? " (clamped to guardrails)" : ""}` : base;
    return { exercise_id: px.exercise_id, name: px.name, weight_kg: g.weight_kg, reps: g.reps, reason };
  });
}

// --- Step 5: the brief ---

export interface Insights { training_days: number; rest_days: number; protein_training_g: number; protein_rest_g: number; kcal_avg: number; kcal_target: number; protein_target_g: number; protein_hit_days: number; logged_days: number; water_avg_ml: number; water_target_ml: number }

/** 14-day patterns for the insight (code). */
export async function insights(date: string): Promise<Insights> {
  const start = addDays(date, -14), end = addDays(date, -1);
  const all = await query<{ date: string; kcal: number; protein_g: number; trained: boolean; water: number }>(sql`
    SELECT e.date::text AS date, sum(i.kcal) AS kcal, sum(i.protein_g) AS protein_g,
      EXISTS (SELECT 1 FROM workout_sessions w WHERE w.date = e.date AND w.status = 'done') AS trained,
      (SELECT coalesce(sum(ml), 0) FROM water_logs l WHERE l.date = e.date) AS water
    FROM meal_items i JOIN meal_entries e ON e.id = i.entry_id WHERE e.date BETWEEN ${start}::date AND ${end}::date GROUP BY e.date ORDER BY e.date`);
  const t = (await targetsOn(end))!.numbers;
  // Partly logged days (under half the kcal target, e.g. today so far) would skew the means; leave them out like the check-in.
  const days = all.filter((d) => Number(d.kcal) >= t.kcal / 2);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
  const tr = days.filter((d) => d.trained), rest = days.filter((d) => !d.trained);
  return {
    training_days: tr.length, rest_days: rest.length,
    protein_training_g: avg(tr.map((d) => Number(d.protein_g))), protein_rest_g: avg(rest.map((d) => Number(d.protein_g))),
    kcal_avg: avg(days.map((d) => Number(d.kcal))), kcal_target: t.kcal, protein_target_g: t.protein_g,
    protein_hit_days: days.filter((d) => Number(d.protein_g) >= t.protein_g * 0.9).length, logged_days: days.length,
    water_avg_ml: avg(days.map((d) => Number(d.water))), water_target_ml: t.water_ml,
  };
}

/** Insight candidates, biggest gap against target first (code ranks; the model words the first one). */
export function insightCandidates(i: Insights) {
  const gap = (v: number, t: number) => (t ? Math.abs(v - t) / t : 0);
  return [
    { topic: "protein on rest days vs training days", rest_days_g: i.protein_rest_g, training_days_g: i.protein_training_g, target_g: i.protein_target_g, gap: gap(i.protein_rest_g, i.protein_target_g) },
    { topic: "water", avg_ml: i.water_avg_ml, target_ml: i.water_target_ml, gap: gap(i.water_avg_ml, i.water_target_ml) },
    { topic: "calories", avg_kcal: i.kcal_avg, target_kcal: i.kcal_target, gap: gap(i.kcal_avg, i.kcal_target) },
  ].sort((a, b) => b.gap - a.gap).map(({ gap: _, ...c }) => c);
}

export const insightFallback = (i: Insights) =>
  `Over the last 14 days, protein averaged ${i.protein_training_g} g on training days but ${i.protein_rest_g} g on rest days, against a ${i.protein_target_g} g target.`;

/** What the model writes; code assembles the card and checks each number against `facts`. */
const BriefDraft = z.object({
  greeting: z.string().max(200),
  insight: z.string().max(300),
  yesterday: z.object({ kcal: z.number(), protein_g: z.number(), workout: z.string().nullable() }),
  weight: z.object({ change_kg_week: z.number(), planned_kg_week: z.number() }),
  today: z.object({ workout: z.object({ day_name: z.string(), exercise: z.string(), weight_kg: z.number(), reps: z.number() }).nullable() }),
});
type BriefDraft = z.infer<typeof BriefDraft>;

export interface BriefFacts {
  date: string;
  name: string;
  yesterday: Yesterday;
  weight: { change_kg_week: number; planned_kg_week: number };
  insights: Insights;
  today: { workout: { day_name: string; exercise: string; weight_kg: number; reps: number } | null; targets: DayNumbers };
  targets_change: { kcal_delta: number; previous_kcal: number; reason: string } | null;
}

/** All numbers the brief may mention. */
export function factNumbers(f: BriefFacts): number[] {
  const flat = (o: unknown): number[] => (typeof o === "number" ? [o] : o && typeof o === "object" ? Object.values(o).flatMap(flat) : []);
  const [y, m, d] = f.date.split("-").map(Number);
  return [...flat({ ...f, date: undefined, targets_change: f.targets_change && { ...f.targets_change, reason: undefined } }), y, m, d, 14, 7];
}

/** Field paths where the draft's numbers differ from the facts, plus text fields with unknown numbers. */
export function checkDraft(d: BriefDraft, f: BriefFacts): string[] {
  const bad: string[] = [];
  const eq = (path: string, a: number, b: number) => void (Math.abs(a - b) > 1e-6 && bad.push(path));
  eq("yesterday.kcal", d.yesterday.kcal, f.yesterday.eaten.kcal);
  eq("yesterday.protein_g", d.yesterday.protein_g, f.yesterday.eaten.protein_g);
  if ((d.yesterday.workout === null) !== (f.yesterday.workout === null)) bad.push("yesterday.workout");
  eq("weight.change_kg_week", d.weight.change_kg_week, f.weight.change_kg_week);
  eq("weight.planned_kg_week", d.weight.planned_kg_week, f.weight.planned_kg_week);
  const tw = f.today.workout, dw = d.today.workout;
  if (!tw !== !dw) bad.push("today.workout");
  else if (tw && dw) {
    eq("today.workout.weight_kg", dw.weight_kg, tw.weight_kg);
    eq("today.workout.reps", dw.reps, tw.reps);
  }
  const allowed = factNumbers(f);
  for (const k of ["greeting", "insight"] as const) if (unknownNumbers(d[k], allowed).length) bad.push(k);
  return bad;
}

/** Assemble the card: numbers always from the facts; text from the draft unless its field failed the check twice. */
export function assembleBrief(f: BriefFacts, d: BriefDraft | null, dropped: string[]): { card: BriefCard; greeting: string } {
  const card: BriefCard = {
    date: f.date,
    yesterday: { eaten: macros(f.yesterday.eaten), targets: macros(f.yesterday.targets), workout: f.yesterday.workout },
    weight: f.weight,
    insight: d && !dropped.includes("insight") ? d.insight.trim() : insightFallback(f.insights),
    today: {
      workout: f.today.workout && { day_name: f.today.workout.day_name, lead: { exercise: f.today.workout.exercise, weight_kg: f.today.workout.weight_kg, reps: f.today.workout.reps } },
      targets: f.today.targets,
    },
    targets_change: f.targets_change,
  };
  return { card: BriefCard.parse(card), greeting: d && !dropped.includes("greeting") ? d.greeting.trim() : `Good morning, ${f.name}.` };
}

async function writeBrief(f: BriefFacts, log: (m: string) => void) {
  let prompt = `You write a short spoken morning brief for a fitness add-on. Facts (all numbers come from the database):\n${JSON.stringify({ ...f, insight_candidates: insightCandidates(f.insights) })}\n` +
    `Write: greeting (one friendly line using the name, no numbers); insight (about the FIRST entry of "insight_candidates", 14-day averages: a full spoken sentence under 25 words that names the two numbers it compares, like "You average 150 g of protein on training days but only 95 g on rest days." (other numbers); numbers only from the facts); ` +
    `and copy yesterday kcal and protein_g, yesterday workout, weight, and today's workout (day_name, exercise, weight_kg, reps) exactly from the facts.`;
  let draft: BriefDraft | null = null;
  let bad: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      draft = (await structured({ name: "write_brief", description: "The morning brief.", schema: BriefDraft, prompt, maxTokens: 700 })).data;
    } catch (e) {
      log(`brief: model failed (${(e as Error).message}); code text`);
      return assembleBrief(f, null, []);
    }
    bad = checkDraft(draft, f);
    if (!bad.length) break;
    log(`brief: numbers do not match the database in ${bad.join(", ")} (attempt ${attempt})`);
    prompt += `\nYour last brief had numbers that do not match the facts in: ${bad.join(", ")}. Copy numbers exactly from the facts.`;
  }
  if (bad.length) log(`brief: dropped ${bad.join(", ")} (numbers from the database, text from code)`);
  return assembleBrief(f, draft, bad);
}

// --- runOvernight ---

export interface OvernightResult {
  date: string;
  ms: number;
  steps: string[];
  checkIn: CheckIn | null;
  nextTargets: NextTarget[];
  mealPlanId: number | null;
  brief: BriefCard;
  greeting: string;
}

/** The full live job for `date` (the morning being prepared). Idempotent: replaces that date's outputs. */
export async function runOvernight(date: string, onProgress: (m: string) => void = () => {}): Promise<OvernightResult> {
  const t0 = performance.now();
  const steps: string[] = [];
  const log = (m: string) => {
    const line = `overnight ${date} +${Math.round(performance.now() - t0)}ms ${m}`;
    steps.push(m);
    console.log(line);
    onProgress(m);
  };
  const [profile] = await query<{ name: string; checkin_weekday: number; goal: string; rate_kg_per_week: number }>(sql`SELECT name, checkin_weekday, goal, rate_kg_per_week FROM profile WHERE id = 1`);
  if (!profile) throw new Error("No profile: run npm run db:reset");

  // 1. Yesterday
  const y = await yesterdayFacts(date);
  log(`step 1/6 yesterday ${y.date}: ${y.eaten.kcal}/${y.targets.kcal} kcal, protein ${y.eaten.protein_g}/${y.targets.protein_g} g, workout ${y.workout ?? "none"}, PRs ${y.prs.length}`);

  // 2. Check-in day
  let checkIn: CheckIn | null = null;
  let change: BriefFacts["targets_change"] = null;
  if (weekdayOf(date) === Number(profile.checkin_weekday)) {
    checkIn = await runWeeklyCheckIn(date);
    if (checkIn.change_kcal !== 0) {
      const reason = await explainCheckIn(checkIn, log);
      change = { kcal_delta: checkIn.change_kcal, previous_kcal: checkIn.previous_kcal, reason };
    }
    log(`step 2/6 check-in: ${checkIn.previous_kcal} -> ${checkIn.kcal} kcal (${checkIn.reason_codes.join(",")})${change ? `: ${change.reason}` : ""}`);
  } else log("step 2/6 check-in: not a check-in day");

  // 3. Next-session targets
  const day = await programDay(date);
  let targets: NextTarget[] = [];
  if (day) {
    targets = await nextTargets(date, day, log);
    await query(sql`DELETE FROM next_targets WHERE for_date = ${date}::date`);
    for (const t of targets) {
      await query(sql`INSERT INTO next_targets (for_date, exercise_id, weight_kg, reps, reason) VALUES (${date}::date, ${t.exercise_id}, ${t.weight_kg}, ${t.reps}, ${t.reason})`);
    }
    log(`step 3/6 next-session targets (${day.id}): ${targets.map((t) => `${t.exercise_id} ${t.weight_kg}x${t.reps}`).join(", ")}`);
  } else log("step 3/6 next-session targets: rest day");

  // 4. Meal plan
  let mealPlanId: number | null = null;
  try {
    mealPlanId = (await ensureFreshPlan(date, 4)).id;
    log(`step 4/6 meal plan: ready (id ${mealPlanId})`);
  } catch (e) {
    log(`step 4/6 meal plan: failed (${(e as Error).message})`);
  }

  // 5. Brief
  const trend = await weightTrend(addDays(date, -1));
  const tEnd = trendAt(trend, addDays(date, -1)), t7 = trendAt(trend, addDays(date, -8));
  const planned = profile.goal === "lose" ? -Number(profile.rate_kg_per_week) : profile.goal === "gain" ? Number(profile.rate_kg_per_week) : 0;
  const lead = targets[0];
  const facts: BriefFacts = {
    date,
    name: profile.name,
    yesterday: y,
    weight: { change_kg_week: checkIn ? checkIn.reason.actual_kg : tEnd !== undefined && t7 !== undefined ? r2(tEnd - t7) : 0, planned_kg_week: planned },
    insights: await insights(date),
    today: {
      workout: day && lead ? { day_name: dayLabel(day.id), exercise: lead.name, weight_kg: lead.weight_kg, reps: lead.reps } : null,
      targets: (await targetsOn(date))!.numbers,
    },
    targets_change: change,
  };
  const { card, greeting } = await writeBrief(facts, log);
  log(`step 5/6 brief written: ${card.insight}`);

  // 6. Save
  await query(sql`DELETE FROM briefs WHERE for_date = ${date}::date`);
  await query(sql`INSERT INTO briefs (for_date, brief, created_at) VALUES (${date}::date, ${JSON.stringify({ ...card, greeting })}::jsonb, ${zonedTime(date, "03:00").toISOString()}::timestamptz)`);
  log("step 6/6 brief saved");
  return { date, ms: Math.round(performance.now() - t0), steps, checkIn, nextTargets: targets, mealPlanId, brief: card, greeting };
}

// --- Cached mode (OVERNIGHT_MODE=cached) ---

export interface CacheFile { for_date: string; briefs: any[]; next_targets: any[]; targets: any[]; meal_plans: any[] }

export function readCache(): CacheFile | null {
  return existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, "utf8")) : null;
}

const COLS = {
  targets: ["effective_date", "kcal", "protein_g", "carbs_g", "fat_g", "fiber_g", "sodium_mg", "water_ml", "reason_codes", "reason", "source", "created_at"],
  next_targets: ["for_date", "exercise_id", "weight_kg", "reps", "reason"],
  meal_plans: ["status", "start_date", "end_date", "plan", "totals", "within_tolerance", "created_at"],
  briefs: ["for_date", "brief", "created_at"],
} as const;
const DATE_COL = { targets: "effective_date", next_targets: "for_date", meal_plans: "start_date", briefs: "for_date" } as const;

/** The rows the job wrote for `date`, in the shape T-11's reset loads (schema column names, no ids). */
export async function dumpRows(date: string): Promise<CacheFile> {
  const created = zonedTime(date, "03:00").toISOString();
  const out: CacheFile = { for_date: date, briefs: [], next_targets: [], targets: [], meal_plans: [] };
  for (const t of Object.keys(COLS) as (keyof typeof COLS)[]) {
    const extra = t === "targets" ? sql` AND source = 'weekly'` : t === "meal_plans" ? sql` AND status = 'ready'` : sql``;
    const rows = await query<Record<string, unknown>>(sql`SELECT ${sql.raw(COLS[t].join(", "))} FROM ${sql.identifier(t)}
      WHERE ${sql.identifier(DATE_COL[t])} = ${date}::date${extra} ORDER BY ${sql.raw(t === "briefs" ? "for_date" : "id")}`);
    out[t] = (t === "meal_plans" ? rows.slice(-1) : rows).map((r) => {
      const row: Record<string, unknown> = {};
      for (const c of COLS[t]) {
        const v = r[c];
        row[c] = /date$/.test(c) || c === "for_date" ? String(v).slice(0, 10)
          : c === "created_at" ? created
          : typeof v === "string" && ["plan", "totals", "brief"].includes(c) ? JSON.parse(v) : v;
      }
      return row;
    });
  }
  return out;
}

/**
 * Cached mode: make sure the cached rows for `date` are in the database (T-11's reset normally loaded them already),
 * inserting any table that has none. No model call; well under a second.
 */
export async function applyCached(date: string, log: (m: string) => void = () => {}): Promise<{ inserted: string[]; brief: BriefCard }> {
  const c = readCache();
  if (!c) throw new Error(`No overnight cache at ${CACHE_FILE}: run npm run overnight:cache`);
  if (c.for_date !== date) throw new Error(`The overnight cache is for ${c.for_date}, not ${date}`);
  const inserted: string[] = [];
  for (const t of Object.keys(COLS) as (keyof typeof COLS)[]) {
    if (!c[t].length) continue;
    const extra = t === "targets" ? sql` AND source = 'weekly'` : sql``;
    const [{ n }] = await query<{ n: number }>(sql`SELECT count(*)::int AS n FROM ${sql.identifier(t)} WHERE ${sql.identifier(DATE_COL[t])} = ${date}::date${extra}`);
    if (Number(n) > 0) continue;
    const json = JSON.stringify(c[t]);
    await query(sql`INSERT INTO ${sql.identifier(t)} (${sql.raw(COLS[t].join(", "))})
      SELECT ${sql.raw(COLS[t].join(", "))} FROM json_populate_recordset(NULL::${sql.identifier(t)}, ${json}::json)`);
    inserted.push(t);
  }
  log(`cached overnight output for ${date}: ${inserted.length ? `inserted ${inserted.join(", ")}` : "already loaded by reset"}`);
  log("brief saved");
  return { inserted, brief: BriefCard.parse(c.briefs[0].brief) };
}

/** OVERNIGHT_MODE switch for the admin route, the CLI and the Lambda. */
export async function prepareDay(date: string, mode: "live" | "cached", onProgress?: (m: string) => void) {
  const t0 = performance.now();
  if (mode === "cached") {
    const r = await applyCached(date, onProgress);
    return { mode, ms: Math.round(performance.now() - t0), brief: r.brief };
  }
  const r = await runOvernight(date, onProgress);
  return { mode, ms: r.ms, brief: r.brief, steps: r.steps };
}
