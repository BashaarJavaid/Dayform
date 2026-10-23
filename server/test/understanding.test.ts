// T-28: UNDERSTANDING=server through MCP on the seed. The LLM is mocked (canned parse per sentence, and the prompt is
// checked for the context it needs). T28_LIVE=1 runs the same sentences through one real Nova call each instead.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { add_to_cart, correct_meal, get_progress, log_meal, log_set } from "@dayform/contracts";
import { reset } from "../../db/src/reset.ts";
import { createApp } from "../src/app.ts";
import { loadTools } from "../src/core/registry.ts";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { getDb, query } from "../src/core/db.ts";
import { connect, listen } from "./helpers.ts";

const LIVE = process.env.T28_LIVE === "1";
const prompts: string[] = [];
const canned: Record<string, unknown> = {
  "I had two rotis, chicken karahi and a mango lassi for lunch": { items: [{ food: "roti", quantity: 2 }, { food: "chicken karahi" }, { food: "mango lassi" }], meal: "lunch" },
  "actually, make that one roti": { changes: [{ food: "roti", action: "set_quantity", quantity: 1 }] },
  "start my workout": {},
  "done, eight reps": { reps: 8 },
  "add two jars of peanut butter to my cart": { items: [{ name: "peanut butter", packs: 2 }] },
  "how's my bench press going?": { metric: "e1rm", exercise: "bench press" },
};
vi.mock("../src/core/llm.ts", async (orig) => {
  const real = await orig<typeof import("../src/core/llm.ts")>();
  if (process.env.T28_LIVE === "1") return real;
  return {
    ...real,
    structured: async (req: { prompt: string; schema: { parse: (x: unknown) => unknown } }) => {
      prompts.push(req.prompt);
      const said = /The user said: "(.*)"/.exec(req.prompt)![1];
      return { data: req.schema.parse(canned[said]), model: "mock", ms: 0, inputTokens: 0, outputTokens: 0, attempts: 1 };
    },
  };
});

let server: Server;
let client: Client;
const timings: Record<string, number> = {};
const say = async (name: string, text: string) => {
  const t0 = performance.now();
  const r: any = await client.callTool({ name, arguments: { text } }, undefined, { timeout: 60_000 });
  timings[name] = Math.round(performance.now() - t0);
  expect(r.isError, JSON.stringify(r.content)).toBeFalsy();
  return r;
};

beforeAll(async () => {
  process.env.DEMO_MODE = "true";
  process.env.UNDERSTANDING = "server";
  await reset((await getDb()) as never);
  const [{ c }] = await query<{ c: number }>(sql`SELECT count(*)::int AS c FROM foods`);
  if (!c) execFileSync("npx", ["tsx", "packages/food-search/src/load.ts"], { cwd: fileURLToPath(new URL("../../", import.meta.url)), env: process.env, stdio: "inherit" });
  let url: string;
  ({ url, server } = await listen(createApp(await loadTools())));
  ({ client } = await connect(url));
}, 120_000);
afterAll(async () => {
  console.log(`T-28 ${LIVE ? "live Nova" : "mocked LLM"} ms per call:`, timings);
  await client?.close();
  server?.close();
  delete process.env.UNDERSTANDING;
  delete process.env.DEMO_MODE;
});

describe(`understanding=server (${LIVE ? "live Nova" : "mocked LLM"})`, () => {
  it("tools/list: every tool takes one `text` field", async () => {
    const { tools } = await client.listTools();
    for (const t of tools) expect(Object.keys(t.inputSchema.properties ?? {}), t.name).toEqual(["text"]);
  });

  it("log_meal: the S1 sentence logs the same entry as alexa mode (904 kcal)", async () => {
    const r = log_meal.output.parse((await say("log_meal", "I had two rotis, chicken karahi and a mango lassi for lunch")).structuredContent);
    expect(r.entry.meal).toBe("lunch");
    expect(r.entry.items.map((i) => [i.food, i.quantity])).toEqual([["Roti (chapati)", 2], ["Chicken karahi", 1], ["Mango lassi", 1]]);
    expect(r.entry.totals.kcal).toBe(904);
    if (!LIVE) expect(prompts.at(-1)).toMatch(/Now: .*2026/);
  });

  it("correct_meal: 'make that one roti' changes the last meal", async () => {
    const r = correct_meal.output.parse((await say("correct_meal", "actually, make that one roti")).structuredContent);
    expect(r.entry.items.find((i) => /roti/i.test(i.food))?.quantity).toBe(1);
    if (!LIVE) expect(prompts.at(-1)).toMatch(/Last logged meal: entry_id \d+, lunch/);
  });

  it("log_set: 'done, eight reps' logs on the open workout", async () => {
    await say("start_workout", "start my workout");
    const r = log_set.output.parse((await say("log_set", "done, eight reps")).structuredContent);
    expect(r.logged.reps).toBe(8);
    if (!LIVE) expect(prompts.at(-1)).toMatch(/Open workout: Push day, current exercise Barbell bench press/);
  });

  it("add_to_cart: named items in packs", async () => {
    const r = add_to_cart.output.parse((await say("add_to_cart", "add two jars of peanut butter to my cart")).structuredContent);
    expect(r.added).toEqual([{ name: expect.stringMatching(/peanut butter/i), packs: 2 }]);
  });

  it("get_progress: a lift's e1rm series", async () => {
    const r = get_progress.output.parse((await say("get_progress", "how's my bench press going?")).structuredContent);
    expect(r.metric).toBe("e1rm");
    expect(r.series.length).toBeGreaterThan(0);
  });
});
