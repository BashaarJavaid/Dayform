// Live workout session (T-24, D7, D19). State lives in workout_sessions.state so a new MCP session can resume it.
// Targets: next_targets (overnight job) first, else double progression. Swaps: alternatives list + rule table. No LLM.
import { and, desc, eq, lt } from "drizzle-orm";
import type { Pr } from "@dayform/contracts";
import { getDb, schema } from "../../core/db.ts";
import type { Exercise } from "../training/index.ts";

export interface Target { weight_kg: number; reps: number }
export interface Slot {
  exercise_id: string;
  name: string;
  sets: number;
  reps_min: number;
  reps_max: number;
  rest_seconds: number;
  increment_kg: number;
  target: Target;
  /** Name of the exercise this slot replaced (swap_exercise). */
  replaced?: string;
}
/** The jsonb shape of workout_sessions.state. */
export interface SessionState {
  day_name: string;
  slots: Slot[];
  /** Index of the current exercise. */
  current: number;
  /** The set to do next on the current exercise. */
  set_number: number;
  rest_seconds: number;
  rest_ends_at: string | null;
  complete: boolean;
  /** One entry per PR set, in order. */
  prs: Pr[];
}
export type SessionRow = typeof schema.workout_sessions.$inferSelect & { state: SessionState };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, " ").replace(/\bday\b/g, "").trim();
export const round25 = (kg: number) => Math.round(kg / 2.5) * 2.5;

/** A program day from what the user said ("push", "Push day"), else today's day, else the next one in the week. */
export async function pickDay(said: string | undefined, weekday: number) {
  const days = await (await getDb()).select().from(schema.program_days);
  if (said) {
    const q = norm(said);
    const hit = days.find((d) => norm(d.id) === q || norm(d.name) === q) ?? days.find((d) => q.includes(norm(d.id)));
    if (!hit) return { day: null, names: days.map((d) => d.name) };
    return { day: hit, names: [] };
  }
  const ahead = (d: { weekday: number }) => (d.weekday - weekday + 7) % 7;
  return { day: [...days].sort((a, b) => ahead(a) - ahead(b))[0], names: [] };
}

/**
 * Double progression on the last session's sets: every set at reps_max → +increment, back to reps_min;
 * otherwise the same weight and the best set + 1 rep (capped at reps_max).
 */
export function progress(last: { weight_kg: number; reps: number }[], px: { reps_min: number; reps_max: number; increment_kg: number }): Target {
  const weight = Math.max(...last.map((s) => s.weight_kg));
  const top = last.filter((s) => s.weight_kg === weight).map((s) => s.reps);
  if (top.every((r) => r >= px.reps_max)) return { weight_kg: weight + px.increment_kg, reps: px.reps_min };
  return { weight_kg: weight, reps: Math.min(Math.max(...top) + 1, px.reps_max) };
}

/** Target from history: the last session of the exercise before `date`, progressed. Null when never done. */
export async function targetFromHistory(exerciseId: string, date: string, px: Parameters<typeof progress>[1]): Promise<Target | null> {
  const db = await getDb();
  const [last] = await db.select({ session_id: schema.sets.session_id })
    .from(schema.sets).innerJoin(schema.workout_sessions, eq(schema.workout_sessions.id, schema.sets.session_id))
    .where(and(eq(schema.sets.exercise_id, exerciseId), lt(schema.workout_sessions.date, date)))
    .orderBy(desc(schema.workout_sessions.date), desc(schema.sets.logged_at)).limit(1);
  if (!last) return null;
  const sets = await db.select().from(schema.sets).where(and(eq(schema.sets.session_id, last.session_id), eq(schema.sets.exercise_id, exerciseId)));
  return progress(sets, px);
}

/** The day's slots with targets: next_targets for the date, else history, else the bottom of the range at 20 kg. */
export async function planDay(dayId: string, date: string): Promise<Slot[]> {
  const db = await getDb();
  const rows = await db.select().from(schema.program_exercises)
    .innerJoin(schema.exercises, eq(schema.exercises.id, schema.program_exercises.exercise_id))
    .where(eq(schema.program_exercises.day_id, dayId)).orderBy(schema.program_exercises.position);
  const planned = await db.select().from(schema.next_targets).where(eq(schema.next_targets.for_date, date)).orderBy(schema.next_targets.id);
  return Promise.all(rows.map(async ({ program_exercises: px, exercises: ex }) => {
    const nt = planned.filter((t) => t.exercise_id === ex.id).at(-1);
    const target = nt ? { weight_kg: nt.weight_kg, reps: nt.reps } : (await targetFromHistory(ex.id, date, px)) ?? { weight_kg: 20, reps: px.reps_min };
    return { exercise_id: ex.id, name: ex.name, sets: px.sets, reps_min: px.reps_min, reps_max: px.reps_max, rest_seconds: px.rest_seconds, increment_kg: px.increment_kg, target };
  }));
}

/** The open workout: the latest active session, whichever MCP session started it (one user; a reconnect resumes it). */
export async function openSession(): Promise<SessionRow | null> {
  const db = await getDb();
  const [row] = await db.select().from(schema.workout_sessions)
    .where(eq(schema.workout_sessions.status, "active")).orderBy(desc(schema.workout_sessions.started_at)).limit(1);
  return (row as SessionRow) ?? null;
}

export async function saveState(id: string, state: SessionState, mcpSessionId: string | undefined) {
  await (await getDb()).update(schema.workout_sessions)
    .set({ state, ...(mcpSessionId && { mcp_session_id: mcpSessionId }) })
    .where(eq(schema.workout_sessions.id, id));
}

// --- Swaps: reason words → exercise ids to avoid (DESIGN §7: code, no model) ---

export const AVOID: { word: RegExp; part: string; ids: RegExp }[] = [
  { word: /shoulder|rotator/, part: "shoulder", ids: /overhead|shoulder-press|upright-row|^dip$/ },
  { word: /knee/, part: "knee", ids: /squat|lunge|leg-extension|leg-press$|hack/ },
  { word: /back|spine/, part: "back", ids: /deadlift|rack-pull|barbell-row|back-squat|good-morning/ },
  { word: /elbow/, part: "elbow", ids: /skull-crusher|triceps-extension|close-grip|^dip$/ },
  { word: /wrist/, part: "wrist", ids: /front-squat|barbell-curl|skull-crusher|push-up/ },
];

/** First alternative that fits the equipment, spares the named body part and is not already in the plan; then any same-muscle exercise. */
export function chooseSwap(ex: Exercise, all: Exercise[], o: { reason?: string; equipment?: unknown; exclude: string[] }) {
  const rules = AVOID.filter((r) => r.word.test((o.reason ?? "").toLowerCase()));
  const eq = o.equipment;
  const fits = (e: Exercise) =>
    e.type === "strength" && e.id !== ex.id && !o.exclude.includes(e.id) &&
    (eq == null || eq === "full gym" || [eq].flat().includes(e.equipment)) && !rules.some((r) => r.ids.test(e.id));
  const byId = new Map(all.map((e) => [e.id, e]));
  const pick = ex.alternatives.map((id) => byId.get(id)).find((e) => e && fits(e))
    ?? all.find((e) => e.muscle === ex.muscle && fits(e));
  return { pick: pick ?? null, spares: rules.map((r) => r.part) };
}

/** One Pr per set for the card and the summary: the e1RM entry when there is one. */
export const onePr = (prs: Pr[]): Pr | null => prs.find((p) => p.kind === "e1rm") ?? prs[0] ?? null;
