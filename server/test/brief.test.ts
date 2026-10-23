// T-27: number checks, guardrails, a live-shaped run with a lying model (regenerate once, then drop),
// get_morning_brief over MCP against the database, and cached mode identical across resets.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { sql } from "drizzle-orm";
import { BriefCard } from "@dayform/contracts";

// The model: answers by tool name; `lie` makes every answer carry wrong numbers.
const llm = vi.hoisted(() => ({ lie: false, calls: [] as string[] }));
vi.mock("../src/core/llm.ts", () => ({
  structured: async (req: { name: string; prompt: string }) => {
    llm.calls.push(req.name);
    const facts = req.name === "write_brief" ? JSON.parse(req.prompt.split("\n")[1]) : null;
    const data =
      req.name === "explain_targets_change" ? { sentence: llm.lie ? "You lost 0.2 kg, so I trimmed 150 calories." : "You lost 0.3 kg this week instead of 0.4 kg, so I trimmed 110 calories." }
      : req.name === "review_targets" ? { targets: [{ exercise_id: "barbell-back-squat", weight_kg: llm.lie ? 120 : 102.5, reps: llm.lie ? 9 : 5, note: "ok" }] }
      : req.name === "write_brief" ? {
        greeting: "Good morning, Ali.",
        insight: llm.lie ? "Protein is 999 g on rest days." : `You average ${facts.insights.protein_training_g} g of protein on training days but ${facts.insights.protein_rest_g} g on rest days.`,
        yesterday: { kcal: facts.yesterday.eaten.kcal + (llm.lie ? 100 : 0), protein_g: facts.yesterday.eaten.protein_g, workout: facts.yesterday.workout },
        weight: facts.weight,
        today: { workout: facts.today.workout },
      }
      : (() => { throw new Error(`unexpected model call ${req.name}`); })();
    return { data, model: "mock", ms: 1, inputTokens: 0, outputTokens: 0, attempts: 1 };
  },
}));

const { createApp } = await import("../src/app.ts");
const { clock } = await import("../src/core/clock.ts");
const { getDb, query } = await import("../src/core/db.ts");
const { loadTools } = await import("../src/core/registry.ts");
const { eatenOn, targetsOn } = await import("../src/domain/targets/index.ts");
const { reset } = await import("../../db/src/reset.ts");
const O = await import("../src/tools/brief/overnight.ts");
const { connect, listen } = await import("./helpers.ts");

const DAY = "2026-10-24";
let base: string, url: string, server: Server;
const H = { "x-admin-token": "test-token" };

beforeAll(async () => {
  process.env.DEMO_MODE = "true";
  ({ base, url, server } = await listen(createApp(await loadTools())));
});
afterAll(() => {
  process.env.DEMO_MODE = "false";
  delete process.env.OVERNIGHT_MODE;
  server.close();
});

describe("number check", () => {
  it("accepts numbers at the precision written, rejects invented ones", () => {
    const allowed = [-0.28, -0.4, -110, 2360, 2250, 2337];
    expect(O.unknownNumbers("You lost 0.3 kg instead of 0.4 kg, so I trimmed 110 calories (2,360 to 2,250).", allowed)).toEqual([]);
    expect(O.unknownNumbers("You lost 0.28 kg", allowed)).toEqual([]);
    expect(O.unknownNumbers("You lost 0.2 kg, so I trimmed 150 calories.", allowed)).toEqual(["0.2", "150"]);
    expect(O.unknownNumbers("No numbers here.", allowed)).toEqual([]);
  });
});

describe("guardrails", () => {
  const px = { reps_min: 5, reps_max: 7 };
  const rule = { weight_kg: 100, reps: 5 };
  it("keeps a proposal inside ±5% and the rep range", () => {
    expect(O.enforceGuardrails(rule, { weight_kg: 102.5, reps: 6 }, px)).toEqual({ weight_kg: 102.5, reps: 6, clamped: false });
  });
  it("clamps load to ±5% (to 0.5 kg) and reps to the range", () => {
    expect(O.enforceGuardrails(rule, { weight_kg: 120, reps: 9 }, px)).toEqual({ weight_kg: 105, reps: 7, clamped: true });
    expect(O.enforceGuardrails(rule, { weight_kg: 80, reps: 2 }, px)).toEqual({ weight_kg: 95, reps: 5, clamped: true });
    expect(O.enforceGuardrails({ weight_kg: 13, reps: 12 }, { weight_kg: 20, reps: 12 }, { reps_min: 12, reps_max: 15 }).weight_kg).toBe(13.5);
  });
});

/** Every number on the card against the database. */
async function expectMatchesDb(b: BriefCard) {
  const y = "2026-10-23";
  const eaten = await eatenOn(y);
  const yt = (await targetsOn(y))!.numbers;
  const tt = (await targetsOn(DAY))!.numbers;
  expect(b.yesterday.eaten).toEqual({ kcal: eaten.kcal, protein_g: eaten.protein_g, carbs_g: eaten.carbs_g, fat_g: eaten.fat_g });
  expect(b.yesterday.targets).toEqual({ kcal: yt.kcal, protein_g: yt.protein_g, carbs_g: yt.carbs_g, fat_g: yt.fat_g });
  expect(b.today.targets).toEqual(tt);
  const [lead] = await query<{ weight_kg: number; reps: number }>(sql`SELECT weight_kg, reps FROM next_targets WHERE for_date = ${DAY}::date AND exercise_id = 'barbell-back-squat'`);
  expect(b.today.workout).toEqual({ day_name: "Legs", lead: { exercise: "Barbell back squat", weight_kg: Number(lead.weight_kg), reps: Number(lead.reps) } });
  expect(b.targets_change).toMatchObject({ previous_kcal: yt.kcal, kcal_delta: tt.kcal - yt.kcal });
  const [w] = await query<{ reason: string }>(sql`SELECT reason FROM targets WHERE effective_date = ${DAY}::date AND source = 'weekly'`);
  const m = w.reason.match(/trend (-?[\d.]+) kg this week against a plan of (-?[\d.]+) kg/)!;
  expect(b.weight).toEqual({ change_kg_week: Number(m[1]), planned_kg_week: Number(m[2]) });
}

