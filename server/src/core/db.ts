// Database access: T-11's @dayform/db (Drizzle + schema; T-04 drivers chosen by DB_DRIVER=pg|data-api).
// Domain code: `const db = await getDb()` and the tables from `schema`, or `query(sql\`...\`)` for raw SQL.
import type { SQL } from "drizzle-orm";
import { connect, rows, schema, type Db } from "@dayform/db";
import { env } from "./env.ts";

export { schema, type Db };
let conn: ReturnType<typeof connect> | undefined;

export async function getDb(): Promise<Db> {
  conn ??= connect(env.dbDriver()).catch((e) => {
    conn = undefined;
    throw e;
  });
  return (await conn).db;
}

/** Rows of a raw query, same shape for both drivers. */
export async function query<T>(q: SQL): Promise<T[]> {
  return rows<T>(await getDb(), q);
}
