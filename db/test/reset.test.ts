// Snapshot test (T-11 task 8): two resets in a row produce identical table hashes. Needs local Postgres (DATABASE_URL).
import { afterAll, expect, test } from "vitest";
import { connect } from "../src/client.ts";
import { reset } from "../src/reset.ts";
import { tableHashes } from "../src/hash.ts";

const conn = process.env.DATABASE_URL || process.env.DB_DRIVER === "data-api" ? await connect() : null;
afterAll(() => conn?.close());

test.skipIf(!conn)("two resets give identical hashes, under 3 s each", async () => {
  const t0 = performance.now();
  await reset(conn!.db);
  const ms = performance.now() - t0;
  const a = await tableHashes(conn!.db);
  await reset(conn!.db);
  const b = await tableHashes(conn!.db);
  expect(b).toEqual(a);
  expect(a.find((l) => l.startsWith("sets "))).toBeTruthy();
  expect(ms).toBeLessThan(3000);
});
