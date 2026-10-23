// npm run data:load-catalog [-- --target local|aurora] → replaces catalog_items with catalog.json.
import { readFileSync } from "node:fs";
import { connect, schema } from "@dayform/db";
import { Catalog } from "./schema.ts";

const catalog = Catalog.parse(JSON.parse(readFileSync(new URL("catalog.json", import.meta.url), "utf8")));
const withAsin = catalog.filter((c) => c.asin); // catalog_items.asin is NOT NULL
const { db, close } = await connect();
await db.delete(schema.catalog_items);
await db.insert(schema.catalog_items).values(
  withAsin.map((c) => ({
    id: c.id,
    name: c.name,
    asin: c.asin!,
    pack_size: c.pack_label,
    price_usd: c.price_usd,
    price_date: c.price_date,
    food_id: c.food_id,
    url: c.url,
    verified_at: c.verified_at ? new Date(c.verified_at) : null,
  })) as any,
);
console.log(`catalog_items: ${withAsin.length} rows loaded (${catalog.length - withAsin.length} skipped, no ASIN)`);
await close();
