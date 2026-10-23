// Cart (T-26, D9, D15): the server holds the cart in cart_items (one row per catalog item, quantity = packs).
// Names resolve to catalog items in code (exact, then contains, then trigram). Checkout builds a link through a
// CartProvider; Alexa never places an order.
import { sql } from "drizzle-orm";
import type { CartCard } from "@dayform/contracts";
import { normalize } from "@dayform/food-search";
import { query } from "../../core/db.ts";
import { clock } from "../../core/clock.ts";
import { loadCatalog, type PlanItem } from "../meal-prep/plan.ts";
import type { PlanMeta } from "../meal-prep/store.ts";

// ---- Links (D15) ----

export interface CartLine {
  asin: string | null;
  name: string;
  packs: number;
}
export interface CartProvider {
  link(lines: CartLine[]): string;
}

/** T-05 form, verified by the user 2026-10-22: /associates/addtocart fills the cart only with an AssociateTag. */
export const AMAZON_ASSOCIATE_TAG = "dayform-20";
export const AmazonCartLinkProvider: CartProvider = {
  link: (lines) =>
    `https://www.amazon.com/associates/addtocart?AssociateTag=${AMAZON_ASSOCIATE_TAG}&` +
    lines.map((l, i) => `ASIN.${i + 1}=${l.asin}&Quantity.${i + 1}=${l.packs}`).join("&"),
};
/** Fallback for an item with no verified ASIN: an Amazon search for it. */
export const SearchLinkProvider: CartProvider = {
  link: (lines) => `https://www.amazon.com/s?k=${encodeURIComponent(lines.map((l) => l.name).join(" "))}`,
};
/** Future: the Amazon Creators API (declared, not built). */
export type CreatorsApiProvider = CartProvider;

// ---- Catalog and name matching ----

const MIN_SIMILARITY = 0.3;
// pg_trgm-style similarity (the food-search package keeps its own copy private).
const trigrams = (s: string) => new Set(s.split(" ").flatMap((w) => [...`  ${w} `].slice(2).map((_, i) => `  ${w} `.slice(i, i + 3))));
const similarity = (a: Set<string>, b: Set<string>) => {
  const shared = [...a].filter((t) => b.has(t)).length;
  return shared / (a.size + b.size - shared || 1);
};
const catalog = () => loadCatalog();
const byId = (id: string) => catalog().find((c) => c.id === id);

/** Best match for a spoken name among `items`, or undefined. */
export function matchItem<T extends { id: string; name: string }>(said: string, items: T[]): T | undefined {
  const q = normalize(said);
  if (!q) return undefined;
  const terms = (c: T) => [normalize(c.id.replace(/-/g, " ")), normalize(c.name)];
  const exact = items.find((c) => terms(c).includes(q));
  if (exact) return exact;
  const contains = items.filter((c) => terms(c).some((t) => ` ${t} `.includes(` ${q} `)));
  if (contains.length === 1) return contains[0];
  // "rice" is basmati rice, not rice cakes: prefer the item whose name ends in the words said (the head noun).
  const head = contains.filter((c) => terms(c).some((t) => ` ${t}`.endsWith(` ${q}`)));
  if (head.length === 1) return head[0];
  const qt = trigrams(q);
  let best: { c: T; s: number } | undefined;
  for (const c of contains.length ? contains : items) {
    const s = Math.max(...terms(c).map((t) => similarity(qt, trigrams(t))));
    if (!best || s > best.s) best = { c, s };
  }
  return best && best.s >= MIN_SIMILARITY ? best.c : undefined;
}

// ---- Cart state ----

export interface Row {
  item: PlanItem;
  packs: number;
  meal_plan_id: number | null;
}

export async function readCart(): Promise<Row[]> {
  const rows = await query<{ catalog_item_id: string; quantity: number; meal_plan_id: number | null }>(
    sql`SELECT catalog_item_id, quantity, meal_plan_id FROM cart_items ORDER BY id`,
  );
  return rows.flatMap((r) => {
    const item = byId(r.catalog_item_id);
    return item ? [{ item, packs: Number(r.quantity), meal_plan_id: r.meal_plan_id == null ? null : Number(r.meal_plan_id) }] : [];
  });
}

