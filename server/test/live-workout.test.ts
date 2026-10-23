// T-24: the live session through MCP on the seed (reset into the test database): S3, resume, swaps, progression.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { finish_workout, log_set, start_workout, swap_exercise } from "@dayform/contracts";
import { reset } from "../../db/src/reset.ts";
import { createApp } from "../src/app.ts";
import { loadTools } from "../src/core/registry.ts";
import { getDb, schema } from "../src/core/db.ts";
import { clock } from "../src/core/clock.ts";
import { chooseSwap, progress } from "../src/domain/session/index.ts";
import { connect, listen } from "./helpers.ts";

const BENCH = "Barbell bench press";
let url: string;
let server: Server;
beforeAll(async () => {
  process.env.DEMO_MODE = "true";
  await reset((await getDb()) as never);
  await clock.setRestSeconds(10);
  ({ url, server } = await listen(createApp(await loadTools())));
});
afterAll(() => {
  server.close();
  delete process.env.DEMO_MODE;
});

type R = { isError?: boolean; structuredContent?: any; content: { text: string }[]; _meta?: any };
const session = async () => {
  const { client, transport } = await connect(url);
  return {
    client,
    transport,
    call: async (name: string, args: Record<string, unknown> = {}) => {
      const t0 = performance.now();
      const r = (await client.callTool({ name, arguments: args })) as R;
      const ms = performance.now() - t0;
      expect(ms, `${name} ${Math.round(ms)} ms`).toBeLessThan(500);
      return r;
    },
  };
};

describe("live workout: the S3 sequence on the seed", () => {
  it("start → log_set (PR) → swap overhead press (shoulder) → new MCP session log_set → finish (1 PR)", async () => {
    const a = await session();
    const start = await a.call("start_workout");
    expect(start.isError).toBeFalsy();
    const s = start_workout.output.parse(start.structuredContent);
    expect(s.day_name).toBe("Push day");
    expect(s.exercise).toBe(BENCH);
    expect(s.plan[0]).toMatchObject({ target_weight_kg: 80, target_reps: 8, sets: 3 });
    expect(s.plan.map((p) => `${p.target_weight_kg}x${p.target_reps}`)).toEqual(["80x8", "52.5x6", "30x8", "13x12", "32.5x10"]);
    expect(s).toMatchObject({ exercise_index: 1, set_number: 1, set_count: 3, target: { weight_kg: 80, reps: 8 }, rest_seconds: 0, done_sets: [] });
    expect(start._meta.ui.resourceUri).toContain("workout");

    const set1 = log_set.output.parse((await a.call("log_set", { reps: 8 })).structuredContent);
    expect(set1.is_pr).toBe(true);
    expect(set1.pr).toMatchObject({ kind: "e1rm", e1rm_kg: 101.3, previous_e1rm_kg: 98.7, change_kg: 2.6 });
    expect(set1.logged).toMatchObject({ set: 1, weight_kg: 80, reps: 8, exercise: s.exercise });
    expect(set1).toMatchObject({ rest_seconds: 10, set_number: 2, target: { weight_kg: 80, reps: 8 }, session_complete: false });
    expect(Date.parse(set1.rest_ends_at!) - Date.parse((await clock.now()).toISOString())).toBeLessThanOrEqual(10_000);
    expect(set1.done_sets).toHaveLength(1);

    const swap = swap_exercise.output.parse((await a.call("swap_exercise", { exercise: "overhead press", reason: "shoulder feels off" })).structuredContent);
    expect(swap.replaced).toBe("Overhead press");
    expect(swap.exercise).toBe("Landmine press");
    expect(swap.target).toEqual({ weight_kg: 32.5, reps: 6 }); // no history: 60% of 52.5 = 31.5 → 32.5
    expect(swap.exercise_index).toBe(2);
    await a.client.close();

    const b = await session(); // a simulator reconnect: new MCP session
    const set2 = log_set.output.parse((await b.call("log_set", { reps: 10 })).structuredContent);
    expect(set2.logged).toMatchObject({ set: 2, weight_kg: 80, reps: 10 });
    expect(set2.session_id).toBe(s.session_id);
    expect(set2.done_sets).toHaveLength(2);

    const fin = finish_workout.output.parse((await b.call("finish_workout")).structuredContent);
    expect(fin.session_id).toBe(s.session_id);
    expect(fin.prs).toHaveLength(1);
    expect(fin.prs[0]).toMatchObject({ exercise: s.exercise, weight_kg: 80, reps: 10, e1rm_kg: 106.7, previous_e1rm_kg: 98.7, change_kg: 8 });
    expect(fin.exercises).toEqual([{ exercise: s.exercise, sets: [{ set: 1, weight_kg: 80, reps: 8, rpe: null }, { set: 2, weight_kg: 80, reps: 10, rpe: null }] }]);
    expect(fin.total_volume_kg).toBe(1440);
    expect((await b.call("log_set", { reps: 5 })).isError).toBe(true); // nothing open any more
    await b.client.close();
  });

  it("start_workout resumes an open session instead of opening a second", async () => {
    const a = await session();
    const first = start_workout.output.parse((await a.call("start_workout", { day: "push" })).structuredContent);
    await a.call("log_set", { reps: 6 });
    await a.client.close();
    const b = await session();
    const again = start_workout.output.parse((await b.call("start_workout")).structuredContent);
    expect(again.session_id).toBe(first.session_id);
    expect(again.set_number).toBe(2);
    const db = await getDb();
    const [row] = await db.select().from(schema.workout_sessions).where((await import("drizzle-orm")).eq(schema.workout_sessions.id, first.session_id));
    expect(row.mcp_session_id).toBe(b.transport.sessionId);
    expect(row.mcp_session_id).toBeTruthy();
    await b.call("finish_workout");
    await b.client.close();
  });

  it("walks every set and moves to the next exercise, then completes", async () => {
    const a = await session();
    await a.call("start_workout", { day: "Leg day" });
    let r: any;
    for (let i = 0; i < 15; i++) r = log_set.output.parse((await a.call("log_set", { reps: 5 })).structuredContent);
    expect(r.session_complete).toBe(true);
    expect(r.rest_seconds).toBe(0);
    const third = await a.call("log_set", { reps: 5 });
    expect(third.isError).toBe(true);
    const fin = finish_workout.output.parse((await a.call("finish_workout")).structuredContent);
    expect(fin.exercises).toHaveLength(5);
    expect(fin.exercises.every((e) => e.sets.length === 3)).toBe(true);
    await a.client.close();
  });

  it("unknown day and swap of an exercise not in the plan are errors", async () => {
    const a = await session();
    expect((await a.call("start_workout", { day: "arms" })).isError).toBe(true);
    await a.call("start_workout", { day: "push" });
    const bad = await a.call("swap_exercise", { exercise: "squat" });
    expect(bad.isError).toBe(true);
    expect(bad.content[0].text).toContain("not in today's plan");
    await a.call("finish_workout");
    await a.client.close();
  });
});