describe("runOvernight (live, model mocked)", () => {
  it("runs the steps in order on the seed and stores a brief whose numbers match the database", async () => {
    await reset((await getDb()) as never);
    llm.lie = false;
    const r = await O.runOvernight(DAY);
    expect(r.steps.filter((s) => s.startsWith("step")).map((s) => s.slice(0, 8))).toEqual(["step 1/6", "step 2/6", "step 3/6", "step 4/6", "step 5/6", "step 6/6"]);
    expect(r.steps.at(-1)).toBe("step 6/6 brief saved");
    expect(r.checkIn?.change_kcal).toBe(-110);
    expect(r.brief.targets_change?.reason).toBe("You lost 0.3 kg this week instead of 0.4 kg, so I trimmed 110 calories.");
    expect(r.nextTargets[0]).toMatchObject({ exercise_id: "barbell-back-squat", weight_kg: 102.5, reps: 5 });
    await expectMatchesDb(r.brief);
  });

  it("a model that invents numbers: regenerates once, then drops the field (numbers from the database, text from code)", async () => {
    await reset((await getDb()) as never);
    llm.lie = true;
    llm.calls = [];
    const r = await O.runOvernight(DAY);
    llm.lie = false;
    expect(llm.calls.filter((c) => c === "write_brief")).toHaveLength(2);
    expect(llm.calls.filter((c) => c === "explain_targets_change")).toHaveLength(2);
    expect(r.steps.some((s) => /dropped .*yesterday\.kcal.*insight/.test(s))).toBe(true);
    expect(r.brief.insight).toBe(O.insightFallback(await O.insights(DAY)));
    expect(r.brief.targets_change?.reason).toBe(O.checkInFallback(r.checkIn!));
    // Guardrails: 120 kg x 9 proposed on a 102.5 x 5 rule (range 5-7) -> 107.5 x 7.
    expect(r.nextTargets[0]).toMatchObject({ weight_kg: 107.5, reps: 7 });
    expect(r.nextTargets[0].reason).toMatch(/clamped to guardrails/);
    await expectMatchesDb(r.brief);
  });
});

describe("cached mode + get_morning_brief", () => {
  async function take() {
    await reset((await getDb()) as never);
    const t0 = performance.now();
    const adv = await (await fetch(`${base}/admin/advance-day`, { method: "POST", headers: H })).json();
    const ms = performance.now() - t0;
    const { client } = await connect(url);
    const t1 = performance.now();
    const res = await client.callTool({ name: "get_morning_brief", arguments: {} });
    const toolMs = performance.now() - t1;
    await client.close();
    return { adv, ms, toolMs, res };
  }

  it("advance-day serves the cache in under 1 s, the same brief after every reset, matching the database", async () => {
    process.env.OVERNIGHT_MODE = "cached";
    llm.calls = [];
    const a = await take();
    const b = await take();
    expect(llm.calls).toEqual([]);
    expect(a.adv).toMatchObject({ ok: true, clock: "2026-10-24T02:00:00.000Z", overnight: { mode: "cached" } });
    expect(a.adv.steps.at(-1)).toBe("brief saved");
    expect(a.ms).toBeLessThan(1000);
    expect(b.ms).toBeLessThan(1000);
    expect(a.toolMs).toBeLessThan(500);
    expect(a.res.structuredContent).toEqual(b.res.structuredContent);
    expect(a.res.content).toEqual(b.res.content);
    const cached = BriefCard.parse(O.readCache()!.briefs[0].brief);
    expect(a.res.structuredContent).toEqual(cached); // nothing logged since the seed: the overlay changes nothing
    await expectMatchesDb(a.res.structuredContent as BriefCard);
    expect((a.res.content as { text: string }[])[0].text).toMatch(/Today: Legs day, lead lift Barbell back squat 102.5 kg x 5/);
  });

  it("yesterday is re-read at call time, so food logged during the take shows on the card", async () => {
    await reset((await getDb()) as never);
    await query(sql`INSERT INTO meal_entries (id, eaten_at, date, meal_type) VALUES (9001, '2026-10-23T08:00:00Z', '2026-10-23', 'lunch')`);
    await query(sql`INSERT INTO meal_items (entry_id, name, quantity, unit, grams, kcal, protein_g, carbs_g, fat_g) VALUES (9001, 'test', 1, 'plate', 300, 700, 50, 60, 20)`);
    await fetch(`${base}/admin/advance-day`, { method: "POST", headers: H });
    const { client } = await connect(url);
    const res = await client.callTool({ name: "get_morning_brief", arguments: {} });
    await client.close();
    expect((res.structuredContent as BriefCard).yesterday.eaten.kcal).toBe(486 + 700);
    await expectMatchesDb(res.structuredContent as BriefCard);
  });

  it("no brief for today: a clear error", async () => {
    await clock.set(new Date("2026-10-30T07:00:00+05:00"));
    const { client } = await connect(url);
    const res = await client.callTool({ name: "get_morning_brief", arguments: {} });
    await client.close();
    expect(res.isError).toBe(true);
    expect((res.content as { text: string }[])[0].text).toMatch(/No morning brief for 2026-10-30/);
  });
});