async function setPacks(id: string, packs: number, planId: number | null) {
  if (packs <= 0) return void (await query(sql`DELETE FROM cart_items WHERE catalog_item_id = ${id}`));
  const at = (await clock.now()).toISOString();
  const [u] = await query<{ id: number }>(
    sql`UPDATE cart_items SET quantity = ${packs}, meal_plan_id = COALESCE(${planId}, meal_plan_id) WHERE catalog_item_id = ${id} RETURNING id`,
  );
  if (!u) await query(sql`INSERT INTO cart_items (catalog_item_id, quantity, meal_plan_id, added_at) VALUES (${id}, ${packs}, ${planId}, ${at}::timestamptz)`);
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** The cart card from the cart rows. Items without an ASIN can't be card lines (contract) and are left out. */
export function cartCard(rows: Row[], link: string | null = null): CartCard {
  const items = rows
    .filter((r) => r.item.asin)
    .map(({ item, packs }) => ({
      catalog_item_id: item.id, name: item.name, asin: item.asin!, pack_size: item.pack_label, packs,
      unit_price_usd: item.price_usd, line_total_usd: cents(packs * item.price_usd),
    }));
  const dates = rows.map((r) => r.item.price_date).sort();
  return {
    items,
    item_count: items.length,
    pack_count: items.reduce((n, i) => n + i.packs, 0),
    estimated_total_usd: cents(items.reduce((s, i) => s + i.line_total_usd, 0)),
    price_date: dates.at(-1) ?? catalog()[0].price_date,
    add_to_cart_url: link,
  };
}

export const cartFacts = (c: CartCard) =>
  c.item_count ? `Cart: ${c.item_count} items, ${c.pack_count} packs, about $${c.estimated_total_usd.toFixed(2)}.` : "The cart is empty.";

// ---- Adding and removing ----

export interface AddResult {
  added: { name: string; packs: number }[];
  unavailable: string[];
  unknown: string[];
}

async function addLines(lines: { id: string; packs: number }[], planId: number | null, out: AddResult) {
  const cart = new Map((await readCart()).map((r) => [r.item.id, r]));
  for (const { id, packs } of lines) {
    const item = byId(id)!;
    if (!item.available) {
      out.unavailable.push(item.name);
      continue;
    }
    const have = cart.get(id);
    // Same plan added again (a retry): leave the line as is, so the packs never double.
    if (planId != null && have?.meal_plan_id === planId) continue;
    await setPacks(id, (have?.packs ?? 0) + packs, planId);
    out.added.push({ name: item.name, packs });
  }
}

/** The plan's grocery list, as {catalog_item_id, packs}: the newest ready meal_plans row (T-25 stores it in totals.grocery). */
export async function latestPlanGrocery(): Promise<{ planId: number; lines: { id: string; packs: number }[] } | undefined> {
  const [row] = await query<{ id: number; totals: PlanMeta | string | null; plan: unknown }>(
    sql`SELECT id, totals, plan FROM meal_plans WHERE status = 'ready' ORDER BY created_at DESC, id DESC LIMIT 1`,
  );
  if (!row) return undefined;
  const json = <T>(v: unknown) => (typeof v === "string" ? JSON.parse(v) : v) as T;
  const meta = json<PlanMeta | null>(row.totals);
  const plan = json<{ grocery?: { catalog_item_id: string; grams_needed: number }[] } | null>(row.plan);
  // Packs from T-25's grocery maths; else round the plan's grams up to whole packs.
  const lines =
    meta?.grocery?.map((g) => ({ id: g.catalog_item_id, packs: g.packs })) ??
    (plan?.grocery ?? []).map((g) => ({ id: g.catalog_item_id, packs: Math.ceil(g.grams_needed / (byId(g.catalog_item_id)?.grams_per_pack ?? Infinity) - 1e-9) }));
  return { planId: Number(row.id), lines: lines.filter((l) => byId(l.id) && l.packs > 0) };
}

export async function addFromPlan(): Promise<AddResult & { planId?: number }> {
  const out: AddResult = { added: [], unavailable: [], unknown: [] };
  const g = await latestPlanGrocery();
  if (!g) return { ...out, planId: undefined };
  await addLines(g.lines, g.planId, out);
  return { ...out, planId: g.planId };
}

export async function addNamed(items: { name: string; packs?: number }[]): Promise<AddResult> {
  const out: AddResult = { added: [], unavailable: [], unknown: [] };
  const lines: { id: string; packs: number }[] = [];
  for (const i of items) {
    const c = matchItem(i.name, catalog());
    if (c) lines.push({ id: c.id, packs: i.packs ?? 1 });
    else out.unknown.push(i.name);
  }
  await addLines(lines, null, out);
  return out;
}

/** Remove `packs` (default all) of the cart line that best matches `said`. Undefined when nothing matches. */
export async function removeItem(said: string, packs?: number): Promise<{ name: string; packs: number } | undefined> {
  const rows = await readCart();
  const hit = matchItem(said, rows.map((r) => ({ ...r, id: r.item.id, name: r.item.name })));
  if (!hit) return undefined;
  const n = Math.min(packs ?? hit.packs, hit.packs);
  await setPacks(hit.item.id, hit.packs - n, null);
  return { name: hit.item.name, packs: n };
}

// ---- Checkout ----

export const confirmMessage = (c: CartCard) =>
  `Add ${c.item_count} items, about $${Math.round(c.estimated_total_usd)}, to your Amazon cart?`;

/** Link for the whole cart: Add-to-Cart for items with an ASIN, search links for the rest. */
export function cartLinks(rows: Row[]): { link: string; search: string[] } {
  const line = (r: Row): CartLine => ({ asin: r.item.asin, name: r.item.name, packs: r.packs });
  return {
    link: AmazonCartLinkProvider.link(rows.filter((r) => r.item.asin).map(line)),
    search: rows.filter((r) => !r.item.asin).map((r) => SearchLinkProvider.link([line(r)])),
  };
}

export async function recordCheckout(status: "confirmed" | "declined" | "cancelled", card: CartCard) {
  const at = (await clock.now()).toISOString();
  await query(sql`INSERT INTO cart_checkouts (created_at, status, items, total_usd, link)
    VALUES (${at}::timestamptz, ${status}, ${JSON.stringify(card.items)}::jsonb, ${card.estimated_total_usd}, ${card.add_to_cart_url})`);
}
