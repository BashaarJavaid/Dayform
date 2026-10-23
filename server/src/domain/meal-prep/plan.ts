// Meal-prep generator (T-25, D17, DESIGN §7). The reasoning model (Nova, D21) writes recipes and a day menu
// from catalog items only; code fits the grams to the targets, checks every day, and does the grocery maths.
import { readFileSync } from "node:fs";
import { z } from "zod";
import { Catalog, type CatalogItem, type Macros, type MealPlan } from "@dayform/contracts";
import { structured } from "../../core/llm.ts";

const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;
const MACROS = ["kcal", "protein_g", "carbs_g", "fat_g"] as const;
type M = (typeof MACROS)[number];
export const MAX_ROUNDS = 3;
/** Code may scale each ingredient between these multiples of the model's grams (ticket fallback 2, used by default). */
const SCALE = [0.5, 2] as const;
/** Share of the day's calories per meal (prompt and soft fitting term). */
const SHARE = { breakfast: 0.25, lunch: 0.3, dinner: 0.3, snack: 0.15 } as const;

export interface PlanItem extends CatalogItem {
  per100: Macros;
  available: boolean;
}

let items: PlanItem[] | undefined;
/** Catalog items with nutrients per 100 g from the food table (data/, the same files reset loads). */
export function loadCatalog(): PlanItem[] {
  if (items) return items;
  const read = (p: string) => JSON.parse(readFileSync(new URL(`../../../../data/${p}`, import.meta.url), "utf8"));
  const catalog = Catalog.parse(read("catalog/catalog.json"));
  const foods = new Map<string, { nutrients: Record<string, number> }>(read("foods/foods.json").map((f: { id: string }) => [f.id, f]));
  items = catalog.map((c) => {
    const n = foods.get(c.food_id)?.nutrients;
    if (!n) throw new Error(`catalog item ${c.id}: food ${c.food_id} is not in foods.json`);
    // Availability: T-13's per-item flag if present; else only shelf-stable items and frozen chicken landed in the
    // Add-to-Cart test (25 of 38 items; fresh and refrigerated ones did not), orchestrator 2026-10-22.
    const flag = (c as { available?: boolean }).available;
    const available = flag ?? (c.storage === "shelf_stable" || c.id === "chicken-breast-frozen");
    return { ...c, available, per100: { kcal: n.kcal, protein_g: n.protein_g, carbs_g: n.carbs_g, fat_g: n.fat_g } };
  });
  return items;
}

/** "no chicken", "without tuna, no ghee" -> words that rule out catalog items by id or name. */
export function excludedWords(constraints?: string): string[] {
  if (!constraints) return [];
  const out: string[] = [];
  for (const m of constraints.toLowerCase().matchAll(/\b(?:no|without|avoid|not|skip)\s+([a-z ]+?)(?=[,.;]|\band\b|$)/g))
    out.push(...m[1].trim().split(/\s+/).filter((w) => w.length > 2).map((w) => w.replace(/s$/, "")));
  return out;
}

export function planItems(constraints?: string): PlanItem[] {
  const words = excludedWords(constraints);
  return loadCatalog().filter((c) => c.available && !words.some((w) => `${c.id} ${c.name}`.toLowerCase().includes(w)));
}

// ---- What the model writes ----

export function draftSchema(ids: string[]) {
  return z.object({
    recipes: z
      .array(
        z.object({
          id: z.string().min(1).describe("Short id, e.g. r1."),
          name: z.string().min(1),
          ingredients: z
            .array(z.object({ item: z.enum(ids as [string, ...string[]]), grams: z.number().positive().describe("Raw, as-bought grams for ONE serving.") }))
            .min(1),
          steps: z.array(z.string().min(1)).min(1).max(6),
        }),
      )
      .min(3)
      .max(5),
    day_menus: z
      .array(z.object({ breakfast: z.string(), lunch: z.string(), dinner: z.string(), snack: z.string() }).describe("Recipe id per meal; one serving each."))
      .min(1)
      .max(2)
      .describe("1 or 2 day menus; the days alternate A, B, A, B."),
    batch_cook: z.object({
      total_minutes: z.number().int().positive(),
      steps: z.array(z.string().min(1)).min(2).max(10).describe("One cooking session, in order; end with how to store the boxes."),
    }),
  });
}
export type Draft = z.infer<ReturnType<typeof draftSchema>>;

// ---- Code: nutrients, fitting, checks ----

