// Training domain (D6, DESIGN §7): exercise resolver, Epley e1RM and PR detection. Code, never a model.
// Shared with T-24 (live session): resolveExercise, detectPRs, e1rm.
import { sql } from "drizzle-orm";
import type { Pr } from "@dayform/contracts";
import { getDb, query, schema } from "../../core/db.ts";

export type Exercise = typeof schema.exercises.$inferSelect;

/** Epley, rounded to 0.1 kg like the seed. */
export const e1rm = (weightKg: number, reps: number) => Math.round(weightKg * (1 + reps / 30) * 10) / 10;
/** Above this rep count a set is stored but its e1RM is left out of PR checks. */
export const E1RM_MAX_REPS = 12;

/** YYYY-MM-DD of `at` in DEMO_TZ (default Asia/Karachi). */
export const localDate = (at: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: process.env.DEMO_TZ ?? "Asia/Karachi" }).format(at);

// --- Exercise resolver: normalize → exact alias → trigram → 3 closest names ---

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const singular = (s: string) => s.split(" ").map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w)).join(" ");

/** pg_trgm-style trigrams: each word padded with two spaces in front and one behind. */
function trigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of s.split(" ").filter(Boolean)) {
    const p = `  ${w} `;
    for (let i = 0; i + 3 <= p.length; i++) out.add(p.slice(i, i + 3));
  }
  return out;
}
function similarity(a: string, b: string) {
  const [x, y] = [trigrams(a), trigrams(b)];
  let both = 0;
  for (const t of x) if (y.has(t)) both++;
  return both / (x.size + y.size - both || 1);
}

/** pg_trgm's default similarity threshold. */
const MIN_SIMILARITY = 0.3;

let cache: Promise<Exercise[]> | undefined;
async function allExercises(): Promise<Exercise[]> {
  cache ??= getDb().then((db) => db.select().from(schema.exercises)).catch((e) => {
    cache = undefined;
    throw e;
  });
  return cache;
}

export type Resolved = { exercise: Exercise; suggestions?: undefined } | { exercise: null; suggestions: string[] };

export async function resolveExercise(said: string): Promise<Resolved> {
  const list = await allExercises();
  const q = normalize(said);
  const names = (e: Exercise) => [e.id.replace(/-/g, " "), e.name, ...e.aliases].map(normalize);
  for (const key of [q, singular(q)]) {
    const hit = list.find((e) => names(e).some((n) => n === key || singular(n) === key));
    if (hit) return { exercise: hit };
  }
  const scored = list
    .map((e) => ({ e, score: Math.max(...names(e).map((n) => similarity(q, n))) }))
    .sort((a, b) => b.score - a.score);
  if (scored[0] && scored[0].score >= MIN_SIMILARITY && scored[0].score > (scored[1]?.score ?? 0)) return { exercise: scored[0].e };
  return { exercise: null, suggestions: scored.slice(0, 3).map((s) => s.e.name) };
}

// --- PR detection (D6): best e1RM ever for the exercise, best weight ever at that rep count ---

export interface PrCheck {
  pr_e1rm: boolean;
  pr_rep_best: boolean;
  e1rm_kg: number;
  /** Best e1RM before this set (sets of 1–12 reps), null when none. */
  previous_e1rm_kg: number | null;
  /** Best weight before this set at the same rep count, null when none. */
  previous_rep_best_kg: number | null;
}

/**
 * Checks a set against every stored set of the exercise (call it before inserting the set).
 * Same rules as the seed: no e1RM PR on an exercise's first set, no rep-best PR on a rep count's first set,
 * and sets over 12 reps never count for e1RM.
 */
export async function detectPRs(set: { exercise_id: string; weight_kg: number; reps: number }): Promise<PrCheck> {
  const [r] = await query<{ best_e1rm: number | null; best_at_reps: number | null }>(sql`
    SELECT max(e1rm_kg) FILTER (WHERE reps <= ${E1RM_MAX_REPS}) AS best_e1rm,
           max(weight_kg) FILTER (WHERE reps = ${set.reps}) AS best_at_reps
    FROM sets WHERE exercise_id = ${set.exercise_id}`);
  const prevE = r?.best_e1rm == null ? null : Number(r.best_e1rm);
  const prevR = r?.best_at_reps == null ? null : Number(r.best_at_reps);
  const e = e1rm(set.weight_kg, set.reps);
  return {
    pr_e1rm: set.reps <= E1RM_MAX_REPS && prevE !== null && e > prevE,
    pr_rep_best: prevR !== null && set.weight_kg > prevR,
    e1rm_kg: e,
    previous_e1rm_kg: prevE,
    previous_rep_best_kg: prevR,
  };
}

/** The contract's Pr entries for one set: one per PR kind it earned. change_kg is the e1RM gain over the previous best. */
export function prEntries(exercise: string, set: { weight_kg: number; reps: number }, c: PrCheck): Pr[] {
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const entry = (kind: Pr["kind"], prev: number | null): Pr => ({
    exercise, kind, weight_kg: set.weight_kg, reps: set.reps, e1rm_kg: c.e1rm_kg,
    previous_e1rm_kg: prev, change_kg: prev === null ? null : r1(c.e1rm_kg - prev),
  });
  return [
    ...(c.pr_e1rm ? [entry("e1rm", c.previous_e1rm_kg)] : []),
    ...(c.pr_rep_best ? [entry("rep_best", e1rm(c.previous_rep_best_kg!, set.reps))] : []),
  ];
}
