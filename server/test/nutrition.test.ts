// T-22: log_meal (S1), correct_meal (S2), unknown dish (real Bedrock estimate), water, duplicate guard, summary.
// Runs against the test database reset to the seed state (demo clock 13:00 on 2026-10-23 Asia/Karachi).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Server } from "node:http";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { correct_meal, get_daily_summary, log_meal, log_water } from "@dayform/contracts";
import { connect as dbConnect } from "@dayform/db";
import { reset } from "../../db/src/reset.ts";
import { createApp } from "../src/app.ts";
import { tools } from "../src/tools/nutrition/index.ts";
import { query } from "../src/core/db.ts";
import { sql } from "drizzle-orm";
import { connect, listen } from "./helpers.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const foods = new Map<string, any>(JSON.parse(readFileSync(`${root}data/foods/foods.json`, "utf8")).map((f: any) => [f.id, f]));
/** The food-table maths, independent of food-search: per-100 g nutrients × grams (kcal whole, grams to 0.1). */
function tableItem(id: string, portion: string, qty: number) {
  const f = foods.get(id);
  const g = Math.round(f.portions[portion] * qty);
  const n = (k: string) => (k === "kcal" ? Math.round((f.nutrients[k] * g) / 100) : Math.round((f.nutrients[k] * g) / 10) / 10);
  return { g, kcal: n("kcal"), protein_g: n("protein_g"), carbs_g: n("carbs_g"), fat_g: n("fat_g") };
}
const sum = (xs: any[], k: string) => Math.round(xs.reduce((s, x) => s + x[k], 0) * 10) / 10;

let server: Server;
let client: Client;
const call = async (name: string, args: Record<string, unknown>) => {
  const t0 = performance.now();
  const r: any = await client.callTool({ name, arguments: args }, undefined, { timeout: 60_000 });
  return { ...r, ms: Math.round(performance.now() - t0) };
};

beforeAll(async () => {
  process.env.DEMO_MODE = "true";
  const [{ n }] = await query<{ n: number }>(sql`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = 'food_terms'`);
  const [{ c }] = n ? await query<{ c: number }>(sql`SELECT count(*)::int AS c FROM foods`) : [{ c: 0 }];
  if (c !== foods.size) execFileSync("npx", ["tsx", "packages/food-search/src/load.ts"], { cwd: root, env: process.env, stdio: "inherit" });
  const { db, close } = await dbConnect("pg");
  await reset(db);
  await close();
  const app = createApp(tools as never);
  let url: string;
  ({ url, server } = await listen(app));
  ({ client } = await connect(url));
}, 120_000);
afterAll(async () => {
  await client?.close();
  server?.close();
});

