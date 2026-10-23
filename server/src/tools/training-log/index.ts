// log_workout and get_progress (T-23). No LLM call: resolver, e1RM and PR checks are code (DESIGN §7).
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { get_progress, log_workout, type Pr } from "@dayform/contracts";
import { defineTool, ToolError } from "../../core/registry.ts";
import { clock } from "../../core/clock.ts";
import { getDb, query, schema } from "../../core/db.ts";
import { detectPRs, E1RM_MAX_REPS, localDate, prEntries, resolveExercise } from "../../domain/training/index.ts";

const r1 = (x: number) => Math.round(x * 10) / 10;

async function resolveOrAsk(said: string) {
  const r = await resolveExercise(said);
  if (!r.exercise) throw new ToolError(`No exercise matches "${said}". Closest: ${r.suggestions.join(", ")}.`);
  return r.exercise;
}

const logWorkout = defineTool(log_workout, async ({ exercise: said, sets, cardio }) => {
  const ex = await resolveOrAsk(said);
  const isCardio = ex.type === "cardio";
  if (isCardio && !cardio) throw new ToolError(`${ex.name} is cardio: give a duration in minutes.`);
  if (!isCardio && !sets?.length) throw new ToolError(`${ex.name} needs sets: reps and weight for each.`);

  const now = await clock.now();
  const date = localDate(now);
  const at = now.toISOString();
  const sessionId = `log-${date}-${randomUUID().slice(0, 8)}`;
  const db = await getDb();
  await db.insert(schema.workout_sessions).values({ id: sessionId, day_id: null, date, started_at: at, ended_at: at, status: "done" });

  if (isCardio) {
    const c = cardio!;
    await db.insert(schema.cardio_logs).values({
      session_id: sessionId, exercise_id: ex.id, date, logged_at: at, duration_min: c.duration_min, distance_km: c.distance_km ?? null,
    });
    const dist = c.distance_km ? `, ${c.distance_km} km` : "";
    return {
      data: { prs: [], date, exercise: ex.name, sets: [], cardio: { type: c.type, duration_min: c.duration_min, distance_km: c.distance_km ?? null }, volume_kg: 0 },
      text: `Logged ${ex.name}: ${c.duration_min} min${dist}.`,
    };
  }

  // One set at a time, so a later set is checked against the earlier ones in this log.
  const rows = [];
  const prs: Pr[] = [];
  for (const [i, s] of sets!.entries()) {
    const weight_kg = s.weight_kg ?? 0;
    const check = await detectPRs({ exercise_id: ex.id, weight_kg, reps: s.reps });
    await db.insert(schema.sets).values({
      session_id: sessionId, exercise_id: ex.id, set_number: i + 1, weight_kg, reps: s.reps, rpe: s.rpe ?? null,
      e1rm_kg: check.e1rm_kg, pr_e1rm: check.pr_e1rm, pr_rep_best: check.pr_rep_best, logged_at: at,
    });
    rows.push({ set: i + 1, weight_kg, reps: s.reps, rpe: s.rpe ?? null });
    prs.push(...prEntries(ex.name, { weight_kg, reps: s.reps }, check));
  }
  const volume_kg = r1(rows.reduce((v, s) => v + s.weight_kg * s.reps, 0));
  const setsText = rows.map((s) => `${s.weight_kg} kg × ${s.reps}`).join(", ");
  const prText = prs.length
    ? ` Personal record: ${prs.map((p) => (p.kind === "e1rm" ? `estimated 1RM ${p.e1rm_kg} kg${p.change_kg === null ? "" : `, up ${p.change_kg} kg`}` : `best weight for ${p.reps} reps, ${p.weight_kg} kg`)).join("; ")}.`
    : " No personal record.";
  return {
    data: { prs, date, exercise: ex.name, sets: rows, cardio: null, volume_kg },
    text: `Logged ${ex.name}: ${setsText}. Volume ${volume_kg} kg.${prText}`,
  };
});

type Point = { date: string; value: number };

const getProgress = defineTool(get_progress, async ({ metric, exercise, range_weeks }) => {
  const weeks = range_weeks ?? 6;
  const today = localDate(await clock.now());
  const from = sql`(${today}::date - ${weeks * 7}::int)`;
  let name: string | null = null;
  let rows: Point[];
  // One point per calendar week (Monday start): the week's last date with data; keep the last `weeks` points.
  if (metric === "e1rm") {
    if (!exercise) throw new ToolError("Which lift? Give an exercise for e1rm progress.");
    const ex = await resolveOrAsk(exercise);
    name = ex.name;
    rows = await query<Point>(sql`
      SELECT to_char(max(w.date), 'YYYY-MM-DD') AS date, max(s.e1rm_kg) AS value
      FROM sets s JOIN workout_sessions w ON w.id = s.session_id
      WHERE s.exercise_id = ${ex.id} AND s.reps <= ${E1RM_MAX_REPS} AND w.date >= ${from} AND w.date <= ${today}::date
      GROUP BY date_trunc('week', w.date) ORDER BY 1`);
  } else if (metric === "bodyweight") {
    rows = await query<Point>(sql`
      SELECT to_char(max(date), 'YYYY-MM-DD') AS date, avg(weight_kg) AS value
      FROM bodyweight_logs WHERE date >= ${from} AND date <= ${today}::date
      GROUP BY date_trunc('week', date) ORDER BY 1`);
  } else {
    // Weekly mean of daily totals; today is left out because it is still in progress.
    const col = sql.raw(metric === "calories" ? "kcal" : "protein_g");
    rows = await query<Point>(sql`
      SELECT to_char(max(d.date), 'YYYY-MM-DD') AS date, avg(d.total) AS value
      FROM (SELECT e.date, sum(i.${col}) AS total FROM meal_entries e JOIN meal_items i ON i.entry_id = e.id
            WHERE e.date >= ${from} AND e.date < ${today}::date GROUP BY e.date) d
      GROUP BY date_trunc('week', d.date) ORDER BY 1`);
  }
  const unit = (metric === "calories" ? "kcal" : metric === "protein" ? "g" : "kg") as "kcal" | "g" | "kg";
  const round = (x: number) => (unit === "kcal" ? Math.round(x) : r1(x));
  const series = rows.slice(-weeks).map((r) => ({ date: r.date, value: round(Number(r.value)) }));
  const label = name ?? metric;
  if (!series.length) throw new ToolError(`No ${label} data in the last ${weeks} weeks.`);
  const start = series[0].value;
  const end = series.at(-1)!.value;
  const change = round(end - start);
  const change_pct = start ? r1((change / start) * 100) : 0;
  const what = metric === "e1rm" ? `${name} estimated 1RM` : metric === "bodyweight" ? "Body weight (weekly mean)" : `Daily ${metric} (weekly mean)`;
  return {
    data: { metric, exercise: name, unit, range_weeks: weeks, series, summary: { start, end, change, change_pct } },
    text: `${what}: ${start} ${unit} on ${series[0].date} to ${end} ${unit} on ${series.at(-1)!.date}, ${change >= 0 ? "+" : ""}${change} ${unit} (${change_pct}%) over ${series.length} weeks.`,
  };
});

export const tools = [logWorkout, getProgress];
