// Deterministic seed state (T-11): 42 days of history for the demo user, ending the day before demo day.
// Pure: same inputs (persona, data files) -> same rows. All numbers are documented in db/seed/README.md.
import { existsSync, readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const readJson = (p: string) => JSON.parse(readFileSync(new URL(p, root), "utf8"));

export const DEMO_DAY = "2026-10-23"; // Friday, Asia/Karachi
export const TZ = "+05:00";
export const DEMO_CLOCK = `${DEMO_DAY}T13:00:00${TZ}`; // S1 is lunch
const HISTORY_DAYS = 42; // 2026-09-11 (Fri) .. 2026-10-22 (Thu)

// ---------- helpers ----------
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const weekday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const at = (d: string, hhmm: string) => `${d}T${hhmm}:00${TZ}`;
const plusMin = (hhmm: string, m: number) => {
  const t = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) + m;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
const r1 = (x: number) => Math.round(x * 10) / 10;
const r10 = (x: number) => Math.round(x / 10) * 10;
export const e1rm = (w: number, reps: number) => r1(w * (1 + reps / 30)); // Epley

// ---------- inputs ----------
export const persona = readJson("db/seed/persona.json");
export const exercisesJson: any[] = readJson("data/exercises/exercises.json");
export const programJson = readJson("data/program/program.json");

const NUTRIENTS = ["kcal", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g", "sodium_mg", "iron_mg", "calcium_mg", "potassium_mg", "vitamin_d_mcg"] as const;
type Nutrients = Record<(typeof NUTRIENTS)[number], number>;
type Food = { id: string; name: string; spoken?: string; portions: Record<string, number>; default_portion: string; per100: Nutrients; source: string };

/** Foods by template key: T-12's data/foods files when they carry nutrients (generic keys map to their `usda` slug), else db/seed/placeholder-foods.json. */
function loadFoods(): Map<string, Food> {
  const ph = readJson("db/seed/placeholder-foods.json");
  const t12 = new Map<string, any>();
  for (const f of ["data/foods/foods.json", "data/foods/desi.json"]) if (existsSync(new URL(f, root))) for (const x of readJson(f)) t12.set(x.id, x);
  const out = new Map<string, Food>();
  for (const p of ph.foods) {
    const t = t12.get(p.usda ?? p.id);
    const ok = t?.nutrients && NUTRIENTS.every((k) => typeof t.nutrients[k] === "number");
    out.set(p.id, ok
      ? { id: t.id, name: t.name, spoken: p.spoken, portions: { ...p.portions, ...t.portions }, default_portion: t.default_portion, per100: t.nutrients, source: "t12" }
      : { id: p.id, name: p.name ?? t?.name ?? p.id, spoken: p.spoken, portions: p.portions ?? t?.portions, default_portion: p.default_portion ?? t?.default_portion, per100: Object.fromEntries(NUTRIENTS.map((k, i) => [k, p.n[i]])) as Nutrients, source: "seed-placeholder" });
  }
  return out;
}
export const foodsById = loadFoods();

// ---------- targets (Mifflin-St Jeor + activity, D8) ----------
const ACTIVITY = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 } as Record<string, number>;
export function computeTargets(weightKg: number, kcalOverride?: number) {
  const age = Number(DEMO_DAY.slice(0, 4)) - persona.birth_year;
  const bmr = 10 * weightKg + 6.25 * persona.height_cm - 5 * age + (persona.sex === "male" ? 5 : -161);
  const tdee = bmr * ACTIVITY[persona.activity];
  const kcal = kcalOverride ?? r10(tdee - (persona.rate_kg_per_week * 7700) / 7);
  const protein_g = Math.round(persona.protein_per_kg * weightKg);
  const fat_g = Math.round((kcal * 0.25) / 9);
  const carbs_g = Math.round((kcal - protein_g * 4 - fat_g * 9) / 4);
  return {
    kcal, protein_g, carbs_g, fat_g,
    fiber_g: Math.round((kcal / 1000) * 14),
    sodium_mg: 2300,
    water_ml: Math.round((35 * weightKg) / 100) * 100,
  };
}

// ---------- body weight: weekly means (Fri..Thu weeks), noise is zero-mean inside each week ----------
/** Change of the weekly mean vs the week before. The last week slows to about -0.2 (-0.23 here, -0.2 in the Sat-Fri check-in window) so the next check-in trims calories (S5). */
export const WEEKLY_WEIGHT_CHANGE = [-0.45, -0.4, -0.42, -0.38, -0.23];

// ---------- workouts ----------
/** Hand-set top lines for the two lifts the demo shows. Bench last session 80 x 7,7,6 -> target 80 x 8 -> S3 PR (e1RM 101.3 > 98.7). */
const SCRIPTED: Record<string, [number, number[]][]> = {
  "barbell-bench-press": [[70, [8, 8, 8]], [72.5, [8, 8, 8]], [75, [7, 7, 6]], [75, [8, 8, 8]], [77.5, [8, 8, 8]], [80, [7, 7, 6]]],
  "barbell-back-squat": [[92.5, [7, 7, 7]], [95, [6, 6, 5]], [95, [7, 7, 7]], [97.5, [7, 7, 7]], [100, [6, 6, 5]], [100, [7, 7, 7]]],
};
const START_KG: Record<string, number> = {
  "overhead-press": 45, "incline-dumbbell-press": 24, "lateral-raise": 10, "triceps-pushdown": 25,
  "barbell-row": 62.5, "lat-pulldown": 55, "seated-cable-row": 55, "face-pull": 20, "barbell-curl": 27.5,
  "romanian-deadlift": 80, "leg-press": 140, "lying-leg-curl": 40, "standing-calf-raise": 60,
  "dumbbell-bench-press": 28, "one-arm-dumbbell-row": 30, "dumbbell-shoulder-press": 20, "hammer-curl": 14, "overhead-triceps-extension": 20,
};

/** Double progression: every set at reps_max -> add increment, aim for reps_min; otherwise same weight, aim for reps_max. */
export function nextTarget(last: { weight: number; reps: number[] }, px: { reps_min: number; reps_max: number; increment_kg: number }) {
  const allTop = last.reps.every((r) => r >= px.reps_max);
  return allTop
    ? { weight_kg: last.weight + px.increment_kg, reps: px.reps_min, reason: `Last time ${last.weight} kg x ${last.reps.join(", ")}: every set hit ${px.reps_max}, so add ${px.increment_kg} kg.` }
    : { weight_kg: last.weight, reps: px.reps_max, reason: `Last time ${last.weight} kg x ${last.reps.join(", ")}: same weight, aim for ${px.reps_max} reps.` };
}

// ---------- meals ----------
type Item = [food: string, qty: number, unit: string];
type Meal = [type: "breakfast" | "lunch" | "snack" | "dinner", time: string, items: Item[]];
/** Training days are protein-heavy; rest days lean on daal, biryani and parathas (lower protein: the brief's insight). */
const TRAINING: Meal[][] = [
  [
    ["breakfast", "08:30", [["eggs", 3, "egg"], ["roti", 1, "roti"], ["chai", 1, "cup"]]],
    ["lunch", "13:30", [["chicken-karahi", 1, "plate"], ["roti", 2, "roti"], ["raita", 1, "bowl"]]],
    ["snack", "17:00", [["yogurt", 1, "container"], ["banana", 1, "banana"], ["whey", 1, "scoop"]]],
    ["dinner", "21:00", [["chicken-tikka", 1, "serving"], ["basmati-rice", 1, "plate"], ["daal", 1, "bowl"]]],
  ],
  [
    ["breakfast", "08:15", [["oatmeal", 1, "serving"], ["eggs", 2, "egg"], ["banana", 1, "banana"]]],
    ["lunch", "13:45", [["chicken-biryani", 1, "plate"], ["raita", 1, "bowl"]]],
    ["snack", "20:00", [["whey", 1, "scoop"], ["milk", 1, "cup"]]],
    ["dinner", "20:45", [["seekh-kebab", 1, "serving"], ["chicken-breast", 1, "serving"], ["roti", 2, "roti"], ["daal", 1, "bowl"]]],
  ],
  [
    ["breakfast", "08:45", [["eggs", 3, "egg"], ["paratha", 1, "paratha"], ["chai", 1, "cup"]]],
    ["lunch", "13:15", [["chicken-tikka", 1, "serving"], ["naan", 1, "naan"], ["raita", 1, "bowl"]]],
    ["snack", "20:00", [["whey", 1, "scoop"], ["milk", 1, "cup"]]],
    ["dinner", "21:15", [["chicken-handi", 1, "bowl"], ["basmati-rice", 1, "plate"]]],
  ],
];
const REST: Meal[][] = [
  [
    ["breakfast", "09:30", [["aloo-paratha", 1, "paratha"], ["eggs", 2, "egg"], ["chai", 1, "cup"]]],
    ["lunch", "14:00", [["daal-chawal", 1, "plate"], ["raita", 1, "bowl"]]],
    ["snack", "17:30", [["fruit-chaat", 1, "bowl"], ["chai", 1, "cup"]]],
    ["dinner", "21:00", [["chicken-biryani", 1, "plate"]]],
  ],
  [
    ["breakfast", "10:00", [["paratha", 1, "paratha"], ["eggs", 2, "egg"], ["chai", 1, "cup"]]],
    ["lunch", "14:30", [["chana-chaat", 1, "plate"], ["mango-lassi", 1, "glass"]]],
    ["dinner", "20:30", [["nihari", 1, "bowl"], ["naan", 1, "naan"]]],
  ],
  [
    ["breakfast", "09:15", [["oatmeal", 1, "serving"], ["yogurt", 1, "container"], ["banana", 1, "banana"]]],
    ["lunch", "13:30", [["qeema", 1, "plate"], ["roti", 2, "roti"]]],
    ["snack", "17:00", [["fruit-chaat", 1, "bowl"]]],
    ["dinner", "21:00", [["daal-chawal", 1, "plate"], ["raita", 1, "bowl"]]],
  ],
];
/** Units scaled to hit the day's calories (in quarter steps); counted units (roti, egg, naan...) stay whole. */
const SCALABLE = new Set(["plate", "bowl", "serving"]);

function itemNutrients(f: Food, grams: number): Nutrients {
  return Object.fromEntries(NUTRIENTS.map((k) => [k, Math.round(f.per100[k] * grams) / 100])) as Nutrients;
}
const gramsOf = (f: Food, qty: number, unit: string) => {
  const g = f.portions[unit];
  if (g == null) throw new Error(`food ${f.id} has no portion "${unit}"`);
  return qty * g;
};
const word = (n: number) => (["zero", "one", "two", "three", "four"][n] ?? String(n));
const said = (f: Food, qty: number, unit: string) => {
  const name = f.spoken ?? f.name.replace(/\s*\(.*\)$/, "").split(",")[0].toLowerCase();
  if (unit === f.id || ["roti", "egg", "paratha", "naan", "banana"].includes(unit)) return `${word(qty)} ${qty > 1 ? `${unit}s` : unit}`;
  return `${qty === 1 ? "a" : qty} ${unit}${qty > 1 ? "s" : ""} of ${name}`;
};

// ---------- the generator ----------
export function generateSeed() {
  const rand = mulberry32(20261023);
  const days = Array.from({ length: HISTORY_DAYS }, (_, i) => addDays(DEMO_DAY, i - HISTORY_DAYS));
  const firstDay = days[0];
  const trainingDayByWeekday = new Map<number, any>(programJson.days.map((d: any) => [d.weekday, d]));

  // Body weight.
  const weekMeans = [persona.start_weight_kg];
  for (const d of WEEKLY_WEIGHT_CHANGE) weekMeans.push(weekMeans.at(-1)! + d);
  const bodyweight_logs: any[] = [];
  for (let w = 0; w < 6; w++) {
    // Friday (i = 0) sits on the mean, the other six days are zero-mean noise: both Fri-Thu weeks and the
    // Sat-Fri check-in windows then read the planned trend.
    const six = Array.from({ length: 6 }, () => (rand() - 0.5) * 0.6);
    const m6 = six.reduce((a, b) => a + b) / 6;
    const noise = [0, ...six.map((x) => x - m6)];
    const mean = 0;
    for (let i = 0; i < 7; i++) {
      const date = days[w * 7 + i];
      bodyweight_logs.push({ id: bodyweight_logs.length + 1, logged_at: at(date, "07:10"), date, weight_kg: r1(weekMeans[w] + noise[i] - mean) });
    }
  }
  const weightOn = new Map(bodyweight_logs.map((b) => [b.date, b.weight_kg]));
  const avgWeight = (endDate: string) => {
    const ws = Array.from({ length: 7 }, (_, i) => weightOn.get(addDays(endDate, -i))).filter((x) => x != null) as number[];
    return ws.reduce((a, b) => a + b, 0) / ws.length;
  };

  // Targets: initial on day 1, then a weekly check-in each check-in weekday with 14 days of data behind it.
  const targets: any[] = [];
  const t0 = computeTargets(persona.start_weight_kg);
  targets.push({ id: 1, effective_date: firstDay, ...t0, reason_codes: ["initial"], reason: `Start targets: Mifflin-St Jeor with ${persona.activity} activity, minus ${Math.round((persona.rate_kg_per_week * 7700) / 7)} kcal a day to lose ${persona.rate_kg_per_week} kg a week; protein ${persona.protein_per_kg} g per kg.`, source: "initial", created_at: at(firstDay, "07:00") });
  for (const date of days) {
    if (weekday(date) !== persona.checkin_weekday || date < addDays(firstDay, 14)) continue;
    const thisWeek = avgWeight(addDays(date, -1));
    const lastWeek = avgWeight(addDays(date, -8));
    const change = r1(thisWeek - lastWeek);
    const prev = targets.at(-1);
    const t = computeTargets(r1(thisWeek), prev.kcal); // on plan: calories unchanged, protein follows weight
    targets.push({ id: targets.length + 1, effective_date: date, ...t, reason_codes: ["on_track"], reason: `Weekly check-in: ${change} kg this week against a plan of -${persona.rate_kg_per_week} kg; on track, calories unchanged; protein follows body weight.`, source: "weekly", created_at: at(date, "07:00") });
  }
  const targetOn = (date: string) => targets.filter((t) => t.effective_date <= date).at(-1);

  // Meals.
  const meal_entries: any[] = [];
  const meal_items: any[] = [];
  let ti = 0, ri = 0;
  for (const date of days) {
    const training = trainingDayByWeekday.has(weekday(date));
    const template = training ? TRAINING[ti++ % TRAINING.length] : REST[ri++ % REST.length];
    const desired = targetOn(date).kcal * (1 + (rand() - 0.5) * 0.12);
    let fixed = 0, scalable = 0;
    for (const [, , items] of template) for (const [fid, q, u] of items) {
      const f = foodsById.get(fid)!;
      const k = itemNutrients(f, gramsOf(f, q, u)).kcal;
      if (SCALABLE.has(u)) scalable += k; else fixed += k;
    }
    const factor = Math.min(1.8, Math.max(0.6, (desired - fixed) / scalable));
    for (const [type, time, items] of template) {
      const entryId = meal_entries.length + 1;
      const rows = items.map(([fid, q, u]) => {
        const f = foodsById.get(fid)!;
        const qty = SCALABLE.has(u) ? Math.max(0.5, Math.round(q * factor * 4) / 4) : q;
        const grams = r1(gramsOf(f, qty, u));
        const row = { id: meal_items.length + 1, entry_id: entryId, food_id: f.id, name: f.name, said: said(f, qty, u), quantity: qty, unit: u, grams, ...itemNutrients(f, grams), estimated: false, assumptions: [] as string[] };
        meal_items.push(row);
        return row;
      });
      const words = rows.map((r) => r.said);
      meal_entries.push({ id: entryId, eaten_at: at(date, time), date, meal_type: type, said: words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words.at(-1)}` : words[0] });
    }
  }

  // Water: most days, 3-5 logs.
  const water_logs: any[] = [];
  for (const date of days) {
    if (rand() < 0.12) continue;
    const n = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) water_logs.push({ id: water_logs.length + 1, logged_at: at(date, plusMin("09:00", i * 150 + Math.floor(rand() * 40))), date, ml: [250, 500, 500, 750][Math.floor(rand() * 4)] });
  }

  // Workouts: program days on their weekdays, double progression.
  const workout_sessions: any[] = [];
  const sets: any[] = [];
  const cardio_logs: any[] = [];
  const history = new Map<string, { weight: number; reps: number[] }[]>();
  const bestE1rm = new Map<string, number>();
  const bestAtReps = new Map<string, number>();
  for (const date of days) {
    const pd = trainingDayByWeekday.get(weekday(date));
    if (!pd) continue;
    const sessionId = `seed-${date}-${pd.id}`;
    const start = weekday(date) === 6 ? "10:00" : "18:30";
    let minute = 0;
    for (const px of pd.exercises) {
      const past = history.get(px.exercise) ?? [];
      let line: { weight: number; reps: number[] };
      if (SCRIPTED[px.exercise]) {
        const [w, reps] = SCRIPTED[px.exercise][past.length];
        line = { weight: w, reps };
      } else if (past.length === 0) {
        line = { weight: START_KG[px.exercise], reps: [px.reps_max - 1, px.reps_max - 1, px.reps_max - 2] };
      } else {
        const t = nextTarget(past.at(-1)!, px);
        const top = past.at(-1)!.reps.every((r) => r >= px.reps_max);
        line = top
          ? { weight: t.weight_kg, reps: [px.reps_max - 1, px.reps_max - 2, px.reps_max - 2].map((r) => Math.max(px.reps_min, r)) }
          : { weight: t.weight_kg, reps: Array(px.sets).fill(px.reps_max) };
      }
      history.set(px.exercise, [...past, line]);
      line.reps.forEach((reps, i) => {
        const e = e1rm(line.weight, reps);
        const key = `${px.exercise}:${reps}`;
        const prE = past.length > 0 && e > (bestE1rm.get(px.exercise) ?? Infinity);
        const prR = bestAtReps.has(key) && line.weight > bestAtReps.get(key)!;
        bestE1rm.set(px.exercise, Math.max(e, bestE1rm.get(px.exercise) ?? 0));
        bestAtReps.set(key, Math.max(line.weight, bestAtReps.get(key) ?? 0));
        minute += 3;
        sets.push({ id: sets.length + 1, session_id: sessionId, exercise_id: px.exercise, set_number: i + 1, weight_kg: line.weight, reps, rpe: null, e1rm_kg: e, pr_e1rm: prE, pr_rep_best: prR, logged_at: at(date, plusMin(start, minute)) });
      });
      minute += 2;
    }
    if (pd.id === "upper") cardio_logs.push({ id: cardio_logs.length + 1, session_id: sessionId, exercise_id: "incline-walk", date, logged_at: at(date, plusMin(start, minute + 20)), duration_min: 20, distance_km: 1.6 });
    workout_sessions.push({ id: sessionId, day_id: pd.id, date, started_at: at(date, start), ended_at: at(date, plusMin(start, minute + (pd.id === "upper" ? 20 : 0))), status: "done", mcp_session_id: null, state: null });
  }

  // Next-session targets for demo day (what the overnight job of 2026-10-22 would have written).
  const demoDay = trainingDayByWeekday.get(weekday(DEMO_DAY));
  const next_targets = demoDay.exercises.map((px: any, i: number) => ({ id: i + 1, for_date: DEMO_DAY, exercise_id: px.exercise, ...nextTarget(history.get(px.exercise)!.at(-1)!, px) }));

  const profile = [{ id: 1, name: persona.name, sex: persona.sex, birth_year: persona.birth_year, height_cm: persona.height_cm, start_weight_kg: persona.start_weight_kg, activity: persona.activity, goal: persona.goal, rate_kg_per_week: persona.rate_kg_per_week, protein_per_kg: persona.protein_per_kg, preferences: persona.preferences, checkin_weekday: persona.checkin_weekday, timezone: persona.timezone }];

  const exercises = exercisesJson.map((e) => ({ id: e.id, name: e.name, aliases: e.aliases, type: e.type, muscle: e.muscle, equipment: e.equipment, alternatives: e.alternatives }));
  const program_days = programJson.days.map((d: any, i: number) => ({ id: d.id, name: d.name, position: i + 1, weekday: d.weekday }));
  const program_exercises = programJson.days.flatMap((d: any) => d.exercises.map((x: any, i: number) => ({ day_id: d.id, position: i + 1, exercise_id: x.exercise, sets: x.sets, reps_min: x.reps_min, reps_max: x.reps_max, rest_seconds: x.rest_seconds, increment_kg: x.increment_kg })));

  // Grocery catalog (T-13), part of the seed state.
  const catalogFile = new URL("data/catalog/catalog.json", root);
  const catalog_items = existsSync(catalogFile)
    ? JSON.parse(readFileSync(catalogFile, "utf8")).map((c: any) => ({ id: c.id, name: c.name, category: c.category, asin: c.asin, pack_size: c.pack_label, pack_unit: c.pack_unit, grams_per_pack: c.grams_per_pack, price_usd: c.price_usd, price_date: c.price_date, food_id: c.food_id, url: c.url, verified_at: c.verified_at }))
    : [];

  const tables: Record<string, any[]> = {
    exercises, program_days, program_exercises, catalog_items,
    profile, targets, meal_entries, meal_items, water_logs, bodyweight_logs,
    workout_sessions, sets, cardio_logs, next_targets,
    meal_plans: [], cart_items: [], cart_checkouts: [], briefs: [],
  };

  // Cached overnight output (T-27): { <table>: rows[] } for briefs, next_targets, targets, meal_plans.
  const cache = new URL("jobs/overnight/cache/overnight-cache.json", root);
  if (existsSync(cache)) {
    const c = JSON.parse(readFileSync(cache, "utf8"));
    for (const t of ["briefs", "next_targets", "targets", "meal_plans"]) {
      if (!Array.isArray(c[t])) continue;
      for (const row of c[t]) tables[t].push("id" in row || t === "briefs" ? row : { id: tables[t].length + 1, ...row });
    }
  }
  return tables;
}
