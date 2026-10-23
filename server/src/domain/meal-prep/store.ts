// meal_plans storage (T-25): ready / preparing / failed rows with their date range, the fresh-plan lookup the
// tool's fast path uses, background generation for the constraints path, and ensureFreshPlan for T-27.
import { sql } from "drizzle-orm";
import type { Macros, MealPlan } from "@dayform/contracts";
import { getDb, query, schema } from "../../core/db.ts";
import { clock } from "../../core/clock.ts";
import { addDays, localDate, targetsOn } from "../targets/index.ts";
import { generatePlan, type Generated, type GroceryLine, type Preferences } from "./plan.ts";

/** Stored in meal_plans.totals next to the plan. */
export interface PlanMeta {
  constraints: string;
  avg?: Macros;
  grocery?: GroceryLine[];
  grocery_total_usd?: number;
  rounds?: number;
  seconds?: number;
  error?: string;
}

export interface PlanRow {
  id: number;
  status: "ready" | "preparing" | "failed";
  start_date: string;
  end_date: string;
  plan: MealPlan | null;
  totals: PlanMeta | null;
  within_tolerance: boolean | null;
  age_s: number;
}

/** Seconds after which a `preparing` row counts as dead (server restarted mid-generation). */
export const STALE_S = 240;
export const ETA_S = 30;
export const normConstraints = (c?: string) => (c ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** Plan inputs for a start date: the targets in force then, and the profile's preferences. */
export async function planInputs(startDate: string): Promise<{ targets: Macros; preferences: Preferences }> {
  const t = await targetsOn(startDate);
  if (!t) throw new Error("No targets: run npm run db:reset");
  const [p] = await query<{ preferences: Preferences }>(sql`SELECT preferences FROM profile WHERE id = 1`);
  const { kcal, protein_g, carbs_g, fat_g } = t.numbers;
  return { targets: { kcal, protein_g, carbs_g, fat_g }, preferences: p?.preferences ?? {} };
}

/** The bench's inputs: tomorrow (demo clock) and the seed's targets and preferences. */
export async function seedInputs() {
  const today = addDays(localDate(await clock.now()), 1);
  return { today, ...(await planInputs(today)) };
}

/** Rows whose plan starts on one of `dates`, newest first. */
export async function recentPlans(dates: string[]): Promise<PlanRow[]> {
  const now = (await clock.now()).toISOString();
  const rows = await query<Record<string, unknown>>(sql`SELECT id, status, start_date::text AS start_date, end_date::text AS end_date, plan, totals,
    within_tolerance, extract(epoch FROM (${now}::timestamptz - created_at))::float AS age_s
    FROM meal_plans WHERE start_date::text IN (${sql.join(dates.map((d) => sql`${d}`), sql`, `)}) ORDER BY id DESC LIMIT 20`);
  const json = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);
  return rows.map((r) => ({
    id: Number(r.id), status: r.status as PlanRow["status"], start_date: String(r.start_date), end_date: String(r.end_date),
    plan: json(r.plan) ?? null, totals: json(r.totals) ?? null, within_tolerance: r.within_tolerance == null ? null : Boolean(r.within_tolerance), age_s: Number(r.age_s),
  }));
}

export const coversDays = (r: PlanRow, days: number) =>
  (Date.parse(`${r.end_date}T00:00:00Z`) - Date.parse(`${r.start_date}T00:00:00Z`)) / 864e5 + 1 >= days;

async function insertRow(status: PlanRow["status"], start: string, days: number, meta: PlanMeta) {
  const db = await getDb();
  const [row] = await db
    .insert(schema.meal_plans)
    .values({ status, start_date: start, end_date: addDays(start, days - 1), plan: null, totals: meta, within_tolerance: null, created_at: (await clock.now()).toISOString() })
    .returning({ id: schema.meal_plans.id });
  return row.id;
}

function metaOf(g: Generated, constraints: string): PlanMeta {
  const n = g.plan.days.length;
  const sum = g.plan.days.reduce((s, d) => ({ kcal: s.kcal + d.totals.kcal, protein_g: s.protein_g + d.totals.protein_g, carbs_g: s.carbs_g + d.totals.carbs_g, fat_g: s.fat_g + d.totals.fat_g }), { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  const avg = { kcal: Math.round(sum.kcal / n), protein_g: Math.round(sum.protein_g / n), carbs_g: Math.round(sum.carbs_g / n), fat_g: Math.round(sum.fat_g / n) };
  return { constraints, avg, grocery: g.grocery.lines, grocery_total_usd: g.grocery.total_usd, rounds: g.rounds, seconds: g.seconds };
}

async function finishRow(id: number, g: Generated, constraints: string) {
  await query(sql`UPDATE meal_plans SET status = 'ready', plan = ${JSON.stringify(g.plan)}::jsonb, totals = ${JSON.stringify(metaOf(g, constraints))}::jsonb,
    within_tolerance = ${g.within_tolerance} WHERE id = ${id}`);
}

export async function failRow(id: number, error: string, constraints: string) {
  await query(sql`UPDATE meal_plans SET status = 'failed', totals = ${JSON.stringify({ constraints, error } satisfies PlanMeta)}::jsonb WHERE id = ${id}`);
}

/** Running background generations, by row id (tests and the bench await them). */
export const pending = new Map<number, Promise<void>>();

/**
 * Insert a `preparing` row and generate in the background (fire and forget). Returns the row id at once;
 * the row becomes `ready` (or `failed`) when the generation ends.
 */
export async function startPlan(start: string, days: number, constraints: string, onProgress?: (m: string) => void): Promise<number> {
  const id = await insertRow("preparing", start, days, { constraints });
  const job = (async () => {
    try {
      const { targets, preferences } = await planInputs(start);
      const g = await generatePlan({ startDate: start, days, targets, preferences, constraints: constraints || undefined, onProgress });
      await finishRow(id, g, constraints);
      console.log(`mealprep plan=${id} ready rounds=${g.rounds} within_tolerance=${g.within_tolerance} s=${g.seconds}`);
    } catch (e) {
      console.error(`mealprep plan=${id} failed`, e);
      await failRow(id, (e as Error).message, constraints).catch(() => {});
    } finally {
      pending.delete(id);
    }
  })();
  pending.set(id, job);
  return id;
}

/** For T-27's overnight job: a ready plan starting on `start` covering `days`, generated now if there is none. */
export async function ensureFreshPlan(start: string, days = 4): Promise<PlanRow> {
  const fresh = (await recentPlans([start])).find((r) => r.status === "ready" && coversDays(r, days));
  if (fresh) return fresh;
  const id = await startPlan(start, days, "");
  await pending.get(id);
  const row = (await recentPlans([start])).find((r) => r.id === id);
  if (row?.status !== "ready") throw new Error(`meal plan ${id} ${row?.status ?? "missing"}: ${row?.totals?.error ?? ""}`);
  return row;
}
