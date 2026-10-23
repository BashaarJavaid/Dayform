// T-04 smoke: pg_trgm fuzzy search through Drizzle, local Postgres (node-postgres) or Aurora (Data API).
// Usage: npx tsx smoke/aurora/run.ts --target local|aurora
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";

try { process.loadEnvFile(new URL("../../.env.local", import.meta.url).pathname); } catch {}

const target = process.argv[process.argv.indexOf("--target") + 1];
if (target !== "local" && target !== "aurora") throw new Error("usage: run.ts --target local|aurora");

async function connect() {
  if (target === "local") {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing in .env.local");
    return drizzle(process.env.DATABASE_URL);
  }
  const { drizzle } = await import("drizzle-orm/aws-data-api/pg");
  const { RDSDataClient } = await import("@aws-sdk/client-rds-data");
  for (const k of ["AURORA_CLUSTER_ARN", "AURORA_SECRET_ARN"]) if (!process.env[k]) throw new Error(`${k} missing in .env.local`);
  return drizzle(new RDSDataClient({}), {
    database: process.env.AURORA_DATABASE ?? "dayform",
    resourceArn: process.env.AURORA_CLUSTER_ARN!,
    secretArn: process.env.AURORA_SECRET_ARN!,
  });
}

const db = await connect();
const names = readFileSync(new URL("./foods.txt", import.meta.url), "utf8").split("\n").filter(Boolean);

// Setup (idempotent): extension, table, 1,500 rows, GIN trigram index.
await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
await db.execute(sql`DROP TABLE IF EXISTS smoke_foods`);
await db.execute(sql`CREATE TABLE smoke_foods (name text)`);
for (let i = 0; i < names.length; i += 250) {
  const rows = names.slice(i, i + 250).map((n) => sql`(${n})`);
  await db.execute(sql`INSERT INTO smoke_foods (name) VALUES ${sql.join(rows, sql`, `)}`);
}
await db.execute(sql`CREATE INDEX smoke_foods_name_trgm ON smoke_foods USING gin (name gin_trgm_ops)`);
const count = (await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM smoke_foods`)).rows[0].n;
const version = (await db.execute<{ v: string }>(sql`SELECT version() AS v`)).rows[0].v;
console.log(`target=${target} rows=${count}\n${version}`);

const search = (q: string) =>
  db.execute<{ name: string; s: number }>(
    sql`SELECT name, similarity(name, ${q}) AS s FROM smoke_foods ORDER BY s DESC LIMIT 5`,
  );

for (const q of ["roti", "rotee", "chiken karahi", "biryani"]) {
  const { rows } = await search(q);
  console.log(`\n"${q}":`);
  for (const r of rows) console.log(`  ${Number(r.s).toFixed(3)}  ${r.name}`);
}

const ms: number[] = [];
for (let i = 0; i < 20; i++) {
  const t = performance.now();
  await search("rotee");
  ms.push(performance.now() - t);
}
ms.sort((a, b) => a - b);
console.log(`\np50=${Math.round(ms[9])}ms (min=${Math.round(ms[0])} max=${Math.round(ms[19])}, n=20)`);

const top = (await search("rotee")).rows[0]?.name;
if (top !== "roti") { console.error(`FAIL: "rotee" top result is "${top}", expected "roti"`); process.exit(1); }
console.log(`PASS: "rotee" -> "roti"`);
process.exit(0);
