// Demo clock (DESIGN §8). DEMO_MODE=true: now = demo_clock.demo_now + (real now - set_at), so demo time runs
// from where the seed or an admin route put it. Otherwise real time. All domain code calls `await clock.now()`.
// Table: T-11's `demo_clock` (one row, id 1).
import { sql } from "drizzle-orm";
import { query } from "./db.ts";
import { env } from "./env.ts";

// ISO text in UTC so both drivers parse the same way (the Data API returns timestamps without a zone).
const iso = (col: string) => sql.raw(`to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`);

async function read() {
  const [r] = await query<{ demo_now: string; set_at: string; rest_seconds: number | null }>(
    sql`SELECT ${iso("demo_now")} AS demo_now, ${iso("set_at")} AS set_at, rest_seconds FROM demo_clock WHERE id = 1`,
  );
  return r;
}

async function upsert(demoNow: Date, restSeconds?: number | null) {
  const [now, at] = [new Date().toISOString(), demoNow.toISOString()];
  const rest = restSeconds === undefined ? sql`demo_clock.rest_seconds` : sql`${restSeconds}`;
  await query(sql`INSERT INTO demo_clock (id, demo_now, set_at, rest_seconds)
    VALUES (1, ${at}::timestamptz, ${now}::timestamptz, ${restSeconds ?? null})
    ON CONFLICT (id) DO UPDATE SET demo_now = EXCLUDED.demo_now, set_at = EXCLUDED.set_at, rest_seconds = ${rest}`);
}

export const clock = {
  async now(): Promise<Date> {
    if (!env.demoMode()) return new Date();
    const r = await read();
    if (!r) return new Date(); // no row before the first reset
    return new Date(Date.parse(r.demo_now) + (Date.now() - Date.parse(r.set_at)));
  },
  /** Move demo time to `at` (it runs on from there). */
  async set(at: Date) {
    await upsert(at);
  },
  /** Demo rest-timer override in seconds; null = the program's rest values. */
  async restSeconds(): Promise<number | null> {
    if (!env.demoMode()) return null;
    const r = await read();
    return r?.rest_seconds == null ? null : Number(r.rest_seconds);
  },
  async setRestSeconds(seconds: number | null) {
    await upsert(await clock.now(), seconds);
  },
};
