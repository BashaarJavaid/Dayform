// T-21: the targets formulas (fixed numbers), the seed check-in, and the two tools over MCP.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { log_bodyweight, set_goals } from "@dayform/contracts";
import { createApp } from "../src/app.ts";
import { getDb, query } from "../src/core/db.ts";
import { tools } from "../src/tools/goals/index.ts";
import {
  adaptiveKcal, bmr, dayTargets, emaTrend, goalAdjustment, reasonCode, runWeeklyCheckIn, tdee, trendAt,
} from "../src/domain/targets/index.ts";
import { reset } from "../../db/src/reset.ts";
import { connect, listen } from "./helpers.ts";
import { sql } from "drizzle-orm";

describe("targets formulas", () => {
  it("Mifflin-St Jeor BMR and TDEE", () => {
    expect(bmr({ sex: "male", weight_kg: 84, height_cm: 178, age: 30 })).toBe(1807.5);
    expect(bmr({ sex: "female", weight_kg: 84, height_cm: 178, age: 30 })).toBe(1641.5);
    expect(tdee(1807.5, "moderate")).toBeCloseTo(2801.625, 6);
    expect(tdee(1000, "sedentary")).toBe(1200);
  });

  it("goal adjustment: rate x 7700 / 7, or -20% (cap -750) / +10% without a rate", () => {
    expect(goalAdjustment("lose", 2800, 0.4)).toBeCloseTo(-440, 6);
    expect(goalAdjustment("lose", 2800, null)).toBeCloseTo(-560, 6);
    expect(goalAdjustment("lose", 4000, null)).toBe(-750);
    expect(goalAdjustment("lose", 2800, 1)).toBe(-750);
    expect(goalAdjustment("maintain", 2800, 0.5)).toBe(0);
    expect(goalAdjustment("gain", 2800, null)).toBeCloseTo(280, 6);
    expect(goalAdjustment("gain", 2800, 0.25)).toBeCloseTo(275, 6);
  });

  it("day targets: protein per kg, fat >= 0.8 g/kg, carbs the rest, fiber, sodium, water", () => {
    expect(dayTargets(2360, 84, 2.0)).toEqual({ kcal: 2360, protein_g: 168, fat_g: 67, carbs_g: 271, fiber_g: 33, sodium_mg: 2300, water_ml: 2900 });
    // 25% of kcal wins over 0.8 g/kg at higher calories
    expect(dayTargets(3000, 70, 1.8)).toEqual({ kcal: 3000, protein_g: 126, fat_g: 83, carbs_g: 437, fiber_g: 42, sodium_mg: 2300, water_ml: 2500 });
  });

  it("EMA trend, alpha 0.1, and trend on a date", () => {
    const t = emaTrend([{ date: "2026-10-01", kg: 80 }, { date: "2026-10-02", kg: 81 }, { date: "2026-10-04", kg: 79 }]);
    expect(t.map((x) => +x.trend.toFixed(4))).toEqual([80, 80.1, 79.99]);
    expect(+trendAt(t, "2026-10-03")!.toFixed(4)).toBe(80.1);
    expect(trendAt(t, "2026-09-30")).toBeUndefined();
  });

  it("adaptive kcal: expenditure = intake - trend change x 7700 / 14, +goal, change capped at 250", () => {
    const a = adaptiveKcal({ avgIntakeKcal: 2300, trendChange14Kg: -0.7, adjustmentKcal: -440, previousKcal: 2360 });
    expect(a.expenditure).toBeCloseTo(2685, 6);
    expect(a).toMatchObject({ kcal: 2250, change_kcal: -110, capped: false });
    expect(adaptiveKcal({ avgIntakeKcal: 2000, trendChange14Kg: 0, adjustmentKcal: -440, previousKcal: 2360 })).toMatchObject({ kcal: 2110, change_kcal: -250, wanted_change_kcal: -800, capped: true });
    expect(adaptiveKcal({ avgIntakeKcal: 2400, trendChange14Kg: -1.6, adjustmentKcal: -440, previousKcal: 2360 })).toMatchObject({ kcal: 2610, change_kcal: 250, capped: true });
    expect(adaptiveKcal({ avgIntakeKcal: 2830, trendChange14Kg: 0, adjustmentKcal: -440, previousKcal: 2360 })).toMatchObject({ kcal: 2360, change_kcal: 0, wanted_change_kcal: 30 });
  });

  it("reason codes follow the goal and the direction of the change", () => {
    expect(reasonCode("lose", -110)).toBe("LOSS_SLOWER_THAN_PLANNED");
    expect(reasonCode("lose", 100)).toBe("LOSS_FASTER_THAN_PLANNED");
    expect(reasonCode("gain", 100)).toBe("GAIN_SLOWER_THAN_PLANNED");
    expect(reasonCode("lose", 0)).toBe("ON_TRACK");
  });
});

