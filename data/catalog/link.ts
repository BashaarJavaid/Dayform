// npm run catalog:link → one Add-to-Cart link with every catalog item (qty 1), written to all-items-link.txt.
import { readFileSync, writeFileSync } from "node:fs";
import { buildCartLink } from "../../smoke/amazon-cart/build-link.ts";
import { Catalog } from "./schema.ts";

const catalog = Catalog.parse(JSON.parse(readFileSync(new URL("catalog.json", import.meta.url), "utf8")));
const items = catalog.filter((c) => c.asin).map((c) => ({ asin: c.asin!, qty: 1 }));
const link = buildCartLink(items);
writeFileSync(new URL("all-items-link.txt", import.meta.url), link + "\n");
const missing = catalog.filter((c) => !c.asin).map((c) => c.id);
console.log(`${items.length} items${missing.length ? `; no ASIN (search link): ${missing.join(", ")}` : ""}\n${link}`);
