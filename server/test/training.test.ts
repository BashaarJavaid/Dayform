// T-23: resolver, PR detection and progress on the seed (reset into the test database), tools through MCP.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { get_progress, log_workout } from "@dayform/contracts";
import { reset } from "../../db/src/reset.ts";
import { createApp } from "../src/app.ts";
import { loadTools } from "../src/core/registry.ts";
import { getDb } from "../src/core/db.ts";
import { detectPRs, e1rm, resolveExercise } from "../src/domain/training/index.ts";
import { connect, listen } from "./helpers.ts";

let url: string;
let server: Server;
beforeAll(async () => {
  process.env.DEMO_MODE = "true";
  await reset((await getDb()) as never);
  ({ url, server } = await listen(createApp(await loadTools())));
});
afterAll(() => {
  server.close();
  delete process.env.DEMO_MODE;
});

const call = async (name: string, args: Record<string, unknown>) => {
  const { client } = await connect(url);
  const t0 = performance.now();
  const r = await client.callTool({ name, arguments: args });
  const ms = performance.now() - t0;
  await client.close();
  return { r: r as { isError?: boolean; structuredContent?: any; content: { text: string }[]; _meta?: any }, ms };
};

describe("training: exercise resolver", () => {
  it.each(["bench", "flat bench", "barbell bench", "Bench Press!", "barbell bench press"])("%s → barbell bench press", async (s) => {
    expect((await resolveExercise(s)).exercise?.id).toBe("barbell-bench-press");
  });
  it("handles plurals and near misses", async () => {
    expect((await resolveExercise("squats")).exercise?.id).toBe("barbell-back-squat");
    expect((await resolveExercise("lateral raise")).exercise?.id).toBe("lateral-raise");
    expect((await resolveExercise("goblet squads")).exercise?.id).toBe("goblet-squat");
  });
  it("returns the 3 closest names when nothing matches", async () => {
    const r = await resolveExercise("zumba");
    expect(r.exercise).toBeNull();
    expect(r.suggestions).toHaveLength(3);
  });
});

describe("training: PR detection on the seed", () => {
  it("Epley", () => {
    expect(e1rm(80, 8)).toBe(101.3);
    expect(e1rm(80, 6)).toBe(96);
  });
  it("S3: 80×8 bench beats the 98.7 e1RM and the 77.5 kg 8-rep best", async () => {
    expect(await detectPRs({ exercise_id: "barbell-bench-press", weight_kg: 80, reps: 8 })).toEqual({
      pr_e1rm: true, pr_rep_best: true, e1rm_kg: 101.3, previous_e1rm_kg: 98.7, previous_rep_best_kg: 77.5,
    });
  });
  it("80×7 equals the best: no PR", async () => {
    const c = await detectPRs({ exercise_id: "barbell-bench-press", weight_kg: 80, reps: 7 });
    expect([c.pr_e1rm, c.pr_rep_best]).toEqual([false, false]);
  });
  it("over 12 reps: rep-best only, never e1RM", async () => {
    const c = await detectPRs({ exercise_id: "barbell-bench-press", weight_kg: 70, reps: 15 });
    expect(c.pr_e1rm).toBe(false); // e1RM 105 would beat 98.7, but 15 reps is out of range
    expect(c.pr_rep_best).toBe(false); // no earlier 15-rep set to beat
  });
  it("first set of an exercise never flags", async () => {
    const c = await detectPRs({ exercise_id: "front-squat", weight_kg: 60, reps: 5 });
    expect([c.pr_e1rm, c.pr_rep_best, c.previous_e1rm_kg]).toEqual([false, false, null]);
  });
});

describe("training: tools", () => {
  it("get_progress bench: 6 weekly points, rising 88.7 → 98.7, card attached, under 500 ms", async () => {
    const { r, ms } = await call("get_progress", { metric: "e1rm", exercise: "bench" });
    expect(r.isError).toBeFalsy();
    const out = get_progress.output.parse(r.structuredContent);
    expect(out.series.map((p) => p.value)).toEqual([88.7, 91.8, 92.5, 95, 98.2, 98.7]);
    expect(out.series[0].date).toBe("2026-09-11");
    expect(out.summary).toEqual({ start: 88.7, end: 98.7, change: 10, change_pct: 11.3 });
    expect(r._meta.ui.resourceUri).toBe("ui://cards/progress");
    expect(ms).toBeLessThan(500);
  });

  it("get_progress bodyweight and calories", async () => {
    const bw = get_progress.output.parse((await call("get_progress", { metric: "bodyweight" })).r.structuredContent);
    expect(bw.series).toHaveLength(6);
    expect(bw.summary.change).toBeLessThan(0);
    const kcal = get_progress.output.parse((await call("get_progress", { metric: "calories" })).r.structuredContent);
    expect(kcal.unit).toBe("kcal");
    expect(kcal.series.every((p) => p.value > 2000 && p.value < 2600)).toBe(true);
  });

  it("log_workout 80×8,8,7 bench: PR on set 1 only, pr card, under 500 ms; progress then ends at 101.3", async () => {
    const { r, ms } = await call("log_workout", { exercise: "flat bench", sets: [{ reps: 8, weight_kg: 80 }, { reps: 8, weight_kg: 80 }, { reps: 7, weight_kg: 80 }] });
    expect(r.isError).toBeFalsy();
    const out = log_workout.output.parse(r.structuredContent);
    expect(out.exercise).toBe("Barbell bench press");
    expect(out.date).toBe("2026-10-23");
    expect(out.volume_kg).toBe(80 * 23);
    expect(out.prs.map((p) => [p.kind, p.e1rm_kg, p.previous_e1rm_kg, p.change_kg])).toEqual([
      ["e1rm", 101.3, 98.7, 2.6],
      ["rep_best", 101.3, 98.2, 3.1],
    ]);
    expect(r._meta.ui.resourceUri).toBe("ui://cards/pr");
    expect(ms).toBeLessThan(500);
    const p = get_progress.output.parse((await call("get_progress", { metric: "e1rm", exercise: "bench" })).r.structuredContent);
    expect(p.series.map((x) => x.value)).toEqual([91.8, 92.5, 95, 98.2, 98.7, 101.3]);
  });

  it("log_workout without a PR, cardio, and an unknown exercise", async () => {
    const plain = log_workout.output.parse((await call("log_workout", { exercise: "bench", sets: [{ reps: 5, weight_kg: 60 }] })).r.structuredContent);
    expect(plain.prs).toEqual([]);
    const run = log_workout.output.parse((await call("log_workout", { exercise: "running", cardio: { type: "run", duration_min: 28, distance_km: 5 } })).r.structuredContent);
    expect(run).toMatchObject({ exercise: "Treadmill run", sets: [], cardio: { duration_min: 28, distance_km: 5 } });
    const bad = (await call("log_workout", { exercise: "zumba", sets: [{ reps: 5 }] })).r;
    expect(bad.isError).toBe(true);
    expect(bad.content[0].text).toMatch(/^No exercise matches "zumba"\. Closest: .+, .+, .+\.$/);
  });
});
