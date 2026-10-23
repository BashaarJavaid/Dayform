// One md5 per table over every row (demo_clock: demo_now and rest_seconds only, set_at is wall time). Two resets must print the same.
import { sql } from "drizzle-orm";
import { connect, rows, type Db } from "./client.ts";
import { PROGRAM_TABLES, USER_TABLES } from "./schema.ts";

const source = (t: string) => (t === "demo_clock" ? "(SELECT demo_now, rest_seconds FROM demo_clock)" : t);
const q = [...PROGRAM_TABLES, ...USER_TABLES]
  .map((t) => `SELECT '${t}' AS t, count(*)::int AS n, md5(coalesce(string_agg(x::text, E'\\n' ORDER BY x::text), '')) AS h FROM ${source(t)} x`)
  .join(" UNION ALL ");

export async function tableHashes(db: Db) {
  return (await rows<{ t: string; n: number; h: string }>(db, sql.raw(q))).map((r) => `${r.t.padEnd(18)} ${String(r.n).padStart(4)} ${r.h}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { db, close } = await connect();
  console.log((await tableHashes(db)).join("\n"));
  await close();
}
