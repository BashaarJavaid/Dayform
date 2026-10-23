// T-25: grocery maths, catalog-only plans, code-computed totals, and plan_meal_prep over MCP (fast path and the
// constraints path). The model is replaced by a fixed draft here; the live runs are in the bench (bench-log.md).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { sql } from "drizzle-orm";
import { MealPlan, plan_meal_prep } from "@dayform/contracts";
import type { StructuredRequest } from "../src/core/llm.ts";

const draft = (noChicken: boolean) => {
  const protein = noChicken ? "canned-tuna" : "chicken-breast-frozen";
  return {
    recipes: [
      { id: "r1", name: "Protein oats", ingredients: [{ item: "oats", grams: 80 }, { item: "whey-protein", grams: 40 }, { item: "milk", grams: 250 }], steps: ["Mix and chill."] },
      { id: "r2", name: noChicken ? "Tuna karahi with rice" : "Chicken karahi with rice", ingredients: [{ item: protein, grams: 200 }, { item: "basmati-rice", grams: 90 }, { item: "canned-tomatoes", grams: 100 }, { item: "ginger-garlic-paste", grams: 10 }, { item: "garam-masala", grams: 2 }, { item: "ghee", grams: 8 }], steps: ["Cook."] },
      { id: "r3", name: "Daal chawal", ingredients: [{ item: "red-lentils", grams: 80 }, { item: "basmati-rice", grams: 70 }, { item: "canned-tomatoes", grams: 80 }, { item: "ghee", grams: 8 }], steps: ["Cook."] },
      { id: "r4", name: "Peanut butter rice cakes", ingredients: [{ item: "rice-cakes", grams: 30 }, { item: "peanut-butter", grams: 20 }], steps: ["Spread."] },
    ],
    day_menus: [{ breakfast: "r1", lunch: "r2", dinner: "r3", snack: "r4" }, { breakfast: "r1", lunch: "r3", dinner: "r2", snack: "r4" }],
    batch_cook: { total_minutes: 90, steps: ["Cook rice and daal.", "Cook the karahi.", "Box and refrigerate."] },
  };
};
const prompts: string[] = [];
const fakeLlm = vi.fn(async (req: StructuredRequest<never>) => {
  prompts.push(req.prompt);
  await new Promise((r) => setTimeout(r, 50));
  return { data: (req.schema as any).parse(draft(/no chicken/.test(req.prompt))), model: "fake", ms: 50, inputTokens: 0, outputTokens: 0, attempts: 1 };
});
vi.mock("../src/core/llm.ts", async (orig) => ({ ...(await orig<object>()), structured: (req: never) => fakeLlm(req) }));

const { reset } = await import("../../db/src/reset.ts");
const { createApp } = await import("../src/app.ts");
const { loadTools } = await import("../src/core/registry.ts");
const { getDb, query } = await import("../src/core/db.ts");
const { draftSchema, excludedWords, generatePlan, groceryList, loadCatalog, planItems, recipeMacros } = await import("../src/domain/meal-prep/plan.ts");
const { ensureFreshPlan, pending } = await import("../src/domain/meal-prep/store.ts");
const { connect, listen } = await import("./helpers.ts");

const targets = { kcal: 2360, protein_g: 165, carbs_g: 277, fat_g: 66 };
const ids = new Set(loadCatalog().map((c) => c.id));

describe("grocery maths", () => {
  it("sums grams over servings, rounds up to packs, prices them", () => {
    const g = groceryList([
      { servings: 4, ingredients: [{ catalog_item_id: "chicken-breast-frozen", grams: 300 }, { catalog_item_id: "basmati-rice", grams: 90 }] },
      { servings: 4, ingredients: [{ catalog_item_id: "chicken-breast-frozen", grams: 100 }] },
    ]);
    const chicken = g.lines.find((l) => l.catalog_item_id === "chicken-breast-frozen")!;
    expect(chicken).toMatchObject({ grams_needed: 1600, packs: 2, unit_price_usd: 10.04, line_total_usd: 20.08 }); // 1600 / 1134 g
    expect(g.lines.find((l) => l.catalog_item_id === "basmati-rice")).toMatchObject({ grams_needed: 360, packs: 1, line_total_usd: 8.88 });
    expect(g).toMatchObject({ packs: 3, total_usd: 28.96 });
    // exactly one pack's worth stays one pack
    expect(groceryList([{ servings: 1, ingredients: [{ catalog_item_id: "chicken-breast-frozen", grams: 1134 }] }]).lines[0].packs).toBe(1);
  });
});

