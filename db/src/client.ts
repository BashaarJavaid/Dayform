// DB_DRIVER=pg (local Postgres, DATABASE_URL) | data-api (Aurora via RDS Data API). Scripts also take --target local|aurora.
import { sql } from "drizzle-orm";
import * as schema from "./schema.ts";

try { process.loadEnvFile(new URL("../../.env.local", import.meta.url).pathname); } catch {}

export type Driver = "pg" | "data-api";

export function driverFromArgs(argv = process.argv): Driver {
  const i = argv.indexOf("--target");
  if (i >= 0) {
    const t = argv[i + 1];
    if (t === "local") return "pg";
    if (t === "aurora") return "data-api";
    throw new Error("--target must be local or aurora");
  }
  const d = process.env.DB_DRIVER ?? "pg";
  if (d !== "pg" && d !== "data-api") throw new Error(`DB_DRIVER must be pg or data-api, got ${d}`);
  return d;
}

export async function connect(driver: Driver = driverFromArgs()) {
  if (driver === "pg") {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing in .env.local");
    const db = drizzle(process.env.DATABASE_URL, { schema });
    return { db, driver, close: () => db.$client.end() };
  }
  const { drizzle } = await import("drizzle-orm/aws-data-api/pg");
  const { RDSDataClient } = await import("@aws-sdk/client-rds-data");
  for (const k of ["AURORA_CLUSTER_ARN", "AURORA_SECRET_ARN"]) if (!process.env[k]) throw new Error(`${k} missing in .env.local`);
  const client = new RDSDataClient({});
  const db = drizzle(client, {
    schema,
    database: process.env.AURORA_DATABASE ?? "dayform",
    resourceArn: process.env.AURORA_CLUSTER_ARN!,
    secretArn: process.env.AURORA_SECRET_ARN!,
  });
  return { db, driver, close: async () => client.destroy() };
}

export type Db = Awaited<ReturnType<typeof connect>>["db"];

/** Rows of a raw query, same shape for both drivers. */
export async function rows<T>(db: Db, q: ReturnType<typeof sql>): Promise<T[]> {
  const r: any = await (db as any).execute(q);
  return (r.rows ?? r) as T[];
}
