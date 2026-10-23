// Targets engine (D8): start targets from the profile, the weight trend, and the weekly adaptive check-in.
// runWeeklyCheckIn(date) is the shared entry point T-27's overnight job calls on the check-in weekday.
import { sql } from "drizzle-orm";
import type { DayNumbers } from "@dayform/contracts";
import { getDb, query, schema } from "../../core/db.ts";
import { clock } from "../../core/clock.ts";
import {
  KCAL_PER_KG, adaptiveKcal, bmr, dayTargets, emaTrend, goalAdjustment, r1, r2, r10, reasonCode, tdee, trendAt, type Goal,
} from "./formulas.ts";

export * from "./formulas.ts";

const TZ = () => process.env.DEMO_TZ ?? "Asia/Karachi";
/** YYYY-MM-DD of an instant in DEMO_TZ. */
export const localDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ() }).format(d);
export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

export interface Profile {
  sex: string; birth_year: number; height_cm: number; start_weight_kg: number;
  activity: string; goal: Goal; rate_kg_per_week: number; protein_per_kg: number;
}

export async function getProfile(): Promise<Profile> {
  const [p] = await query<Profile>(sql`SELECT sex, birth_year, height_cm, start_weight_kg, activity, goal, rate_kg_per_week, protein_per_kg FROM profile WHERE id = 1`);
  if (!p) throw new Error("No profile: run npm run db:reset");
  return { ...p, birth_year: Number(p.birth_year), height_cm: Number(p.height_cm), start_weight_kg: Number(p.start_weight_kg), rate_kg_per_week: Number(p.rate_kg_per_week), protein_per_kg: Number(p.protein_per_kg) };
}

const NUM_COLS = sql`kcal, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, water_ml`;
const toDay = (r: Record<string, unknown>): DayNumbers => ({
  kcal: Number(r.kcal), protein_g: Number(r.protein_g), carbs_g: Number(r.carbs_g), fat_g: Number(r.fat_g),
  fiber_g: Number(r.fiber_g), sodium_mg: Number(r.sodium_mg), water_ml: Number(r.water_ml),
});

/** The targets row in force on `date` (latest effective date, then latest id). */
export async function targetsOn(date: string): Promise<{ id: number; effective_date: string; numbers: DayNumbers } | null> {
  const [r] = await query<Record<string, unknown>>(sql`SELECT id, effective_date::text AS effective_date, ${NUM_COLS} FROM targets
    WHERE effective_date <= ${date}::date ORDER BY effective_date DESC, id DESC LIMIT 1`);
  return r ? { id: Number(r.id), effective_date: String(r.effective_date), numbers: toDay(r) } : null;
}

/** EMA trend of all logged weights up to `date` (last log of each day). */
export async function weightTrend(date: string) {
  const rows = await query<{ date: string; kg: number }>(sql`SELECT DISTINCT ON (date) date::text AS date, weight_kg AS kg
    FROM bodyweight_logs WHERE date <= ${date}::date ORDER BY date, logged_at DESC, id DESC`);
  return emaTrend(rows.map((r) => ({ date: r.date, kg: Number(r.kg) })));
}

/** What was eaten and drunk on `date`, in the targets' units. */
export async function eatenOn(date: string): Promise<DayNumbers> {
  const [m] = await query<Record<string, unknown>>(sql`SELECT coalesce(sum(i.kcal),0) AS kcal, coalesce(sum(i.protein_g),0) AS protein_g,
    coalesce(sum(i.carbs_g),0) AS carbs_g, coalesce(sum(i.fat_g),0) AS fat_g, coalesce(sum(i.fiber_g),0) AS fiber_g,
    coalesce(sum(i.sodium_mg),0) AS sodium_mg, (SELECT coalesce(sum(ml),0) FROM water_logs WHERE date = ${date}::date) AS water_ml
    FROM meal_items i JOIN meal_entries e ON e.id = i.entry_id WHERE e.date = ${date}::date`);
  const d = toDay(m);
  return Object.fromEntries(Object.entries(d).map(([k, v]) => [k, Math.round(v)])) as DayNumbers;
}

async function insertTargets(date: string, t: DayNumbers, codes: string[], reason: string, source: "weekly" | "manual") {
  const db = await getDb();
  await query(sql`DELETE FROM targets WHERE effective_date = ${date}::date AND source = ${source}`);
  await db.insert(schema.targets).values({
    effective_date: date, ...t, reason_codes: codes, reason, source, created_at: (await clock.now()).toISOString(),
  });
}

export interface CheckIn {
  date: string;
  previous_kcal: number;
  kcal: number;
  change_kcal: number;
  reason_codes: string[];
  /** The numbers behind the change, for T-27 to put into one spoken sentence. */
  reason: {
    code: string; planned_kg: number; actual_kg: number; change_kcal: number;
    avg_intake_kcal: number; intake_days: number; trend_change_14d_kg: number; expenditure_kcal: number; trend_kg: number;
  };
  targets: DayNumbers;
}

/**
 * Weekly adaptive check-in for `date` (the check-in day; uses the 14 days before it). Stores a `weekly` targets row
 * effective on `date` (replacing one already there) and returns the numbers. A day whose logged kcal is under half
 * the previous target counts as not fully logged and is left out of the intake mean.
 */
