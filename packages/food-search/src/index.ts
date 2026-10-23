// Food search (T-12): exact alias, then trigram (pg_trgm when DATABASE_URL is set, in memory otherwise),
// ranked by similarity and priority; then unit and portion resolution (D5: no amount -> standard portion + assumption).
import { readFileSync } from "node:fs";
import { normalize, parsePhrase, similarity, singularUnit, splitItems, trigrams } from "./text.ts";

export { normalize, parsePhrase, splitItems } from "./text.ts";

export type Nutrients = {
  kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number; sugar_g: number;
  sodium_mg: number; iron_mg: number; calcium_mg: number; potassium_mg: number; vitamin_d_mcg: number;
};
export type Food = {
  id: string; name: string; aliases: string[]; nutrients: Nutrients; portions: Record<string, number>;
  default_portion: string; source: string; priority: number;
};
export type SearchInput = { food: string; quantity?: number; unit?: string };
export type Matched = {
  status: "matched";
  said: string;
  match: { id: string; name: string; source: string };
  confidence: number;
  quantity: number;
  unit: string;
  grams: number;
  /** For the grams eaten. kcal/protein_g/carbs_g/fat_g are the contracts' Macros. */
  nutrients: Nutrients;
  /** True when no amount was said and a standard portion was used (D5). */
  assumed: boolean;
  assumptions: string[];
};
export type NoMatch = { status: "no_confident_match"; said: string; candidates: { id: string; name: string; score: number }[] };
export type SearchResult = Matched | NoMatch;
export type Options = { backend?: "pg" | "memory" };

/** Below this trigram similarity the food goes to Opus for an estimate (T-22). */
export const CONFIDENCE_THRESHOLD = 0.55;
const PRIORITY_WEIGHT = 0.005;

export const FOODS_PATH = new URL("../../../data/foods/foods.json", import.meta.url).pathname;

// ---- In-memory index (also used for exact aliases and compound splitting) ----
type Term = { food: Food; term: string; tri: Set<string> };
let mem: { foods: Map<string, Food>; exact: Map<string, Food>; terms: Term[] } | undefined;
function memory() {
  if (mem) return mem;
  const list: Food[] = JSON.parse(readFileSync(FOODS_PATH, "utf8"));
  const foods = new Map(list.map((f) => [f.id, f]));
  const exact = new Map<string, Food>();
  const terms: Term[] = [];
  for (const f of list) {
    for (const t of termsOf(f)) {
      const cur = exact.get(t);
      if (!cur || f.priority > cur.priority) exact.set(t, f);
      terms.push({ food: f, term: t, tri: trigrams(t) });
    }
  }
  return (mem = { foods, exact, terms });
}

/** Normalized name + aliases, as stored in food_terms. */
export function termsOf(f: Food): string[] {
  return [...new Set([f.name, ...f.aliases].map(normalize).filter(Boolean))];
}

export const isKnownFood = (s: string) => memory().exact.has(normalize(parsePhrase(s).food));

type Ranked = { food: Food; score: number; exact: boolean }[];

function rankMemory(q: string): Ranked {
  const m = memory();
  const hit = m.exact.get(q);
  if (hit) return [{ food: hit, score: 1, exact: true }];
  const qt = trigrams(q);
  const best = new Map<string, { food: Food; score: number }>();
  for (const t of m.terms) {
    const s = similarity(qt, t.tri);
    if (s < 0.3) continue; // pg_trgm's default % threshold
    const cur = best.get(t.food.id);
    if (!cur || s > cur.score) best.set(t.food.id, { food: t.food, score: s });
  }
  return [...best.values()]
    .sort((a, b) => b.score + b.food.priority * PRIORITY_WEIGHT - (a.score + a.food.priority * PRIORITY_WEIGHT))
    .slice(0, 5)
    .map((r) => ({ ...r, exact: false }));
}

