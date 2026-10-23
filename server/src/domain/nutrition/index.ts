// Nutrition domain (T-22; D4, D5, DESIGN §7). Food matching is T-12's food-search; this file does the maths and storage.
// The reasoning model is called only for a food the table can't match (estimated: true). Everything else is code.
import { sql } from "drizzle-orm";
import { z } from "zod";
import { normalize, parsePhrase, searchFood, searchItems, type Nutrients, type SearchInput } from "@dayform/food-search";
import type { DayNumbers, Macros, MealItem } from "@dayform/contracts";
import { query } from "../../core/db.ts";
import { structured } from "../../core/llm.ts";
import { ToolError } from "../../core/registry.ts";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type Item = {
  food_id: string | null;
  name: string;
  said: string;
  quantity: number;
  unit: string;
  grams: number;
  nutrients: Nutrients;
  estimated: boolean;
  /** Portion assumptions (D5). Empty when the user gave the amount. */
  assumptions: string[];
};
type StoredItem = Item & { id: number };

const TZ = () => process.env.DEMO_TZ ?? "Asia/Karachi";
export const localDate = (at: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ() }).format(at);
const localHour = (at: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ(), hour: "2-digit", hourCycle: "h23" }).format(at));

/** Default meal from the demo clock's local hour. */
export function mealFor(at: Date): MealType {
  const h = localHour(at);
  if (h >= 4 && h < 11) return "breakfast";
  if (h >= 11 && h < 16) return "lunch";
  if (h >= 19 && h < 23) return "dinner";
  return "snack";
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const NUTRIENT_KEYS = ["kcal", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g", "sodium_mg", "iron_mg", "calcium_mg", "potassium_mg", "vitamin_d_mcg"] as const;
const scale = (per: Record<string, number>, factor: number) =>
  Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, k === "kcal" ? Math.round((per[k] ?? 0) * factor) : r1((per[k] ?? 0) * factor)])) as Nutrients;
export const macrosOf = (items: { nutrients: Nutrients }[]): Macros => ({
  kcal: Math.round(items.reduce((s, i) => s + i.nutrients.kcal, 0)),
  protein_g: r1(items.reduce((s, i) => s + i.nutrients.protein_g, 0)),
  carbs_g: r1(items.reduce((s, i) => s + i.nutrients.carbs_g, 0)),
  fat_g: r1(items.reduce((s, i) => s + i.nutrients.fat_g, 0)),
});

// ---- Estimate (reasoning model) for a food the table can't match ----

const Per100 = z.object({
  kcal: z.number().min(0).max(900),
  protein_g: z.number().min(0).max(100),
  carbs_g: z.number().min(0).max(100),
  fat_g: z.number().min(0).max(100),
  fiber_g: z.number().min(0).max(100),
  sugar_g: z.number().min(0).max(100),
  sodium_mg: z.number().min(0).max(5000),
});
export const Estimate = z
  .object({
    per_100g: Per100.describe("Nutrients per 100 g as eaten."),
    portion: z.string().min(1).describe("The usual serving unit, e.g. 'plate', 'bowl', 'piece', 'glass'."),
    portion_g: z.number().positive().max(1500).describe("Grams in one usual serving."),
  })
  // Code check (D11): the macros must add up to the calories, and to no more than 100 g per 100 g.
  .refine((e) => e.per_100g.protein_g + e.per_100g.carbs_g + e.per_100g.fat_g <= 100, "protein + carbs + fat must be at most 100 g per 100 g")
  .refine((e) => {
    const p = e.per_100g;
    return Math.abs(p.kcal - (4 * p.protein_g + 4 * p.carbs_g + 9 * p.fat_g)) <= Math.max(40, 0.2 * p.kcal);
  }, "kcal must be close to 4*protein + 4*carbs + 9*fat");

const WEIGHT: Record<string, number> = { g: 1, gm: 1, gram: 1, kg: 1000, oz: 28.35, ounce: 28.35, lb: 453.6, pound: 453.6 };

