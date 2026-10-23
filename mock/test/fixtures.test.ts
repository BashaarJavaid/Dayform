// Every fixture validates against its contract, and the numbers agree with each other (DEMO-SCRIPT S1–S6).
import { describe, expect, it } from "vitest";
import { loadFixtures } from "../src/fixtures.ts";

const f = loadFixtures() as Record<string, any>;
const MACROS = ["kcal", "protein_g", "carbs_g", "fat_g"] as const;
const DAY = [...MACROS, "fiber_g", "sodium_mg", "water_ml"] as const;
const sum = (rows: any[], k: string) => rows.reduce((s, r) => s + r[k], 0);
const cents = (n: number) => Math.round(n * 100);
const e1rm = (w: number, r: number) => Math.round(w * (1 + r / 30) * 10) / 10;

describe("fixtures", () => {
  it("all 19 validate against the contracts", () => expect(Object.keys(f)).toHaveLength(19));

  it("S1/S2 meal totals, remaining, and the one-roti correction add up", () => {
    for (const m of [f.log_meal, f.correct_meal]) {
      for (const k of MACROS)
        expect(m.entry.totals[k]).toBe(
          sum(
            m.entry.items.map((i: any) => i.macros),
            k,
          ),
        );
      for (const k of DAY) expect(m.day.remaining[k]).toBe(m.day.targets[k] - m.day.eaten[k]);
    }
    const roti = f.correct_meal.entry.items[0].macros;
    for (const k of MACROS) expect(f.log_meal.day.eaten[k] - f.correct_meal.day.eaten[k]).toBe(roti[k]);
    expect(f.log_meal.entry.items.filter((i: any) => i.assumed).map((i: any) => i.unit)).toEqual(["plate"]);
  });

  it("the daily summary matches the day after S2", () => {
    expect(f.get_daily_summary.eaten).toEqual(f.correct_meal.day.eaten);
    for (const k of MACROS)
      expect(
        sum(
          f.get_daily_summary.meals.map((m: any) => m.totals),
          k,
        ),
      ).toBe(f.get_daily_summary.eaten[k]);
    expect(f.log_water.eaten.water_ml - f.get_daily_summary.eaten.water_ml).toBe(f.log_water.added_ml);
  });

  it("S3: bench 80 kg × 8 is a PR by Epley e1RM, and the session volume adds up", () => {
    const pr = f.log_set.pr;
    expect([pr.weight_kg, pr.reps, f.log_set.is_pr]).toEqual([80, 8, true]);
    expect(pr.e1rm_kg).toBe(e1rm(80, 8));
    expect(pr.e1rm_kg).toBeGreaterThan(pr.previous_e1rm_kg);
    const vol = f.finish_workout.exercises
      .flatMap((e: any) => e.sets)
      .reduce((s: number, x: any) => s + x.weight_kg * x.reps, 0);
    expect(f.finish_workout.total_volume_kg).toBe(vol);
    expect(f.swap_exercise.replaced).toBe(f.start_workout.plan[1].exercise);
  });

  it("S4: plan days within ±5%, grocery list = cart, cart total adds up to about $63", () => {
    const plan = f.plan_meal_prep.plan;
    expect(plan.days).toHaveLength(4);
    for (const d of plan.days) {
      for (const k of MACROS) {
        const want = sum(
          d.meals.map((m: any) => plan.recipes.find((r: any) => r.id === m.recipe_id).per_serving),
          k,
        );
        expect(d.totals[k]).toBe(want);
        expect(Math.abs(d.totals[k] - plan.targets[k])).toBeLessThanOrEqual(0.05 * plan.targets[k]);
      }
      expect(d.within_tolerance).toBe(true);
    }
    for (const c of [f.view_cart, f.add_to_cart, f.remove_from_cart, f.checkout_cart]) {
      for (const i of c.items) expect(cents(i.line_total_usd)).toBe(cents(i.packs * i.unit_price_usd));
      expect(cents(c.estimated_total_usd)).toBe(c.items.reduce((s: number, i: any) => s + cents(i.line_total_usd), 0));
      expect(c.item_count).toBe(c.items.length);
      expect(c.pack_count).toBe(sum(c.items, "packs"));
    }
    expect(f.add_to_cart.items.map((i: any) => i.catalog_item_id)).toEqual(
      plan.grocery.map((g: any) => g.catalog_item_id),
    );
    expect(f.checkout_cart.item_count).toBe(14);
    expect(Math.round(f.checkout_cart.estimated_total_usd)).toBe(63);
  });

  it("S5: the brief's −150 kcal trim and S6's rising bench series", () => {
    const b = f.get_morning_brief;
    expect(b.today.targets.kcal - b.targets_change.previous_kcal).toBe(b.targets_change.kcal_delta);
    expect(b.targets_change.kcal_delta).toBe(-150);
    expect(b.targets_change.previous_kcal).toBe(f.log_meal.day.targets.kcal);
    const s = f.get_progress.series.map((p: any) => p.value);
    expect(s.every((v: number, i: number) => i === 0 || v >= s[i - 1])).toBe(true);
    expect(s.at(-1)).toBe(f.log_set.pr.e1rm_kg);
    expect(f.get_progress.summary.change).toBeCloseTo(s.at(-1) - s[0], 0);
  });
});
