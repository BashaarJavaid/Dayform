// Targets maths (D8, DESIGN §7): pure code, no LLM. Every function has a fixed-number test in server/test/targets.test.ts.
import type { DayNumbers } from "@dayform/contracts";

export type Goal = "lose" | "maintain" | "gain";
export const ACTIVITY: Record<string, number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
export const KCAL_PER_KG = 7700;
export const WEEKLY_CAP_KCAL = 250;
export const MAX_DEFICIT_KCAL = 750;
/** A weekly change smaller than this keeps calories as they are (ON_TRACK). */
export const ON_TRACK_KCAL = 50;
export const EMA_ALPHA = 0.1;

export const r10 = (x: number) => Math.round(x / 10) * 10;
export const r1 = (x: number) => Math.round(x * 10) / 10;
export const r2 = (x: number) => Math.round(x * 100) / 100;

/** Mifflin-St Jeor BMR in kcal/day. */
export function bmr(p: { sex: string; weight_kg: number; height_cm: number; age: number }) {
  return 10 * p.weight_kg + 6.25 * p.height_cm - 5 * p.age + (p.sex === "male" ? 5 : -161);
}

export function tdee(bmrKcal: number, activity: string) {
  const f = ACTIVITY[activity];
  if (!f) throw new Error(`Unknown activity ${activity}`);
  return bmrKcal * f;
}

/**
 * Daily kcal added to expenditure for the goal. With a weekly rate: rate × 7700 / 7 (a loss capped at 750).
 * Without one: cut −20% of TDEE (at most −750), bulk +10%. Maintain: 0.
 */
export function goalAdjustment(goal: Goal, tdeeKcal: number, rateKgPerWeek: number | null) {
  if (goal === "maintain") return 0;
  if (goal === "lose") return -Math.min(rateKgPerWeek == null ? 0.2 * tdeeKcal : (rateKgPerWeek * KCAL_PER_KG) / 7, MAX_DEFICIT_KCAL);
  return rateKgPerWeek == null ? 0.1 * tdeeKcal : (rateKgPerWeek * KCAL_PER_KG) / 7;
}

/** Weekly rate implied by a daily adjustment (used when the user gave no rate). */
export const rateFromAdjustment = (adjKcal: number) => r2((Math.abs(adjKcal) * 7) / KCAL_PER_KG);

export const proteinPerKg = (goal: Goal) => (goal === "lose" ? 2.0 : 1.8);

/** The day's numbers for a calorie target: protein per kg, fat ≥ 0.8 g/kg (and ≥ 25% of kcal), carbs the rest. */
export function dayTargets(kcal: number, weightKg: number, proteinGPerKg: number): DayNumbers {
  const protein_g = Math.round(proteinGPerKg * weightKg);
  const fat_g = Math.round(Math.max(0.8 * weightKg, (0.25 * kcal) / 9));
  return {
    kcal,
    protein_g,
    carbs_g: Math.max(0, Math.round((kcal - protein_g * 4 - fat_g * 9) / 4)),
    fat_g,
    fiber_g: Math.round((kcal / 1000) * 14),
    sodium_mg: 2300,
    water_ml: Math.round((35 * weightKg) / 100) * 100,
  };
}

/** Exponential moving average of daily weights (alpha 0.1), seeded with the first weight. Input sorted by date. */
export function emaTrend(points: { date: string; kg: number }[], alpha = EMA_ALPHA) {
  const out: { date: string; trend: number }[] = [];
  let e: number | undefined;
  for (const p of points) {
    e = e === undefined ? p.kg : e + alpha * (p.kg - e);
    out.push({ date: p.date, trend: e });
  }
  return out;
}

/** Trend on `date`: the last trend point on or before it. */
export const trendAt = (trend: { date: string; trend: number }[], date: string) =>
  trend.filter((t) => t.date <= date).at(-1)?.trend;

/**
 * Weekly adaptive calories. Expenditure = mean intake − trend change over 14 days × 7700 / 14.
 * New kcal = expenditure + goal adjustment, rounded to 10, the change limited to ±250 (under 50 keeps calories).
 */
export function adaptiveKcal(i: { avgIntakeKcal: number; trendChange14Kg: number; adjustmentKcal: number; previousKcal: number }) {
  const expenditure = i.avgIntakeKcal - (i.trendChange14Kg * KCAL_PER_KG) / 14;
  const wanted = r10(expenditure + i.adjustmentKcal) - i.previousKcal;
  const change = Math.abs(wanted) < ON_TRACK_KCAL ? 0 : Math.max(-WEEKLY_CAP_KCAL, Math.min(WEEKLY_CAP_KCAL, wanted));
  return { expenditure, wanted_change_kcal: wanted, change_kcal: change, kcal: i.previousKcal + change, capped: change !== wanted && change !== 0 };
}

/** Reason code for a weekly change, from the direction of the calorie change and the goal. */
export function reasonCode(goal: Goal, changeKcal: number) {
  if (changeKcal === 0) return "ON_TRACK";
  if (goal === "lose") return changeKcal < 0 ? "LOSS_SLOWER_THAN_PLANNED" : "LOSS_FASTER_THAN_PLANNED";
  if (goal === "gain") return changeKcal > 0 ? "GAIN_SLOWER_THAN_PLANNED" : "GAIN_FASTER_THAN_PLANNED";
  return changeKcal < 0 ? "GAINING_ON_MAINTENANCE" : "LOSING_ON_MAINTENANCE";
}