export type EstimateInfo = { said: string; ms: number; model: string };

async function estimateFood(input: SearchInput): Promise<{ item: Item; info: EstimateInfo }> {
  const p = parsePhrase(input.food);
  const quantity = input.quantity ?? p.quantity;
  const unit = input.unit?.toLowerCase().trim() || p.unit;
  // The user's words without the amount, apostrophes kept ("grandma's special pulao").
  const food = p.quantity === undefined && p.unit === undefined ? input.food.trim() : p.food;
  const r = await structured({
    name: "estimate_food",
    description: "Record the nutrient estimate for one food or dish.",
    schema: Estimate,
    system: "You are a nutritionist who knows South Asian and international home cooking. Estimate typical values; never refuse.",
    prompt: `Estimate nutrients for: "${food}". Give values per 100 g as eaten and the usual single serving.`,
    maxTokens: 400,
    timeoutMs: 15_000,
  });
  const e = r.data;
  const qty = quantity ?? 1;
  const grams = Math.round(unit && WEIGHT[unit] ? qty * WEIGHT[unit] : qty * e.portion_g);
  const assumptions = quantity === undefined && unit === undefined ? [`Assumed 1 ${e.portion} of ${food} = ${grams} g.`] : [];
  return {
    item: {
      food_id: null,
      name: food[0].toUpperCase() + food.slice(1),
      said: input.food,
      quantity: qty,
      unit: unit ?? e.portion,
      grams,
      nutrients: scale({ iron_mg: 0, calcium_mg: 0, potassium_mg: 0, vitamin_d_mcg: 0, ...e.per_100g }, grams / 100),
      estimated: true,
      assumptions,
    },
    info: { said: input.food, ms: r.ms, model: r.model },
  };
}

/** Food search for each item (compound phrases split by T-12); the reasoning model only for no confident match. */
export async function resolveItems(items: SearchInput[]): Promise<{ items: Item[]; estimates: EstimateInfo[] }> {
  const results = await searchItems(items);
  const estimates: EstimateInfo[] = [];
  const out = await Promise.all(
    results.map(async (m, i): Promise<Item> => {
      if (m.status === "matched") {
        return { food_id: m.match.id, name: m.match.name, said: m.said, quantity: m.quantity, unit: m.unit, grams: m.grams, nutrients: m.nutrients, estimated: false, assumptions: m.assumptions };
      }
      // searchItems keeps the caller's quantity/unit on the first part of each phrase; a lone item maps 1:1.
      const src = items.find((it) => it.food === m.said) ?? { food: m.said };
      const e = await estimateFood(src.food === m.said ? src : { food: m.said });
      estimates[i] = e.info;
      return e.item;
    }),
  );
  return { items: out, estimates: estimates.filter(Boolean) };
}

// ---- Storage ----

const ITEM_COLS = ["food_id", "name", "said", "quantity", "unit", "grams", ...NUTRIENT_KEYS, "estimated", "assumptions"] as const;
const itemJson = (entryId: number, items: Item[]) =>
  JSON.stringify(items.map((i) => ({ entry_id: entryId, food_id: i.food_id, name: i.name, said: i.said, quantity: i.quantity, unit: i.unit, grams: i.grams, ...i.nutrients, estimated: i.estimated, assumptions: i.assumptions })));
const cols = sql.raw(ITEM_COLS.join(", "));

async function insertItems(entryId: number, items: Item[]) {
  if (!items.length) return;
  await query(sql`INSERT INTO meal_items (entry_id, ${cols}) SELECT entry_id, ${cols} FROM json_populate_recordset(NULL::meal_items, ${itemJson(entryId, items)}::json)`);
}

