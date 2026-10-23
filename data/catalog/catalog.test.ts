import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Catalog } from "./schema.ts";

const catalog = Catalog.parse(JSON.parse(readFileSync(new URL("catalog.json", import.meta.url), "utf8")));

describe("grocery catalog", () => {
  it("validates, with about 40 items", () => {
    expect(catalog.length).toBeGreaterThanOrEqual(35);
  });
  it("has unique ids and ASINs", () => {
    expect(new Set(catalog.map((c) => c.id)).size).toBe(catalog.length);
    const asins = catalog.flatMap((c) => (c.asin ? [c.asin] : []));
    expect(new Set(asins).size).toBe(asins.length);
  });
  it("links each ASIN to its own product page", () => {
    for (const c of catalog) if (c.asin) expect(c.url).toBe(`https://www.amazon.com/dp/${c.asin}`);
  });
  it("reports food_ids not yet in data/foods/foods.json (T-12)", () => {
    const f = new URL("../foods/foods.json", import.meta.url);
    if (!existsSync(f)) return;
    const ids = new Set((JSON.parse(readFileSync(f, "utf8")) as { id: string }[]).map((x) => x.id));
    const missing = catalog.filter((c) => !ids.has(c.food_id)).map((c) => c.food_id);
    if (missing.length) console.warn(`food_ids missing from foods.json: ${missing.join(", ")}`);
  });
});
