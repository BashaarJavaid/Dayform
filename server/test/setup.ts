// Tests use their own database (dayform_server_test) in the local Postgres, migrated with T-11's migrations,
// so they never touch the demo data.
import { fileURLToPath } from "node:url";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

try {
  process.loadEnvFile(fileURLToPath(new URL("../../.env.local", import.meta.url)));
} catch {}
const base = new URL(process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5433/dayform");
const test = new URL(base);
test.pathname = "/dayform_server_test";
if (!process.env.__SERVER_TEST_DB) {
  const c = new pg.Client({ connectionString: base.href });
  await c.connect();
  const { rowCount } = await c.query("SELECT 1 FROM pg_database WHERE datname = 'dayform_server_test'");
  if (!rowCount) await c.query("CREATE DATABASE dayform_server_test");
  await c.end();
  const db = drizzle(test.href);
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../db/migrations", import.meta.url)) });
  await db.$client.end();
  process.env.__SERVER_TEST_DB = "1";
}
process.env.DATABASE_URL = test.href;
process.env.DB_DRIVER = "pg";
process.env.ADMIN_TOKEN = "test-token";