export async function saveEntry(at: Date, meal: MealType, items: Item[]): Promise<number> {
  const said = items.map((i) => i.said).join(", ");
  const [e] = await query<{ id: number }>(
    sql`INSERT INTO meal_entries (eaten_at, date, meal_type, said) VALUES (${at.toISOString()}::timestamptz, ${localDate(at)}::date, ${meal}, ${said}) RETURNING id`,
  );
  await insertItems(Number(e.id), items);
  return Number(e.id);
}

const iso = (col: string) => sql.raw(`to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`);

export async function readEntry(id: number) {
  const rows = await query<any>(sql`
    SELECT e.id AS entry_id, e.meal_type, e.date::text AS date, ${iso("e.eaten_at")} AS logged_at, i.id, ${sql.raw(ITEM_COLS.filter((c) => c !== "assumptions").map((c) => `i.${c}`).join(", "))},
      array_to_json(i.assumptions)::text AS assumptions
    FROM meal_entries e LEFT JOIN meal_items i ON i.entry_id = e.id WHERE e.id = ${id} ORDER BY i.id`);
  if (!rows.length) throw new ToolError("That meal was not found.");
  const items: StoredItem[] = rows
    .filter((r) => r.id != null)
    .map((r) => ({
      id: Number(r.id),
      food_id: r.food_id,
      name: r.name,
      said: r.said ?? r.name,
      quantity: Number(r.quantity),
      unit: r.unit,
      grams: Number(r.grams),
      nutrients: Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, Number(r[k])])) as Nutrients,
      estimated: r.estimated === true || r.estimated === "t",
      assumptions: JSON.parse(r.assumptions ?? "[]"),
    }));
  return { id: Number(rows[0].entry_id), meal: rows[0].meal_type as MealType, date: rows[0].date as string, logged_at: rows[0].logged_at as string, items };
}

export async function lastEntryId(): Promise<number> {
  const [r] = await query<{ id: number }>(sql`SELECT max(id) AS id FROM meal_entries`);
  if (r?.id == null) throw new ToolError("No meal is logged yet to correct.");
  return Number(r.id);
}

// ---- Card shapes ----

export const cardItem = (i: Item): MealItem => ({
  food: i.name,
  said: i.said,
  quantity: i.quantity,
  unit: i.unit,
  grams: i.grams,
  macros: macrosOf([i]),
  assumed: i.assumptions.length > 0,
  estimated: i.estimated,
  assumption: [...i.assumptions, ...(i.estimated ? [`Nutrients estimated; ${i.name} is not in the food table.`] : [])].join(" ") || null,
});

/** What Alexa should mention: portion assumptions and estimated foods. */
export const assumptionsOf = (items: Item[]) =>
  items.flatMap((i) => [...i.assumptions, ...(i.estimated ? [`Estimated ${i.said}: about ${i.nutrients.kcal} kcal for ${i.grams} g (not in the food table).`] : [])]);

export const entryCard = (e: Awaited<ReturnType<typeof readEntry>>) => ({
  id: String(e.id),
  meal: e.meal,
  logged_at: e.logged_at,
  items: e.items.map(cardItem),
  totals: macrosOf(e.items),
});

// ---- Day totals vs targets ----