export async function runWeeklyCheckIn(date: string): Promise<CheckIn> {
  await query(sql`DELETE FROM targets WHERE effective_date = ${date}::date AND source = 'weekly'`);
  const p = await getProfile();
  const prev = await targetsOn(date);
  if (!prev) throw new Error("No targets to adapt: run npm run db:reset");
  const end = addDays(date, -1), start = addDays(date, -14);

  const trend = await weightTrend(end);
  const tEnd = trendAt(trend, end), t14 = trendAt(trend, addDays(end, -14)), t7 = trendAt(trend, addDays(end, -7));
  const days = await query<{ date: string; kcal: number }>(sql`SELECT e.date::text AS date, sum(i.kcal) AS kcal
    FROM meal_items i JOIN meal_entries e ON e.id = i.entry_id WHERE e.date BETWEEN ${start}::date AND ${end}::date GROUP BY e.date`);
  const full = days.map((d) => Number(d.kcal)).filter((k) => k >= prev.numbers.kcal / 2);
  const planned = p.goal === "lose" ? -p.rate_kg_per_week : p.goal === "gain" ? p.rate_kg_per_week : 0;
  const weightKg = tEnd ?? p.start_weight_kg;

  let codes: string[], change = 0, avg = 0, expenditure = 0, trendChange = 0;
  if (full.length < 7 || tEnd === undefined || t14 === undefined) {
    codes = ["NOT_ENOUGH_DATA"];
  } else {
    avg = full.reduce((a, b) => a + b, 0) / full.length;
    trendChange = tEnd - t14;
    const age = Number(date.slice(0, 4)) - p.birth_year;
    const adj = goalAdjustment(p.goal, tdee(bmr({ ...p, weight_kg: weightKg, age }), p.activity), p.rate_kg_per_week);
    const a = adaptiveKcal({ avgIntakeKcal: avg, trendChange14Kg: trendChange, adjustmentKcal: adj, previousKcal: prev.numbers.kcal });
    change = a.change_kcal;
    expenditure = a.expenditure;
    codes = [reasonCode(p.goal, change), ...(a.capped ? ["WEEKLY_CAP"] : [])];
  }
  const actual = tEnd !== undefined && t7 !== undefined ? r2(tEnd - t7) : 0;
  const kcal = prev.numbers.kcal + change;
  const targets = dayTargets(kcal, r1(weightKg), p.protein_per_kg);
  const reason = {
    code: codes[0], planned_kg: planned, actual_kg: actual, change_kcal: change,
    avg_intake_kcal: Math.round(avg), intake_days: full.length, trend_change_14d_kg: r2(trendChange),
    expenditure_kcal: Math.round(expenditure), trend_kg: r1(weightKg),
  };
  const text = codes[0] === "NOT_ENOUGH_DATA"
    ? `Weekly check-in: only ${full.length} fully logged days in the last 14; calories unchanged at ${kcal}.`
    : `Weekly check-in: trend ${actual} kg this week against a plan of ${planned} kg; intake ${reason.avg_intake_kcal} kcal/day over ${full.length} days, expenditure ${reason.expenditure_kcal} kcal; calories ${prev.numbers.kcal} -> ${kcal} (${change >= 0 ? "+" : ""}${change}).`;
  await insertTargets(date, targets, codes, text, "weekly");
  return { date, previous_kcal: prev.numbers.kcal, kcal, change_kcal: change, reason_codes: codes, reason, targets };
}

/** set_goals: recompute start targets from the profile and the new goal, store them as `manual` from today. */
export async function setGoals(input: { goal: Goal; rate_kg_per_week?: number; weight_kg?: number; activity?: string }) {
  const today = localDate(await clock.now());
  const p = await getProfile();
  const weightKg = input.weight_kg ?? trendAt(await weightTrend(today), today) ?? p.start_weight_kg;
  const activity = input.activity ?? p.activity;
  const age = Number(today.slice(0, 4)) - p.birth_year;
  const t = tdee(bmr({ ...p, weight_kg: weightKg, age }), activity);
  // No rate given: keep the profile's rate if the goal is unchanged, else use the ticket's percentages.
  const givenRate = input.goal === "maintain" ? 0 : input.rate_kg_per_week ?? (input.goal === p.goal ? p.rate_kg_per_week : null);
  const adj = goalAdjustment(input.goal, t, givenRate);
  const rate = givenRate ?? r2((Math.abs(adj) * 7) / KCAL_PER_KG);
  const ppk = input.goal === "lose" ? 2.0 : 1.8;
  const targets = dayTargets(r10(t + adj), r1(weightKg), ppk);
  const previous = await targetsOn(today);
  const reason = `Goal ${input.goal}${rate ? ` ${rate} kg a week` : ""}, ${activity} activity, ${r1(weightKg)} kg: TDEE ${Math.round(t)} kcal ${adj < 0 ? "minus" : "plus"} ${Math.abs(Math.round(adj))} = ${targets.kcal} kcal; protein ${ppk} g per kg.`;
  await query(sql`UPDATE profile SET goal = ${input.goal}, rate_kg_per_week = ${rate}, activity = ${activity}, protein_per_kg = ${ppk} WHERE id = 1`);
  await insertTargets(today, targets, ["GOAL_SET"], reason, "manual");
  return { date: today, goal: input.goal, rate_kg_per_week: rate, targets, previous_targets: previous?.numbers ?? null, reason, eaten: await eatenOn(today) };
}

/** log_bodyweight: one weight per day (a second log replaces it); returns the EMA trend and its 7-day change. */
export async function logBodyweight(kg: number) {
  const now = await clock.now();
  const today = localDate(now);
  await query(sql`DELETE FROM bodyweight_logs WHERE date = ${today}::date`);
  const db = await getDb();
  await db.insert(schema.bodyweight_logs).values({ logged_at: now.toISOString(), date: today, weight_kg: kg });
  const trend = await weightTrend(today);
  const tNow = trendAt(trend, today)!;
  const tWeek = trendAt(trend, addDays(today, -7));
  return { date: today, kg, trend_kg: r1(tNow), weekly_change_kg: tWeek === undefined ? 0 : r2(tNow - tWeek) };
}
