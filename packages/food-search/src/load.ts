// npm run data:load-foods -> creates foods + food_terms if missing (data/foods/foods.sql) and reloads them from foods.json.
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { close, db, FOODS_PATH, termsOf, type Food } from "./index.ts";

try { process.loadEnvFile(new URL("../../../.env.local", import.meta.url).pathname); } catch {}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing (.env.local)");

const d = await db();
const ddl = readFileSync(new URL("../../../data/foods/foods.sql", import.meta.url), "utf8");
await d.execute(sql.raw(ddl));
const foods: Food[] = JSON.parse(readFileSync(FOODS_PATH, "utf8"));
const t0 = performance.now();
await (d as any).transaction(async (tx: typeof d) => {
await tx.execute(sql`DELETE FROM food_terms`);
await tx.execute(sql`DELETE FROM foods`);
for (let i = 0; i < foods.length; i += 200) {
  const chunk = foods.slice(i, i + 200);
  await tx.execute(sql`INSERT INTO foods (id, name, aliases, nutrients, portions, default_portion, source, priority) VALUES ${sql.join(
    chunk.map((f) => sql`(${f.id}, ${f.name}, ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(f.aliases)}::jsonb)), ${JSON.stringify(f.nutrients)}::jsonb, ${JSON.stringify(f.portions)}::jsonb, ${f.default_portion}, ${f.source}, ${f.priority})`),
    sql`, `,
  )}`);
  const terms = chunk.flatMap((f) => termsOf(f).map((t) => sql`(${f.id}, ${t})`));
  await tx.execute(sql`INSERT INTO food_terms (food_id, term) VALUES ${sql.join(terms, sql`, `)}`);
}
});
await d.execute(sql`ANALYZE foods; ANALYZE food_terms`);
const { rows } = await d.execute(sql`SELECT (SELECT count(*) FROM foods)::int AS foods, (SELECT count(*) FROM food_terms)::int AS terms`);
console.log(`loaded foods=${rows[0].foods} terms=${rows[0].terms} in ${Math.round(performance.now() - t0)} ms`);
await close();