// ---- Postgres backend (Drizzle + node-postgres) ----
let pg: Promise<{ execute: (q: any) => Promise<{ rows: any[] }> }> | undefined;
export async function db() {
  pg ??= (async () => {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    return drizzle(process.env.DATABASE_URL!) as any;
  })();
  return pg;
}

async function rankPg(q: string): Promise<Ranked> {
  const { sql } = await import("drizzle-orm");
  const d = await db();
  const { rows } = await d.execute(sql`
    WITH c AS (
      SELECT food_id, max(similarity(term, ${q})) AS s, bool_or(term = ${q}) AS exact
      FROM food_terms WHERE term % ${q} OR term = ${q} GROUP BY food_id
    )
    SELECT f.id, f.name, f.aliases, f.nutrients, f.portions, f.default_portion, f.source, f.priority, c.s, c.exact
    FROM c JOIN foods f ON f.id = c.food_id
    ORDER BY c.exact DESC, c.s + f.priority * ${sql.raw(String(PRIORITY_WEIGHT))} DESC
    LIMIT 5`);
  const ranked: Ranked = rows.map((r) => ({ food: r as Food, score: Number(r.s), exact: r.exact }));
  return ranked[0]?.exact ? [{ ...ranked[0], score: 1 }] : ranked;
}

let warned = false;
async function rank(q: string, opts: Options): Promise<Ranked> {
  const backend = opts.backend ?? (process.env.DATABASE_URL ? "pg" : "memory");
  if (backend === "memory") return rankMemory(q);
  try {
    return await rankPg(q);
  } catch (e) {
    if (opts.backend === "pg") throw e;
    if (!warned) console.warn(`food-search: Postgres unavailable (${(e as Error).message}); using in-memory trigram search`);
    warned = true;
    return rankMemory(q);
  }
}

// ---- Units and portions ----
const WEIGHT: Record<string, number> = { g: 1, gm: 1, gram: 1, kg: 1000, kilo: 1000, oz: 28.35, ounce: 28.35, lb: 453.6, pound: 453.6 };
const VOLUME: Record<string, number> = { ml: 1, l: 1000, liter: 1000, litre: 1000 };
const SYNONYMS: Record<string, string[]> = {
  bowl: ["bowl", "cup"], katori: ["bowl", "cup"], glass: ["glass", "cup"], mug: ["mug", "cup"], cup: ["cup", "glass", "bowl"],
  plate: ["plate", "serving"], portion: ["serving"], serving: ["serving"], piece: ["piece"], tbsp: ["tablespoon"],
  tsp: ["teaspoon"], scoop: ["scoop", "serving"], can: ["can"], bottle: ["bottle"], skewer: ["skewer", "piece"], slice: ["slice", "piece"],
};
const FIXED: Record<string, number> = { handful: 30 };

function portionFor(f: Food, unit: string): [string, number] | undefined {
  for (const c of SYNONYMS[unit] ?? [unit]) {
    for (const k of [c, `${c} nfs`]) if (f.portions[k]) return [k, f.portions[k]];
    // jsonb does not keep key order, so pick deterministically: a medium/regular/nfs size first, else alphabetical.
    const keys = Object.keys(f.portions).filter((k) => k.split(/[ /]/).includes(c)).sort();
    const key = keys.find((k) => /\b(medium|regular|nfs)\b/.test(k)) ?? keys[0];
    if (key) return [key, f.portions[key]];
  }
  // A count noun that names the food itself ("2 rotis", unit "roti") means its default portion.
  if (normalize(f.name).split(" ").includes(unit) || f.aliases.some((a) => normalize(a) === unit)) {
    return [f.default_portion, f.portions[f.default_portion]];
  }
}