export async function dayNumbers(date: string): Promise<{ eaten: DayNumbers; targets: DayNumbers; remaining: DayNumbers }> {
  const [r] = await query<any>(sql`
    SELECT
      (SELECT coalesce(sum(i.kcal), 0)::float8 FROM meal_items i JOIN meal_entries e ON e.id = i.entry_id WHERE e.date = ${date}::date) AS kcal,
      (SELECT coalesce(sum(i.protein_g), 0)::float8 FROM meal_items i JOIN meal_entries e ON e.id = i.entry_id WHERE e.date = ${date}::date) AS protein_g,
      (SELECT coalesce(sum(i.carbs_g), 0)::float8 FROM meal_items i JOIN meal_entries e ON e.id = i.entry_id WHERE e.date = ${date}::date) AS carbs_g,
      (SELECT coalesce(sum(i.fat_g), 0)::float8 FROM meal_items i JOIN meal_entries e ON e.id = i.entry_id WHERE e.date = ${date}::date) AS fat_g,
      (SELECT coalesce(sum(i.fiber_g), 0)::float8 FROM meal_items i JOIN meal_entries e ON e.id = i.entry_id WHERE e.date = ${date}::date) AS fiber_g,
      (SELECT coalesce(sum(i.sodium_mg), 0)::float8 FROM meal_items i JOIN meal_entries e ON e.id = i.entry_id WHERE e.date = ${date}::date) AS sodium_mg,
      (SELECT coalesce(sum(ml), 0)::float8 FROM water_logs WHERE date = ${date}::date) AS water_ml,
      t.kcal AS t_kcal, t.protein_g AS t_protein_g, t.carbs_g AS t_carbs_g, t.fat_g AS t_fat_g, t.fiber_g AS t_fiber_g, t.sodium_mg AS t_sodium_mg, t.water_ml AS t_water_ml
    FROM (SELECT 1) one LEFT JOIN LATERAL (
      SELECT * FROM targets ORDER BY (effective_date <= ${date}::date) DESC, effective_date DESC, id DESC LIMIT 1
    ) t ON true`);
  if (r.t_kcal == null) throw new ToolError("No targets are set yet. Set your goals first.");
  const keys = ["kcal", "protein_g", "carbs_g", "fat_g", "fiber_g", "sodium_mg", "water_ml"] as const;
  const round = (k: string, n: number) => (k === "kcal" || k === "sodium_mg" || k === "water_ml" ? Math.round(n) : r1(n));
  const pick = (f: (k: (typeof keys)[number]) => number) => Object.fromEntries(keys.map((k) => [k, round(k, f(k))])) as DayNumbers;
  const eaten = pick((k) => Number(r[k]));
  const targets = pick((k) => Number(r[`t_${k}`]));
  return { eaten, targets, remaining: pick((k) => targets[k] - eaten[k]) };
}

export async function mealsOn(date: string) {
  const rows = await query<any>(sql`
    SELECT e.id, e.meal_type, ${iso("e.eaten_at")} AS logged_at, count(i.id)::int AS n,
      coalesce(sum(i.kcal), 0)::float8 AS kcal, coalesce(sum(i.protein_g), 0)::float8 AS protein_g,
      coalesce(sum(i.carbs_g), 0)::float8 AS carbs_g, coalesce(sum(i.fat_g), 0)::float8 AS fat_g
    FROM meal_entries e LEFT JOIN meal_items i ON i.entry_id = e.id
    WHERE e.date = ${date}::date GROUP BY e.id ORDER BY e.eaten_at, e.id`);
  return rows.map((r) => ({
    id: String(r.id),
    meal: r.meal_type as MealType,
    logged_at: r.logged_at as string,
    item_count: Number(r.n),
    totals: { kcal: Math.round(Number(r.kcal)), protein_g: r1(Number(r.protein_g)), carbs_g: r1(Number(r.carbs_g)), fat_g: r1(Number(r.fat_g)) },
  }));
}

export async function addWater(at: Date, ml: number) {
  await query(sql`INSERT INTO water_logs (logged_at, date, ml) VALUES (${at.toISOString()}::timestamptz, ${localDate(at)}::date, ${ml})`);
}

// ---- Corrections ----

const singular = (s: string) => s.split(" ").map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w)).join(" ");
const norm = (s: string) => singular(normalize(parsePhrase(s).food || s));

/** The item in the entry the user means: by words first, then by the food-search match. */
async function findItem(items: StoredItem[], food: string): Promise<StoredItem> {
  const q = norm(food);
  const byText = items.find((i) => [i.said, i.name].some((s) => { const n = norm(s); return n === q || n.includes(q) || q.includes(n); }));
  if (byText) return byText;
  const m = await searchFood({ food });
  const byId = m.status === "matched" ? items.find((i) => i.food_id === m.match.id) : undefined;
  if (byId) return byId;
  throw new ToolError(`There is no ${food} in that meal.`);
}