describe("nutrition", () => {
  let s1: any;
  const roti2 = tableItem("roti", "roti", 2);
  const karahi = tableItem("chicken-karahi", "plate", 1);
  const lassi = tableItem("mango-lassi", "glass", 1);

  it("S1: 3 confident matches, karahi and lassi assumptions, totals equal the food-table maths, lunch by clock", async () => {
    const before = (await call("get_daily_summary", {})).structuredContent;
    expect(before.date).toBe("2026-10-23");
    expect(before.meals).toHaveLength(1); // the seeded breakfast
    s1 = await call("log_meal", { items: [{ food: "roti", quantity: 2 }, { food: "chicken karahi" }, { food: "mango lassi" }] });
    expect(s1.isError).toBeFalsy();
    const out = log_meal.output.parse(s1.structuredContent);
    console.log(`S1 log_meal ${s1.ms} ms:`, s1.content[0].text);
    expect(out.entry.meal).toBe("lunch");
    expect(out.entry.items.map((i) => [i.food, i.grams, i.estimated, i.assumed])).toEqual([
      ["Roti (chapati)", roti2.g, false, false],
      ["Chicken karahi", karahi.g, false, true],
      ["Mango lassi", lassi.g, false, true],
    ]);
    const expected = [roti2, karahi, lassi];
    expect(out.entry.totals).toEqual({ kcal: sum(expected, "kcal"), protein_g: sum(expected, "protein_g"), carbs_g: sum(expected, "carbs_g"), fat_g: sum(expected, "fat_g") });
    expect(out.assumptions).toEqual(["Assumed 1 plate of chicken karahi = 250 g.", "Assumed 1 glass of mango lassi = 300 g."]);
    // Day = seeded breakfast + S1; remaining = targets − eaten.
    expect(out.day.eaten.kcal).toBe(before.eaten.kcal + out.entry.totals.kcal);
    expect(out.day.remaining.kcal).toBe(out.day.targets.kcal - out.day.eaten.kcal);
    expect(out.day.targets.kcal).toBe(2360);
    expect(s1.content[0].text).toContain(`${out.entry.totals.kcal} kcal`);
    expect(s1._meta.ui.resourceUri).toBe("ui://cards/meal-logged");
  });

  it("duplicate guard: an identical log_meal within 10 s returns the same entry and stores nothing new", async () => {
    const again = await call("log_meal", { items: [{ food: "roti", quantity: 2 }, { food: "chicken karahi" }, { food: "mango lassi" }] });
    expect(again.structuredContent.entry.id).toBe(s1.structuredContent.entry.id);
    const [{ n }] = await query<{ n: number }>(sql`SELECT count(*)::int AS n FROM meal_entries WHERE date = '2026-10-23'`);
    expect(n).toBe(2);
  });

  it("S2: 'make that one roti' drops exactly one roti from the meal and the day", async () => {
    const r = await call("correct_meal", { changes: [{ food: "roti", action: "set_quantity", quantity: 1 }] });
    expect(r.isError).toBeFalsy();
    const out = correct_meal.output.parse(r.structuredContent);
    console.log(`S2 correct_meal ${r.ms} ms:`, r.content[0].text);
    const roti1 = tableItem("roti", "roti", 1);
    const prev = s1.structuredContent;
    expect(out.entry.id).toBe(prev.entry.id);
    expect(out.entry.items.find((i) => i.food === "Roti (chapati)")).toMatchObject({ quantity: 1, grams: roti1.g, assumed: false });
    expect(out.entry.totals.kcal).toBe(prev.entry.totals.kcal - roti2.kcal + roti1.kcal);
    expect(out.day.eaten.kcal).toBe(prev.day.eaten.kcal - roti2.kcal + roti1.kcal);
    expect(out.changes_applied).toHaveLength(1);
  });

  it("correct_meal remove and an unknown food return a plain error, not a crash", async () => {
    const r = await call("correct_meal", { changes: [{ food: "pizza", action: "remove" }] });
    expect(r).toMatchObject({ isError: true, content: [{ text: "There is no pizza in that meal." }] });
    const rm = await call("correct_meal", { changes: [{ food: "lassi", action: "remove" }] });
    expect(rm.structuredContent.entry.items.map((i: any) => i.food)).toEqual(["Roti (chapati)", "Chicken karahi"]);
  });

  it("unknown dish: estimated by the reasoning model, marked estimated, latency recorded", async () => {
    const r = await call("log_meal", { items: [{ food: "grandma's special pulao" }], meal: "dinner" });
    expect(r.isError, r.content?.[0]?.text).toBeFalsy();
    const out = log_meal.output.parse(r.structuredContent);
    console.log(`unknown dish log_meal ${r.ms} ms:`, r.content[0].text, JSON.stringify(out.entry.items[0]));
    expect(out.entry.items[0]).toMatchObject({ estimated: true, assumed: true });
    expect(out.entry.items[0].macros.kcal).toBeGreaterThan(100);
    expect(out.assumptions.some((a) => a.startsWith("Estimated grandma's special pulao"))).toBe(true);
    const [row] = await query<any>(sql`SELECT estimated, food_id FROM meal_items WHERE entry_id = ${Number(out.entry.id)}`);
    expect(row).toMatchObject({ estimated: true, food_id: null });
  }, 60_000);

  it("water: 2 glasses = 500 ml added to today, rings card", async () => {
    const r = await call("log_water", { glasses: 2 });
    const out = log_water.output.parse(r.structuredContent);
    expect(out).toMatchObject({ added_ml: 500, date: "2026-10-23" });
    expect(out.eaten.water_ml).toBe(500); // no water seeded on demo day
    const r2 = await call("log_water", { ml: 330 });
    expect(r2.structuredContent.eaten.water_ml).toBe(830);
    expect(r2._meta.ui.resourceUri).toBe("ui://cards/rings");
    expect((await call("log_water", {})).isError).toBe(true);
  });

  it("get_daily_summary lists the meals and matches the rings", async () => {
    const r = await call("get_daily_summary", {});
    const out = get_daily_summary.output.parse(r.structuredContent);
    expect(out.meals.map((m) => m.meal)).toEqual(["breakfast", "lunch", "dinner"]);
    expect(out.eaten.kcal).toBe(out.meals.reduce((s, m) => s + m.totals.kcal, 0));
    expect(out.eaten.water_ml).toBe(830);
    const past = (await call("get_daily_summary", { date: "2026-10-20" })).structuredContent;
    expect(past.meals.length).toBeGreaterThanOrEqual(3);
  });
});