/** "2 eggs", "half an avocado", "3 seekh kebabs": a count with no unit means the food's own unit (egg, fruit, kebab). */
function countPortion(f: Food): string {
  const words = new Set([f.name, ...f.aliases].flatMap((n) => normalize(n).split(" ")));
  return Object.keys(f.portions).find((k) => words.has(k)) ?? ["fruit", "piece", "medium"].find((k) => k in f.portions) ?? f.default_portion;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
function scale(n: Nutrients, grams: number): Nutrients {
  const out = {} as Nutrients;
  for (const k of Object.keys(n) as (keyof Nutrients)[]) out[k] = k === "kcal" ? Math.round((n[k] * grams) / 100) : r1((n[k] * grams) / 100);
  return out;
}
const label = (portion: string) => (portion === "serving" ? "standard serving" : portion);

// ---- Public API ----

/** One food: {food, quantity?, unit?} -> match with grams and nutrients, or no_confident_match. */
export async function searchFood(input: SearchInput, opts: Options = {}): Promise<SearchResult> {
  const p = parsePhrase(input.food);
  const quantity = input.quantity ?? p.quantity;
  const unit = input.unit !== undefined ? singularUnit(input.unit) : p.unit;
  const q = normalize(p.food);
  const said = input.food;
  const ranked = q ? await rank(q, opts) : [];
  const top = ranked[0];
  if (!top || top.score < CONFIDENCE_THRESHOLD) {
    return { status: "no_confident_match", said, candidates: ranked.slice(0, 3).map((r) => ({ id: r.food.id, name: r.food.name, score: r1(r.score * 100) / 100 })) };
  }
  const f = top.food;
  const name = f.name.toLowerCase();
  const assumptions: string[] = [];
  let qty = quantity ?? 1;
  let portion: string;
  let grams: number;
  const assumed = quantity === undefined && unit === undefined;
  if (unit && WEIGHT[unit]) {
    portion = unit === "gm" || unit === "gram" ? "g" : unit;
    grams = qty * WEIGHT[unit];
  } else if (unit && VOLUME[unit]) {
    portion = unit === "l" || unit === "liter" || unit === "litre" ? "l" : "ml";
    grams = qty * VOLUME[unit];
    assumptions.push(`Assumed ${name} weighs about 1 g per ml.`);
  } else if (unit && FIXED[unit] && !portionFor(f, unit)) {
    portion = unit;
    grams = qty * FIXED[unit];
    assumptions.push(`Assumed 1 ${unit} of ${name} is ${FIXED[unit]} g.`);
  } else {
    const hit = unit ? portionFor(f, unit) : undefined;
    portion = hit?.[0] ?? (quantity !== undefined && !unit ? countPortion(f) : f.default_portion);
    grams = qty * (hit?.[1] ?? f.portions[portion]);
    if (unit && !hit) assumptions.push(`No "${unit}" size for ${name}; assumed ${qty} ${label(portion)} = ${Math.round(grams)} g.`);
    if (assumed) assumptions.push(`Assumed ${normalize(name).split(" ").includes(portion) ? `1 ${name}` : `1 ${label(portion)} of ${name}`} = ${Math.round(grams)} g.`);
  }
  grams = Math.round(grams);
  return {
    status: "matched",
    said,
    match: { id: f.id, name: f.name, source: f.source },
    confidence: r1(top.score * 100) / 100,
    quantity: qty,
    unit: portion,
    grams,
    nutrients: scale(f.nutrients, grams),
    assumed,
    assumptions,
  };
}

/** Several items as Sonic sends them; compound foods ("nihari with naan") become separate items. */
export async function searchItems(items: SearchInput[], opts: Options = {}): Promise<SearchResult[]> {
  const out: SearchResult[] = [];
  for (const it of items) {
    const parts = splitItems(it.food, isKnownFood);
    for (let i = 0; i < parts.length; i++) {
      out.push(await searchFood(i === 0 ? { ...it, food: parts[i] } : { food: parts[i] }, opts));
    }
  }
  return out;
}

/** Free text ("two rotis, chicken karahi and a mango lassi") -> one result per food. */
export const searchText = (text: string, opts: Options = {}) => searchItems([{ food: text }], opts);

export async function close() {
  if (pg) ((await pg) as any).$client?.end?.();
  pg = undefined;
}