describe("generator (fixed draft)", () => {
  it("rejects a catalog id that is not in the catalog", () => {
    const bad = draft(false);
    bad.recipes[0].ingredients[0].item = "mango-chutney";
    expect(draftSchema([...ids]).safeParse(bad).success).toBe(false);
  });

  it("plans from available catalog items only; 'no chicken' removes chicken", () => {
    expect(planItems().every((c) => c.available)).toBe(true);
    expect(planItems().some((c) => c.id === "eggs")).toBe(false); // refrigerated: did not land in the cart test
    expect(excludedWords("No chicken, and without ghee")).toEqual(["chicken", "ghee"]);
    expect(planItems("no chicken").some((c) => c.id.includes("chicken"))).toBe(false);
  });

  it("every ingredient is a catalog item, totals are code-computed, every day within tolerance", async () => {
    const g = await generatePlan({ startDate: "2026-10-24", days: 4, targets, llm: fakeLlm as never });
    expect(MealPlan.safeParse(g.plan).success).toBe(true);
    expect(g.plan.days.map((d) => d.date)).toEqual(["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"]);
    const byId = new Map(loadCatalog().map((c) => [c.id, c]));
    for (const r of g.plan.recipes) for (const i of r.ingredients) expect(ids.has(i.catalog_item_id)).toBe(true);
    // Recompute each day from the ingredient grams: matches the plan's totals within 1%.
    const recipes = new Map(g.plan.recipes.map((r) => [r.id, recipeMacros({ ings: r.ingredients.map((i) => ({ item: byId.get(i.catalog_item_id)!, grams: i.grams })) })]));
    for (const d of g.plan.days) {
      const kcal = d.meals.reduce((s, m) => s + recipes.get(m.recipe_id)!.kcal, 0);
      const protein = d.meals.reduce((s, m) => s + recipes.get(m.recipe_id)!.protein_g, 0);
      expect(Math.abs(kcal - d.totals.kcal) / kcal).toBeLessThan(0.01);
      expect(Math.abs(protein - d.totals.protein_g) / protein).toBeLessThan(0.01);
      expect(Math.abs(d.totals.kcal - targets.kcal) / targets.kcal).toBeLessThanOrEqual(0.05);
      expect(d.totals.protein_g).toBeGreaterThanOrEqual(0.95 * targets.protein_g);
    }
    expect(g).toMatchObject({ within_tolerance: true, rounds: 1, misses: [] });
    // Grocery grams = sum over servings
    const rice = g.plan.recipes.reduce((s, r) => s + r.servings * (r.ingredients.find((i) => i.catalog_item_id === "basmati-rice")?.grams ?? 0), 0);
    expect(g.plan.grocery.find((x) => x.catalog_item_id === "basmati-rice")!.grams_needed).toBe(rice);
  });

  it("sends the exact misses back and keeps the best plan after 3 rounds", async () => {
    const tight = vi.fn(async (req: StructuredRequest<never>) => {
      prompts.push(req.prompt);
      const d = draft(false);
      d.recipes = d.recipes.map((r) => ({ ...r, ingredients: [{ item: "canned-tomatoes", grams: 100 }] })); // can never reach the targets
      return { data: d, model: "fake", ms: 1, inputTokens: 0, outputTokens: 0, attempts: 1 };
    });
    prompts.length = 0;
    const g = await generatePlan({ startDate: "2026-10-24", days: 4, targets, llm: tight as never });
    expect(tight).toHaveBeenCalledTimes(3);
    expect(prompts[1]).toMatch(/day 1: kcal \d+, target 2360 \(within ±5%\)/);
    expect(g.within_tolerance).toBe(false);
    expect(g.plan.days.every((d) => !d.within_tolerance)).toBe(true);
  });

  it("more than 12 catalog items is a miss sent back, naming the least-used items", async () => {
    let n = 0;
    const wide = vi.fn(async (req: StructuredRequest<never>) => {
      prompts.push(req.prompt);
      const d = draft(false);
      if (n++ === 0) d.recipes[3].ingredients.push({ item: "honey", grams: 5 }, { item: "olive-oil", grams: 3 }, { item: "turmeric", grams: 1 });
      return { data: d, model: "fake", ms: 1, inputTokens: 0, outputTokens: 0, attempts: 1 };
    });
    prompts.length = 0;
    const g = await generatePlan({ startDate: "2026-10-24", days: 4, targets, llm: wide as never });
    expect(wide).toHaveBeenCalledTimes(2);
    expect(prompts[1]).toMatch(/plan uses 15 items, max 12; drop the least-used ones \(/);
    expect(g).toMatchObject({ within_tolerance: true, rounds: 2, misses: [] });
    expect(g.plan.grocery.length).toBeLessThanOrEqual(12);
  });
});

describe("plan_meal_prep over MCP", () => {
  let url: string;
  let server: Server;
  beforeAll(async () => {
    process.env.DEMO_MODE = "true";
    await reset((await getDb()) as never);
    ({ url, server } = await listen(createApp(await loadTools())));
  });
  afterAll(() => server.close());

  const call = async (args: Record<string, unknown>) => {
    const { client } = await connect(url);
    const t0 = performance.now();
    const r = (await client.callTool({ name: "plan_meal_prep", arguments: args })) as { isError?: boolean; structuredContent?: any; content: { text: string }[] };
    const ms = performance.now() - t0;
    await client.close();
    expect(r.isError).toBeFalsy();
    expect(plan_meal_prep.output.safeParse(r.structuredContent).success).toBe(true);
    return { r, ms };
  };

  it("fresh plan (overnight helper) comes back in under 500 ms; constraints -> preparing, then the plan without chicken", async () => {
    const fresh = await ensureFreshPlan("2026-10-24");
    expect(fresh.status).toBe("ready");
    const a = await call({});
    expect(a.r.structuredContent.status).toBe("ready");
    expect(a.r.structuredContent.plan.plan_id).toBe(fresh.plan!.plan_id);
    expect(a.ms).toBeLessThan(500);
    expect(a.r.content[0].text).toMatch(/4-day meal-prep plan from Oct 24.*Groceries: \d+ items, about \$\d+/);

    const calls = fakeLlm.mock.calls.length;
    const b = await call({ constraints: "No chicken" });
    expect(b.r.structuredContent).toMatchObject({ status: "preparing", plan: null });
    expect(b.ms).toBeLessThan(500);
    const again = await call({ constraints: "no chicken" });
    expect(again.r.structuredContent.status).toBe("preparing"); // still running
    await Promise.all(pending.values());
    expect(fakeLlm.mock.calls.length).toBe(calls + 1);

    const c = await call({ constraints: "no chicken" });
    expect(c.r.structuredContent.status).toBe("ready");
    const names = c.r.structuredContent.plan.recipes.flatMap((r: any) => [r.name, ...r.ingredients.map((i: any) => i.catalog_item_id)]);
    expect(names.join(" ")).not.toMatch(/chicken/i);
    expect(c.ms).toBeLessThan(500);
    // Without constraints, the newest ready plan is the no-chicken one.
    expect((await call({})).r.structuredContent.plan.plan_id).toBe(c.r.structuredContent.plan.plan_id);
    const [row] = await query<{ n: number }>(sql`SELECT count(*)::int AS n FROM meal_plans WHERE status = 'ready'`);
    expect(Number(row.n)).toBe(2);
  });
});
