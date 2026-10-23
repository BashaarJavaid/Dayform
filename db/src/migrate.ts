import { connect } from "./client.ts";

const { db, driver, close } = await connect();
const migrationsFolder = new URL("../migrations", import.meta.url).pathname;
const t = performance.now();
if (driver === "pg") {
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  await migrate(db as any, { migrationsFolder });
} else {
  const { migrate } = await import("drizzle-orm/aws-data-api/pg/migrator");
  await migrate(db as any, { migrationsFolder });
}
console.log(`migrations applied (${driver}) in ${Math.round(performance.now() - t)} ms`);
await close();