const zero = (): Macros => ({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
const add = (a: Macros, b: Macros, k = 1) => {
  for (const m of MACROS) a[m] += b[m] * k;
  return a;
};
const round = (x: Macros): Macros => ({ kcal: Math.round(x.kcal), protein_g: Math.round(x.protein_g), carbs_g: Math.round(x.carbs_g), fat_g: Math.round(x.fat_g) });

type Ing = { item: PlanItem; grams: number; lo: number; hi: number };
type Rec = { id: string; name: string; steps: string[]; ings: Ing[] };

export const recipeMacros = (r: { ings: { item: PlanItem; grams: number }[] }) =>
  r.ings.reduce((t, i) => add(t, i.item.per100, i.grams / 100), zero());

/** Distinct day menus as recipe-id lists (one serving per meal). */
const dayTotals = (menu: string[], recs: Map<string, Rec>) => menu.reduce((t, id) => add(t, recipeMacros(recs.get(id)!)), zero());

export interface Miss {
  day: number;
  nutrient: M;
  value: number;
  target: number;
  rule: string;
}

/** D17 checks: kcal ±5%, protein ≥ target −5%, carbs and fat ±10%. */
export function checkDay(t: Macros, target: Macros, day: number): Miss[] {
  const misses: Miss[] = [];
  const miss = (nutrient: M, rule: string) => misses.push({ day, nutrient, value: Math.round(t[nutrient]), target: Math.round(target[nutrient]), rule });
  if (Math.abs(t.kcal - target.kcal) > 0.05 * target.kcal) miss("kcal", "within ±5%");
  if (t.protein_g < 0.95 * target.protein_g) miss("protein_g", "at least target −5%");
  if (Math.abs(t.carbs_g - target.carbs_g) > 0.1 * target.carbs_g) miss("carbs_g", "within ±10%");
  if (Math.abs(t.fat_g - target.fat_g) > 0.1 * target.fat_g) miss("fat_g", "within ±10%");
  return misses;
}

/**
 * Fit ingredient grams to the targets: coordinate descent on a weighted least-squares error over the distinct
 * day menus, each ingredient bounded to SCALE × the model's grams (spices stay as written). Then round grams.
 */
export function fitGrams(recs: Map<string, Rec>, menus: string[][], target: Macros) {
  const w: Record<M, number> = { kcal: 3, protein_g: 2, carbs_g: 1, fat_g: 1 };
  const W_SLOT = 0.3; // soft: each meal near its share of the day's calories
  const slotKcal = MEALS.map((m) => SHARE[m] * target.kcal);
  const totals = menus.map((m) => dayTotals(m, recs));
  const rk = new Map([...recs.values()].map((r) => [r.id, recipeMacros(r).kcal]));
  for (let pass = 0; pass < 60; pass++) {
    for (const r of recs.values()) {
      const uses = menus.map((m) => m.filter((id) => id === r.id).length);
      if (!uses.some(Boolean)) continue;
      for (const ing of r.ings) {
        if (ing.item.category === "spices") continue;
        let num = 0;
        let den = 0;
        menus.forEach((menu, k) => {
          for (const m of MACROS) {
            const a = (uses[k] * ing.item.per100[m]) / 100;
            num += (w[m] * a * (totals[k][m] - target[m])) / target[m] ** 2;
            den += (w[m] * a * a) / target[m] ** 2;
          }
          menu.forEach((id, s) => {
            if (id !== r.id) return;
            const a = ing.item.per100.kcal / 100;
            num += (W_SLOT * a * (rk.get(r.id)! - slotKcal[s])) / slotKcal[s] ** 2;
            den += (W_SLOT * a * a) / slotKcal[s] ** 2;
          });
        });
        if (!den) continue;
        const next = Math.min(ing.hi, Math.max(ing.lo, ing.grams - num / den));
        const d = next - ing.grams;
        if (!d) continue;
        ing.grams = next;
        rk.set(r.id, rk.get(r.id)! + (ing.item.per100.kcal * d) / 100);
        menus.forEach((_, k) => add(totals[k], ing.item.per100, (uses[k] * d) / 100));
      }
    }
  }
  for (const r of recs.values()) for (const i of r.ings) i.grams = Math.max(1, i.grams >= 50 ? Math.round(i.grams / 5) * 5 : Math.round(i.grams));
}

// ---- Grocery maths ----

export interface GroceryLine {
  catalog_item_id: string;
  name: string;
  grams_needed: number;
  packs: number;
  unit_price_usd: number;
  line_total_usd: number;
}

/** Sum grams per catalog item over all servings, round up to whole packs, price them. */
export function groceryList(recipes: { servings: number; ingredients: { catalog_item_id: string; grams: number }[] }[], catalog = loadCatalog()) {
  const grams = new Map<string, number>();
  for (const r of recipes) for (const i of r.ingredients) grams.set(i.catalog_item_id, (grams.get(i.catalog_item_id) ?? 0) + i.grams * r.servings);
  const lines: GroceryLine[] = [...grams].map(([id, g]) => {
    const c = catalog.find((x) => x.id === id);
    if (!c) throw new Error(`unknown catalog item ${id}`);
    const packs = Math.ceil(g / c.grams_per_pack - 1e-9);
    return { catalog_item_id: id, name: c.name, grams_needed: Math.round(g), packs, unit_price_usd: c.price_usd, line_total_usd: Math.round(packs * c.price_usd * 100) / 100 };
  });
  return { lines, packs: lines.reduce((n, l) => n + l.packs, 0), total_usd: Math.round(lines.reduce((s, l) => s + l.line_total_usd, 0) * 100) / 100 };
}

// ---- Generator ----

export interface Preferences {
  cuisines?: string[];
  dislikes?: string[];
  allergies?: string[];
  high_protein?: boolean;
  max_prep_minutes?: number;
}

export interface GenerateInput {
  startDate: string;
  days: number;
  targets: Macros;
  preferences?: Preferences;
  constraints?: string;
  llm?: typeof structured;
  onProgress?: (message: string) => void;
}

export interface Generated {
  plan: MealPlan;
  within_tolerance: boolean;
  rounds: number;
  misses: Miss[];
  grocery: ReturnType<typeof groceryList>;
  seconds: number;
}

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const f0 = (x: number) => String(Math.round(x));

function prompt(input: GenerateInput, cat: PlanItem[], prev?: { draft: Draft; misses: Miss[]; recipeLines: string; error?: string }) {
  const p = input.preferences ?? {};
  const t = input.targets;
  const minutes = Math.min(150, p.max_prep_minutes ?? 150);
  const table = cat
    .map((c) => `${c.id} | ${c.name} | ${f0(c.per100.kcal)} | ${c.per100.protein_g.toFixed(1)} | ${c.per100.carbs_g.toFixed(1)} | ${c.per100.fat_g.toFixed(1)} | ${c.grams_per_pack} g $${c.price_usd}`)
    .join("\n");
  const lines = [
    `Plan ${input.days} days of meal prep for one person. Every day has breakfast, lunch, dinner and a snack, one serving each.`,
    `Daily targets: ${f0(t.kcal)} kcal, protein ${f0(t.protein_g)} g, carbs ${f0(t.carbs_g)} g, fat ${f0(t.fat_g)} g.`,
    `Each day must land within 5% of the calories, at least the protein, and within 10% of carbs and fat.`,
    `Calories per meal: ${MEALS.map((m) => `${m} about ${f0(SHARE[m] * t.kcal)}`).join(", ")}. Protein needs about ${f0(t.protein_g / 4)} g per main meal: use chicken, tuna, lentils or whey generously; keep oil and ghee small.`,
    `Preferences: ${[...(p.cuisines ?? []).map((c) => `${c} food (Pakistani/Indian flavours)`), p.high_protein ? "high protein" : ""].filter(Boolean).join(", ") || "none"}.` +
      (p.dislikes?.length ? ` Dislikes: ${p.dislikes.join(", ")}.` : "") +
      (p.allergies?.length ? ` Allergies: ${p.allergies.join(", ")}.` : ""),
    input.constraints ? `The user also said: "${input.constraints}". Follow it strictly.` : "",
    `Write 3 or 4 recipes that keep in the fridge for ${input.days} days, and 1 or 2 day menus (days alternate A, B). All cooking happens in ONE batch-cook session of at most ${minutes} minutes.`,
    `Groceries are bought as whole packs, so keep the cart small: at most 11 different items in the whole plan (at most 3 spices), reuse items across recipes, and avoid pricey packs you barely use.`,
    `Use ONLY these catalog items (id | name | per 100 g: kcal | protein g | carbs g | fat g | pack). Grams are raw, as bought (dry rice, dry lentils), per ONE serving:`,
    table,
  ];
  if (prev) {
    lines.push(
      prev.error
        ? `Your last plan was rejected: ${prev.error}`
        : `Your last plan, after scaling each ingredient between ${SCALE[0]}x and ${SCALE[1]}x, still misses:\n` +
            prev.misses.map((m) => `- day ${m.day}: ${m.nutrient} ${m.value}, target ${m.target} (${m.rule})`).join("\n") +
            `\nIts recipes per serving were:\n${prev.recipeLines}\nChange the ingredients or recipes to fix every miss (more protein: chicken, tuna, whey, lentils; less fat: less oil, ghee, nuts; more carbs: rice, atta, oats).`,
      `Last plan for reference: ${JSON.stringify(prev.draft)}`,
    );
  }
  lines.push(`Call save_meal_plan once with the full plan.`);
  return lines.filter(Boolean).join("\n");
}

/** Build the code-checked plan from one draft. Throws on a structural problem the model must fix. */
function build(draft: Draft, input: GenerateInput, cat: PlanItem[]) {
  const byId = new Map(cat.map((c) => [c.id, c]));
  const recs = new Map<string, Rec>();
  for (const r of draft.recipes) {
    if (recs.has(r.id)) throw new Error(`recipe id ${r.id} is used twice`);
    const ings = r.ingredients.map((i) => ({ item: byId.get(i.item)!, grams: i.grams, lo: i.grams * SCALE[0], hi: i.grams * SCALE[1] }));
    recs.set(r.id, { id: r.id, name: r.name, steps: r.steps, ings });
  }
  const menus = draft.day_menus.map((d) => MEALS.map((m) => d[m]));
  const bad = menus.flat().find((id) => !recs.has(id));
  if (bad) throw new Error(`day menu uses recipe "${bad}", which is not in recipes`);

  fitGrams(recs, menus, input.targets);

  const dayList = Array.from({ length: input.days }, (_, k) => menus[k % menus.length]);
  const misses: Miss[] = [];
  const days = dayList.map((menu, k) => {
    const totals = dayTotals(menu, recs);
    const dayMisses = checkDay(totals, input.targets, k + 1);
    misses.push(...dayMisses);
    return { date: addDays(input.startDate, k), meals: MEALS.map((meal, i) => ({ meal, recipe_id: menu[i] })), totals: round(totals), within_tolerance: !dayMisses.length };
  });
  const servings = (id: string) => dayList.flat().filter((x) => x === id).length;
  const recipes = [...recs.values()]
    .filter((r) => servings(r.id) > 0)
    .map((r) => ({
      id: r.id,
      name: r.name,
      servings: servings(r.id),
      per_serving: round(recipeMacros(r)),
      ingredients: r.ings.map((i) => ({ catalog_item_id: i.item.id, name: i.item.name, grams: i.grams })),
      steps: r.steps,
    }));
  const grocery = groceryList(recipes, cat);
  const plan: MealPlan = {
    plan_id: `plan-${input.startDate}-${Date.now().toString(36)}`,
    start_date: input.startDate,
    targets: round(input.targets),
    days,
    recipes,
    batch_cook: { total_minutes: draft.batch_cook.total_minutes, steps: draft.batch_cook.steps },
    grocery: grocery.lines.map(({ catalog_item_id, name, grams_needed }) => ({ catalog_item_id, name, grams_needed })),
  };
  const recipeLines = recipes.map((r) => `- ${r.id} ${r.name}: ${r.per_serving.kcal} kcal, P ${r.per_serving.protein_g}, C ${r.per_serving.carbs_g}, F ${r.per_serving.fat_g}`).join("\n");
  return { plan, misses, grocery, recipeLines };
}

const score = (misses: Miss[]) => misses.length * 1000 + misses.reduce((s, m) => s + Math.abs(m.value - m.target) / m.target, 0);

/** Model writes, code fits and checks; up to MAX_ROUNDS rounds with the exact misses. Keeps the best plan. */
export async function generatePlan(input: GenerateInput): Promise<Generated> {
  const t0 = performance.now();
  const llm = input.llm ?? structured;
  const cat = planItems(input.constraints);
  const schema = draftSchema(cat.map((c) => c.id));
  let best: (ReturnType<typeof build> & { rounds: number }) | undefined;
  let prev: Parameters<typeof prompt>[2];
  let lastErr: unknown;
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    input.onProgress?.(round === 1 ? "Planning recipes…" : `Revising the plan (round ${round})…`);
    let draft: Draft;
    try {
      ({ data: draft } = await llm({
        name: "save_meal_plan",
        description: "Save the meal-prep plan: recipes from catalog items, day menus and the batch-cook session.",
        schema,
        prompt: prompt(input, cat, prev),
        system: "You are a sports nutritionist and home cook who writes precise, practical meal-prep plans.",
        maxTokens: 5000,
        temperature: 0.4,
        timeoutMs: 60_000,
        stream: true,
      }));
    } catch (e) {
      lastErr = e;
      console.log(`mealprep round=${round} llm_error=${(e as Error).message.slice(0, 200)}`);
      continue;
    }
    input.onProgress?.("Checking macros…");
    let built: ReturnType<typeof build>;
    try {
      built = build(draft, input, cat);
    } catch (e) {
      lastErr = e;
      prev = { draft, misses: [], recipeLines: "", error: (e as Error).message };
      console.log(`mealprep round=${round} rejected=${(e as Error).message}`);
      continue;
    }
    console.log(`mealprep round=${round} misses=${built.misses.length}`);
    if (!best || score(built.misses) < score(best.misses)) best = { ...built, rounds: round };
    if (!built.misses.length) break;
    prev = { draft, misses: built.misses, recipeLines: built.recipeLines };
  }
  if (!best) throw lastErr instanceof Error ? lastErr : new Error("meal plan generation failed");
  const rounds = best.misses.length ? MAX_ROUNDS : best.rounds;
  return { plan: best.plan, within_tolerance: !best.misses.length, rounds, misses: best.misses, grocery: best.grocery, seconds: Math.round((performance.now() - t0) / 100) / 10 };
}
