// Reset to the seed state: truncate user + program tables, bulk-load the generated seed, set the demo clock. Foods/catalog are untouched.
import { sql } from "drizzle-orm";
import { connect } from "./client.ts";
import { PROGRAM_TABLES, USER_TABLES } from "./schema.ts";
import { DEMO_CLOCK, generateSeed } from "../seed/generate.ts";

const CHUNK = 150; // rows per INSERT (keeps each Data API request small)
const IDENTITY_TABLES = ["targets", "meal_entries", "meal_items", "water_logs", "bodyweight_logs", "sets", "cardio_logs", "next_targets", "meal_plans", "cart_items", "cart_checkouts"];

export async function reset(db: Awaited<ReturnType<typeof connect>>["db"]) {
  const tables = generateSeed();
  await (db as any).transaction(async (tx: any) => {
    await tx.execute(sql.raw(`TRUNCATE ${[...PROGRAM_TABLES, ...USER_TABLES].join(", ")} RESTART IDENTITY CASCADE`));
    for (const [t, rows] of Object.entries(tables)) {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const json = JSON.stringify(rows.slice(i, i + CHUNK));
        await tx.execute(sql`INSERT INTO ${sql.identifier(t)} SELECT * FROM json_populate_recordset(NULL::${sql.identifier(t)}, ${json}::json)`);
      }
    }
    await tx.execute(sql`INSERT INTO demo_clock (id, demo_now, set_at, rest_seconds) VALUES (1, ${DEMO_CLOCK}::timestamptz, now(), NULL)`);
    // Explicit ids were inserted; move each identity past them so the server's inserts continue cleanly.
    await tx.execute(sql.raw(`SELECT ${IDENTITY_TABLES.map((t) => `setval(pg_get_serial_sequence('${t}', 'id'), (SELECT coalesce(max(id), 0) + 1 FROM ${t}), false)`).join(", ")}`));
  });
  return Object.fromEntries(Object.entries(tables).map(([t, r]) => [t, r.length]));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const t0 = performance.now();
  const { db, driver, close } = await connect();
  const counts = await reset(db);
  const ms = Math.round(performance.now() - t0);
  console.log(`reset (${driver}) in ${ms} ms; clock ${DEMO_CLOCK}`);
  console.log(Object.entries(counts).filter(([, n]) => n).map(([t, n]) => `${t}=${n}`).join(" "));
  await close();
}