describe("live workout: double progression", () => {
  const px = { reps_min: 6, reps_max: 8, increment_kg: 2.5 };
  it("inside the range: same weight, +1 rep on the best set", () => {
    expect(progress([{ weight_kg: 80, reps: 7 }, { weight_kg: 80, reps: 7 }, { weight_kg: 80, reps: 6 }], px)).toEqual({ weight_kg: 80, reps: 8 });
    expect(progress([{ weight_kg: 75, reps: 6 }, { weight_kg: 75, reps: 6 }], px)).toEqual({ weight_kg: 75, reps: 7 });
  });
  it("every set at the top: +increment, back to the bottom", () => {
    expect(progress([{ weight_kg: 100, reps: 8 }, { weight_kg: 100, reps: 8 }, { weight_kg: 100, reps: 8 }], px)).toEqual({ weight_kg: 102.5, reps: 6 });
  });
});

describe("live workout: swap rules", () => {
  const all = async () => (await getDb()).select().from(schema.exercises).orderBy(schema.exercises.id);
  const get = async (id: string) => (await all()).find((e) => e.id === id)!;
  it("no reason: the first alternative", async () => {
    expect(chooseSwap(await get("overhead-press"), await all(), { exclude: [] }).pick?.id).toBe("landmine-press");
  });
  it("shoulder skips overhead pressing", async () => {
    const r = chooseSwap(await get("dumbbell-shoulder-press"), await all(), { reason: "my shoulder hurts", exclude: [] });
    expect(r.pick?.id).not.toMatch(/overhead|shoulder-press/);
    expect(r.spares).toEqual(["shoulder"]);
  });
  it("knee skips squats, lunges and leg presses; none left for squat, so no pick", async () => {
    const r = chooseSwap(await get("leg-extension"), await all(), { reason: "knee is sore", exclude: [] });
    expect(r.pick).toBeNull(); // every quads exercise loads the knee
    const calf = chooseSwap(await get("leg-press-calf-raise"), await all(), { reason: "knee", exclude: [] });
    expect(calf.pick?.id).not.toMatch(/squat|lunge|leg-press$/);
  });
  it("back skips deadlifts and barbell rows", async () => {
    const r = chooseSwap(await get("barbell-row"), await all(), { reason: "lower back", exclude: [] });
    expect(r.pick?.id).not.toMatch(/deadlift|barbell-row/);
  });
  it("respects equipment and the exercises already in the plan", async () => {
    const ex = await get("overhead-press");
    expect(chooseSwap(ex, await all(), { equipment: "dumbbell", exclude: [] }).pick?.id).toBe("dumbbell-shoulder-press");
    expect(chooseSwap(ex, await all(), { exclude: ["landmine-press"] }).pick?.id).toBe("machine-shoulder-press");
  });
});
