// Summary of the seed: weight trend, intake, protein on training vs rest days, bench e1RM by week, last check-in, S3 PR check.
import { sql } from "drizzle-orm";
import { connect, rows } from "./client.ts";

const { db, close } = await connect();
const num = (x: any) => Number(x);
const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const f1 = (x: number) => x.toFixed(1);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

const [clock] = await rows<any>(db, sql`SELECT to_char(demo_now AT TIME ZONE 'Asia/Karachi', 'YYYY-MM-DD HH24:MI') AS now, (demo_now AT TIME ZONE 'Asia/Karachi')::date::text AS day FROM demo_clock`);
const [profile] = await rows<any>(db, sql`SELECT name, goal, rate_kg_per_week, checkin_weekday FROM profile`);
const weights = await rows<any>(db, sql`SELECT date::text AS date, weight_kg FROM bodyweight_logs ORDER BY date`);
const days = await rows<any>(db, sql`
  SELECT e.date::text AS date, sum(i.kcal) AS kcal, sum(i.protein_g) AS protein,
         EXISTS (SELECT 1 FROM workout_sessions s WHERE s.date = e.date) AS training
  FROM meal_entries e JOIN meal_items i ON i.entry_id = e.id GROUP BY e.date ORDER BY e.date`);
const bench = await rows<any>(db, sql`
  SELECT s.date::text AS date, max(x.e1rm_kg) AS e1rm, string_agg(x.weight_kg || 'x' || x.reps, ' ' ORDER BY x.set_number) AS sets
  FROM sets x JOIN workout_sessions s ON s.id = x.session_id WHERE x.exercise_id = 'barbell-bench-press' GROUP BY s.date ORDER BY s.date`);
const targets = await rows<any>(db, sql`SELECT effective_date::text AS d, kcal, protein_g, carbs_g, fat_g, water_ml, source, reason FROM targets ORDER BY effective_date`);
const next = await rows<any>(db, sql`SELECT exercise_id, weight_kg, reps FROM next_targets WHERE for_date = ${clock.day}::date ORDER BY id`);

console.log(`Demo clock: ${clock.now} (Asia/Karachi). User: ${profile.name}, goal ${profile.goal} ${profile.rate_kg_per_week} kg/week, check-in weekday ${profile.checkin_weekday} (0=Sun).`);

console.log(`\nWeight, weekly mean (7-day weeks ending ${addDays(clock.day, -1)}):`);
const last = addDays(clock.day, -1);
const weekOf = (d: string) => Math.floor((Date.parse(last) - Date.parse(d)) / (7 * 864e5)); // 0 = last week
const weeks = [5, 4, 3, 2, 1, 0].map((w) => ({ w, ws: weights.filter((x) => weekOf(x.date) === w) }));
let prev: number | null = null;
for (const { w, ws } of weeks) {
  const m = avg(ws.map((x) => num(x.weight_kg)));
  console.log(`  ${ws[0].date}..${ws.at(-1).date}  ${f1(m)} kg${prev == null ? "" : `  ${(m - prev >= 0 ? "+" : "") + (m - prev).toFixed(2)} kg/week`}`);
  prev = m;
}
const win = (end: string) => avg(weights.filter((x) => x.date <= end && x.date > addDays(end, -7)).map((x) => num(x.weight_kg)));
const checkin = addDays(clock.day, 1);
console.log(`  Next check-in ${checkin}: mean of 7 days to ${clock.day} (data to ${weights.at(-1).date}) vs the 7 days before: ${(win(clock.day) - win(addDays(clock.day, -7))).toFixed(2)} kg (plan -${profile.rate_kg_per_week})`);

console.log(`\nIntake, weekly mean:`);
for (const { w } of weeks) {
  const ds = days.filter((x) => weekOf(x.date) === w);
  console.log(`  ${ds[0].date}..${ds.at(-1).date}  ${Math.round(avg(ds.map((x) => num(x.kcal))))} kcal  ${Math.round(avg(ds.map((x) => num(x.protein))))} g protein`);
}
const tr = days.filter((x) => x.training), re = days.filter((x) => !x.training);
console.log(`  Protein: training days ${Math.round(avg(tr.map((x) => num(x.protein))))} g (n=${tr.length}), rest days ${Math.round(avg(re.map((x) => num(x.protein))))} g (n=${re.length}); calories ${Math.round(avg(tr.map((x) => num(x.kcal))))} vs ${Math.round(avg(re.map((x) => num(x.kcal))))}`);

console.log(`\nBench press, best e1RM per session (Epley):`);
for (const b of bench) console.log(`  ${b.date}  ${f1(num(b.e1rm))} kg   ${b.sets}`);
const best = Math.max(...bench.map((b) => num(b.e1rm)));
const s3 = next.find((n) => n.exercise_id === "barbell-bench-press");
if (s3) {
  const e = num(s3.weight_kg) * (1 + num(s3.reps) / 30);
  console.log(`  S3 target ${clock.day}: ${s3.weight_kg} kg x ${s3.reps} -> e1RM ${f1(e)} vs best ${f1(best)}: ${e > best ? `NEW PR (+${f1(e - best)} kg)` : "NOT a PR"}`);
}

console.log(`\nTargets:`);
for (const t of targets) console.log(`  ${t.d} ${t.source.padEnd(7)} ${t.kcal} kcal P${t.protein_g} C${t.carbs_g} F${t.fat_g} water ${t.water_ml} ml`);
console.log(`  Last check-in: ${targets.at(-1).d}: ${targets.at(-1).reason}`);
const [today] = await rows<any>(db, sql`
  SELECT count(DISTINCT e.id)::int AS entries, string_agg(DISTINCT e.said, '; ') AS said, sum(i.kcal) AS kcal, sum(i.protein_g) AS protein_g, sum(i.carbs_g) AS carbs_g, sum(i.fat_g) AS fat_g
  FROM meal_entries e JOIN meal_items i ON i.entry_id = e.id WHERE e.date = ${clock.day}::date`);
const [tw] = await rows<any>(db, sql`SELECT weight_kg FROM bodyweight_logs WHERE date = ${clock.day}::date`);
const tt = targets.filter((t) => t.d <= clock.day).at(-1);
console.log(`\nDemo day so far (${clock.day}, before ${clock.now.slice(11)}): weigh-in ${tw ? `${tw.weight_kg} kg` : "none"}; ${today.entries} entr${today.entries === 1 ? "y" : "ies"}: ${today.said ?? "-"}`);
for (const [k, label] of [["kcal", "kcal"], ["protein_g", "protein g"], ["carbs_g", "carbs g"], ["fat_g", "fat g"]] as const) {
  const eaten = Math.round(num(today[k] ?? 0));
  console.log(`  ${label.padEnd(10)} eaten ${String(eaten).padStart(4)} / target ${String(tt[k]).padStart(4)}  remaining ${Math.round(num(tt[k]) - eaten)}`);
}
console.log(`\nNext targets for ${clock.day}: ${next.map((n) => `${n.exercise_id} ${n.weight_kg}x${n.reps}`).join(", ")}`);
await close();