describe("targets on the seed", () => {
  let url: string;
  let server: Server;
  beforeAll(async () => {
    await reset((await getDb()) as never);
    ({ url, server } = await listen(createApp(tools as never)));
  });
  afterAll(() => {
    server?.close();
    process.env.DEMO_MODE = "false";
  });

  it("the check-in after demo day (2026-10-24) trims 100-200 kcal: LOSS_SLOWER_THAN_PLANNED", async () => {
    const c = await runWeeklyCheckIn("2026-10-24");
    console.log("seed check-in 2026-10-24:", JSON.stringify(c));
    expect(c.previous_kcal).toBe(2360);
    expect(c.change_kcal).toBeLessThanOrEqual(-100);
    expect(c.change_kcal).toBeGreaterThanOrEqual(-200);
    expect(c.reason_codes).toEqual(["LOSS_SLOWER_THAN_PLANNED"]);
    expect(c.reason).toMatchObject({ code: "LOSS_SLOWER_THAN_PLANNED", planned_kg: -0.4 });
    expect(c.reason.actual_kg).toBeGreaterThan(-0.4);
    const rows = await query<{ kcal: number; reason_codes: string[]; source: string }>(sql`SELECT kcal, reason_codes, source FROM targets WHERE effective_date = '2026-10-24'`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kcal: c.kcal, source: "weekly", reason_codes: c.reason_codes });
    // rerun is idempotent
    expect((await runWeeklyCheckIn("2026-10-24")).kcal).toBe(c.kcal);
  });

  it("set_goals and log_bodyweight over MCP: valid output, under 500 ms", async () => {
    process.env.DEMO_MODE = "true";
    const { client } = await connect(url);
    let t0 = performance.now();
    const g = await client.callTool({ name: "set_goals", arguments: { goal: "lose", rate_kg_per_week: 0.5 } });
    const gMs = performance.now() - t0;
    expect(g.isError).toBeFalsy();
    const gs = set_goals.output.parse(g.structuredContent);
    expect(gs).toMatchObject({ date: "2026-10-23", effective_date: "2026-10-23", goal: "lose", rate_kg_per_week: 0.5 });
    expect(gs.previous_targets?.kcal).toBe(2360);
    expect(gs.eaten.kcal).toBeGreaterThan(0); // demo-day breakfast
    expect((g._meta as any).ui.resourceUri).toBe("ui://cards/rings");
    t0 = performance.now();
    const b = await client.callTool({ name: "log_bodyweight", arguments: { kg: 81.8 } });
    const bMs = performance.now() - t0;
    expect(b.isError).toBeFalsy();
    const bs = log_bodyweight.output.parse(b.structuredContent);
    expect(bs).toMatchObject({ date: "2026-10-23", kg: 81.8 });
    expect(bs.weekly_change_kg).toBeLessThan(0);
    console.log(`set_goals ${Math.round(gMs)} ms: ${(g.content as any)[0].text}`);
    console.log(`log_bodyweight ${Math.round(bMs)} ms: ${(b.content as any)[0].text}`);
    expect(gMs).toBeLessThan(500);
    expect(bMs).toBeLessThan(500);
    await client.close();
  });
});
