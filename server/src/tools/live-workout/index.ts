// start_workout, log_set, swap_exercise, finish_workout (T-24, D7). No LLM call: targets, PRs and swaps are code.
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { finish_workout, log_set, start_workout, swap_exercise, type Pr, type WorkoutCard } from "@dayform/contracts";
import { defineTool, ToolError, type ToolCtx } from "../../core/registry.ts";
import { clock } from "../../core/clock.ts";
import { getDb, schema } from "../../core/db.ts";
import { detectPRs, localDate, prEntries, resolveExercise } from "../../domain/training/index.ts";
import {
  chooseSwap, onePr, openSession, pickDay, planDay, round25, saveState, targetFromHistory, type SessionRow, type SessionState,
} from "../../domain/session/index.ts";

const r1 = (x: number) => Math.round(x * 10) / 10;
/** Postgres timestamptz text ("2026-10-23 08:00:00.1+00") or ISO, to epoch ms. */
const tsMs = (t: string) => Date.parse(t.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"));
const kgx = (t: { weight_kg: number; reps: number }) => `${t.weight_kg} kg × ${t.reps}`;
const prText = (p: Pr) =>
  p.kind === "e1rm"
    ? `Personal record: estimated 1RM ${p.e1rm_kg} kg${p.change_kg === null ? "" : `, up ${p.change_kg} kg`}.`
    : `Personal record: best weight for ${p.reps} reps, ${p.weight_kg} kg.`;

async function setsOf(sessionId: string, exerciseId?: string) {
  const db = await getDb();
  const s = schema.sets;
  return db.select().from(s)
    .where(exerciseId ? and(eq(s.session_id, sessionId), eq(s.exercise_id, exerciseId)) : eq(s.session_id, sessionId))
    .orderBy(s.id);
}

/** The workout card for slot `index` (default: the current one). */
async function card(row: SessionRow, st: SessionState, pr: Pr | null, index = st.current): Promise<WorkoutCard> {
  const slot = st.slots[index];
  const done = await setsOf(row.id, slot.exercise_id);
  return {
    session_id: row.id,
    day_name: st.day_name,
    exercise: slot.name,
    exercise_index: index + 1,
    exercise_count: st.slots.length,
    set_number: index === st.current ? Math.min(st.set_number, slot.sets) : 1,
    set_count: slot.sets,
    target: slot.target,
    rest_seconds: st.rest_seconds,
    rest_ends_at: st.rest_ends_at,
    done_sets: done.map((d) => ({ set: d.set_number, weight_kg: d.weight_kg, reps: d.reps, rpe: d.rpe })),
    pr,
  };
}

async function mustBeOpen() {
  const row = await openSession();
  if (!row) throw new ToolError("No workout is open. Start one first.");
  return row;
}

const startWorkout = defineTool(start_workout, async ({ day }, ctx: ToolCtx) => {
  const now = await clock.now();
  const date = localDate(now);
  const { day: picked, names } = await pickDay(day, new Date(`${date}T12:00:00Z`).getUTCDay());
  if (!picked) throw new ToolError(`No program day called "${day}". The days are: ${names.join(", ")}.`);
  const db = await getDb();

  const open = await openSession();
  if (open && open.date === date && open.day_id === picked.id) {
    await saveState(open.id, open.state, ctx.extra.sessionId);
    const c = await card(open, open.state, null);
    return {
      data: { ...c, plan: open.state.slots.map((s) => ({ exercise: s.name, sets: s.sets, target_weight_kg: s.target.weight_kg, target_reps: s.target.reps })) },
      text: `${open.state.day_name} is already open. Next: ${c.exercise}, set ${c.set_number} of ${c.set_count}, ${kgx(c.target)}.`,
    };
  }
  if (open) await db.update(schema.workout_sessions).set({ status: "abandoned", ended_at: now.toISOString() }).where(eq(schema.workout_sessions.id, open.id));

  const slots = await planDay(picked.id, date);
  const state: SessionState = { day_name: picked.name, slots, current: 0, set_number: 1, rest_seconds: 0, rest_ends_at: null, complete: false, prs: [] };
  const id = `live-${date}-${picked.id}-${randomUUID().slice(0, 8)}`;
  await db.insert(schema.workout_sessions).values({
    id, day_id: picked.id, date, started_at: now.toISOString(), status: "active", mcp_session_id: ctx.extra.sessionId ?? null, state,
  });
  const row = { id, state } as SessionRow;
  const c = await card(row, state, null);
  return {
    data: { ...c, plan: slots.map((s) => ({ exercise: s.name, sets: s.sets, target_weight_kg: s.target.weight_kg, target_reps: s.target.reps })) },
    text: `Started ${picked.name}: ${slots.length} exercises (${slots.map((s) => s.name).join(", ")}). First: ${c.exercise}, set 1 of ${c.set_count}, ${kgx(c.target)}.`,
  };
});

const logSet = defineTool(log_set, async ({ reps, weight_kg, rpe }, ctx) => {
  const row = await mustBeOpen();
  const st = row.state;
  if (st.complete) throw new ToolError("Every set in the plan is done. Finish the workout to see the summary.");
  const slot = st.slots[st.current];
  const weight = weight_kg ?? slot.target.weight_kg;
  const now = await clock.now();

  const check = await detectPRs({ exercise_id: slot.exercise_id, weight_kg: weight, reps });
  const setNo = st.set_number;
  await (await getDb()).insert(schema.sets).values({
    session_id: row.id, exercise_id: slot.exercise_id, set_number: setNo, weight_kg: weight, reps, rpe: rpe ?? null,
    e1rm_kg: check.e1rm_kg, pr_e1rm: check.pr_e1rm, pr_rep_best: check.pr_rep_best, logged_at: now.toISOString(),
  });
  const pr = onePr(prEntries(slot.name, { weight_kg: weight, reps }, check));
  if (pr) st.prs.push(pr);

  if (st.set_number < slot.sets) st.set_number++;
  else if (st.current < st.slots.length - 1) [st.current, st.set_number] = [st.current + 1, 1];
  else st.complete = true;
  st.rest_seconds = st.complete ? 0 : ((await clock.restSeconds()) ?? slot.rest_seconds);
  st.rest_ends_at = st.complete ? null : new Date(now.getTime() + st.rest_seconds * 1000).toISOString();
  await saveState(row.id, st, ctx.extra.sessionId);

  const c = await card(row, st, pr);
  const next = st.complete
    ? "That was the last set: the workout can be finished."
    : `Rest ${st.rest_seconds} s. Next: ${c.exercise}, set ${c.set_number} of ${c.set_count}, ${kgx(c.target)}.`;
  return {
    data: { ...c, logged: { set: setNo, weight_kg: weight, reps, rpe: rpe ?? null, exercise: slot.name }, is_pr: pr !== null, session_complete: st.complete },
    text: `Logged ${slot.name} set ${setNo}: ${kgx({ weight_kg: weight, reps })}. ${pr ? prText(pr) : "No personal record."} ${next}`,
  };
});

const swapExercise = defineTool(swap_exercise, async ({ exercise, reason }, ctx) => {
  const row = await mustBeOpen();
  const st = row.state;
  let index = st.current;
  if (exercise) {
    const r = await resolveExercise(exercise);
    index = r.exercise ? st.slots.findIndex((s) => s.exercise_id === r.exercise!.id) : -1;
    if (index < 0) throw new ToolError(`"${exercise}" is not in today's plan: ${st.slots.map((s) => s.name).join(", ")}.`);
  }
  const slot = st.slots[index];
  const db = await getDb();
  const all = await db.select().from(schema.exercises).orderBy(schema.exercises.id);
  const [profile] = await db.select().from(schema.profile);
  const ex = all.find((e) => e.id === slot.exercise_id)!;
  const { pick, spares } = chooseSwap(ex, all, {
    reason, equipment: (profile?.preferences as { equipment?: unknown } | undefined)?.equipment, exclude: st.slots.map((s) => s.exercise_id),
  });
  if (!pick) throw new ToolError(`No alternative to ${slot.name} fits${spares.length ? ` that spares your ${spares.join(" and ")}` : ""}.`);

  const history = await targetFromHistory(pick.id, row.date, slot);
  const target = history ?? { weight_kg: round25(slot.target.weight_kg * 0.6), reps: slot.reps_min };
  st.slots[index] = { ...slot, exercise_id: pick.id, name: pick.name, target, replaced: slot.name };
  if (index === st.current) st.set_number = 1;
  await saveState(row.id, st, ctx.extra.sessionId);

  const c = await card(row, st, null, index);
  const why = history ? "from its history" : `a conservative start, 60% of ${slot.target.weight_kg} kg`;
  return {
    data: { ...c, replaced: slot.name, reason: reason ?? null },
    text: `Swapped ${slot.name} for ${pick.name}${spares.length ? ` (easier on the ${spares.join(" and ")})` : ""}. Target ${slot.sets} sets of ${kgx(target)}, ${why}.`,
  };
});

const finishWorkout = defineTool(finish_workout, async (_args, ctx) => {
  const row = await mustBeOpen();
  const st = row.state;
  const now = await clock.now();
  const sets = await setsOf(row.id);
  const names = new Map(st.slots.map((s) => [s.exercise_id, s.name]));
  const order = [...new Set(sets.map((s) => s.exercise_id))];
  if (order.some((id) => !names.has(id))) {
    for (const e of await (await getDb()).select().from(schema.exercises)) if (!names.has(e.id)) names.set(e.id, e.name);
  }
  const exercises = order.map((id) => ({
    exercise: names.get(id)!,
    sets: sets.filter((s) => s.exercise_id === id).map((s) => ({ set: s.set_number, weight_kg: s.weight_kg, reps: s.reps, rpe: s.rpe })),
  }));
  // PRs set: one per lift, its best of the session, with the change measured from the best before the session.
  const prs = [...new Set(st.prs.map((p) => p.exercise))].map((name) => {
    const mine = st.prs.filter((p) => p.exercise === name);
    const top = mine.reduce((a, b) => (b.e1rm_kg > a.e1rm_kg ? b : a));
    const prev = mine[0].previous_e1rm_kg;
    return { ...top, previous_e1rm_kg: prev, change_kg: prev === null ? null : r1(top.e1rm_kg - prev) };
  });
  const total_volume_kg = r1(sets.reduce((v, s) => v + s.weight_kg * s.reps, 0));
  const duration_min = Math.max(0, Math.round((now.getTime() - tsMs(row.started_at)) / 60000));

  await (await getDb()).update(schema.workout_sessions)
    .set({ status: "done", ended_at: now.toISOString(), state: { ...st, complete: true }, ...(ctx.extra.sessionId && { mcp_session_id: ctx.extra.sessionId }) })
    .where(eq(schema.workout_sessions.id, row.id));

  const lines = exercises.map((e) => `${e.exercise} ${e.sets.map(kgx).join(", ")}`).join("; ");
  const prLine = prs.length ? `${prs.length} PR${prs.length > 1 ? "s" : ""}: ${prs.map((p) => `${p.exercise} ${kgx(p)}, estimated 1RM ${p.e1rm_kg} kg`).join("; ")}.` : "No PRs.";
  return {
    data: { prs, session_id: row.id, day_name: st.day_name, duration_min, exercises, total_volume_kg },
    text: `Finished ${st.day_name}: ${sets.length} sets in ${duration_min} min, volume ${total_volume_kg} kg. ${lines ? `${lines}. ` : ""}${prLine}`,
  };
});

export const tools = [startWorkout, logSet, swapExercise, finishWorkout];