/** New quantity (and unit) for a stored item: table foods are re-computed from the food table, others scaled. */
async function requantify(i: StoredItem, quantity: number, unit?: string): Promise<Item> {
  const u = unit?.toLowerCase().trim();
  if (i.food_id) {
    const m = await searchFood({ food: i.said, quantity, unit: u ?? i.unit });
    if (m.status === "matched" && m.match.id === i.food_id) {
      return { ...i, quantity: m.quantity, unit: m.unit, grams: m.grams, nutrients: m.nutrients, assumptions: m.assumptions };
    }
  }
  const grams = Math.round(u && WEIGHT[u] ? quantity * WEIGHT[u] : (i.grams / i.quantity) * quantity);
  const perGram = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, i.nutrients[k] / i.grams]));
  return { ...i, quantity, unit: u ?? i.unit, grams, nutrients: scale(perGram, grams), assumptions: [] };
}

export type Change = { food: string; action: "set_quantity" | "remove" | "add"; quantity?: number; unit?: string };

export async function applyChanges(entryId: number, changes: Change[]) {
  const entry = await readEntry(entryId);
  const applied: string[] = [];
  const estimates: EstimateInfo[] = [];
  for (const c of changes) {
    if (c.action === "add") {
      const r = await resolveItems([{ food: c.food, quantity: c.quantity, unit: c.unit }]);
      await insertItems(entryId, r.items);
      estimates.push(...r.estimates);
      for (const it of r.items) applied.push(`Added ${it.quantity} ${it.unit} ${it.name} (${it.nutrients.kcal} kcal).`);
      continue;
    }
    const item = await findItem(entry.items, c.food);
    if (c.action === "remove") {
      await query(sql`DELETE FROM meal_items WHERE id = ${item.id}`);
      entry.items = entry.items.filter((i) => i.id !== item.id);
      applied.push(`Removed ${item.name} (${item.nutrients.kcal} kcal).`);
      continue;
    }
    if (c.quantity === undefined) throw new ToolError(`Say the new amount of ${c.food}.`);
    const next = await requantify(item, c.quantity, c.unit);
    // In place, so the card keeps its item order.
    const set = ITEM_COLS.filter((c) => c !== "food_id" && c !== "name" && c !== "said");
    await query(sql`UPDATE meal_items SET (${sql.raw(set.join(", "))}) = (SELECT ${sql.raw(set.map((c) => `r.${c}`).join(", "))}
      FROM json_populate_record(NULL::meal_items, ${itemJson(entryId, [next]).slice(1, -1)}::json) r) WHERE id = ${item.id}`);
    entry.items = entry.items.map((i) => (i.id === item.id ? { ...next, id: i.id } : i));
    applied.push(`${item.name}: ${item.quantity} ${item.unit} (${item.nutrients.kcal} kcal) to ${next.quantity} ${next.unit} (${next.nutrients.kcal} kcal).`);
  }
  return { applied, estimates };
}

// ---- Duplicate guard: clients may retry an identical call (T-22 task 6) ----

const recent = new Map<string, { at: number; reply: Promise<unknown> }>();
export const DUPLICATE_WINDOW_MS = 10_000;

/** Runs `fn` once per identical key within the window (demo-clock time) and returns the first reply to repeats. */
export async function once<T>(key: string, now: Date, fn: () => Promise<T>): Promise<T> {
  const t = now.getTime();
  for (const [k, v] of recent) if (t - v.at >= DUPLICATE_WINDOW_MS || t < v.at) recent.delete(k);
  const hit = recent.get(key);
  if (hit) return hit.reply as Promise<T>;
  const reply = fn();
  recent.set(key, { at: t, reply });
  reply.catch(() => recent.delete(key));
  return reply;
}

