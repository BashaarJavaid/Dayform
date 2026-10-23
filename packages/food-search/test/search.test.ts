import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { close, FOODS_PATH, searchFood, searchItems, splitItems, isKnownFood, type Food, type SearchInput, type SearchResult } from "../src/index.ts";

try { process.loadEnvFile(new URL("../../../.env.local", import.meta.url).pathname); } catch {}

type Case = { group: string; phrase?: string; input?: SearchInput; expect: { id: string; grams: number }[] };
const cases: Case[] = JSON.parse(readFileSync(new URL("../../../data/foods/test-phrases.json", import.meta.url), "utf8"));
const foods: Food[] = JSON.parse(readFileSync(FOODS_PATH, "utf8"));
const show = (r: SearchResult) => (r.status === "matched" ? `${r.match.id} ${r.grams}g` : `no_confident_match[${r.candidates.map((c) => c.id).join(",")}]`);

async function accuracy(backend: "memory" | "pg") {
  const failures: string[] = [];
  const ms: number[] = [];
  let ok = 0;
  for (const c of cases) {
    const t = performance.now();
    const got = await searchItems([c.input ?? { food: c.phrase! }], { backend });
    ms.push((performance.now() - t) / Math.max(1, got.length));
    const pass = got.length === c.expect.length && got.every((r, i) => r.status === "matched" && r.match.id === c.expect[i].id && Math.abs(r.grams - c.expect[i].grams) <= 1);
    if (pass) ok++;
    else failures.push(`  [${c.group}] ${JSON.stringify(c.phrase ?? c.input)}: want ${c.expect.map((e) => `${e.id} ${e.grams}g`).join(" + ")}; got ${got.map(show).join(" + ")}`);
  }
  ms.sort((a, b) => a - b);
  const p50 = ms[Math.floor(ms.length / 2)];
  console.log(`[${backend}] top1=${ok}/${cases.length}  p50=${p50.toFixed(2)} ms/item  p95=${ms[Math.floor(ms.length * 0.95)].toFixed(2)} ms/item\n` + (failures.length ? `failures:\n${failures.join("\n")}` : "failures: none"));
  return { ok, p50 };
}

describe("data", () => {
  it("test set has 100 phrases: 30 desi, 20 misheard, 20 units, 30 generic", () => {
    const n = (g: string) => cases.filter((c) => c.group === g).length;
    expect([cases.length, n("desi"), n("misheard"), n("units"), n("generic")]).toEqual([100, 30, 20, 20, 30]);
  });
  it("every desi dish has a source, every food a default portion that exists", () => {
    const desi = foods.filter((f) => !f.id.startsWith("usda-"));
    expect(desi.length).toBeGreaterThanOrEqual(50);
    for (const f of desi) expect(f.source, f.id).toMatch(/^(FNDDS \d+|USDA SR Legacy|recipe: )/);
    for (const f of foods) expect(f.portions[f.default_portion], f.id).toBeGreaterThan(0);
    for (const f of foods) expect(f.nutrients.kcal, f.id).toBeTypeOf("number");
  });
  it("every food the grocery catalog references exists", () => {
    let catalog: { food_id: string }[] = [];
    try { catalog = JSON.parse(readFileSync(new URL("../../../data/catalog/catalog.json", import.meta.url), "utf8")); } catch {}
    const ids = new Set(foods.map((f) => f.id));
    expect(catalog.map((c) => c.food_id).filter((id) => !ids.has(id))).toEqual([]);
  });
});

describe("splitItems", () => {
  it("splits compounds but keeps known compound names", () => {
    expect(splitItems("two rotis, chicken karahi and a mango lassi", isKnownFood)).toEqual(["two rotis", "chicken karahi", "a mango lassi"]);
    expect(splitItems("nihari with naan", isKnownFood)).toEqual(["nihari", "naan"]);
    expect(splitItems("lentil curry with rice", isKnownFood)).toEqual(["lentil curry with rice"]);
  });
});

describe("memory backend", () => {
  it("S1: two rotis, chicken karahi and a mango lassi -> 3 foods, sensible grams", async () => {
    const r = await searchItems([{ food: "two rotis, chicken karahi and a mango lassi" }], { backend: "memory" });
    expect(r.map(show)).toEqual(["roti 80g", "chicken-karahi 250g", "mango-lassi 300g"]);
    const karahi = r[1];
    expect(karahi.status === "matched" && karahi.assumed && karahi.assumptions[0]).toBe("Assumed 1 plate of chicken karahi = 250 g.");
  });
  it("unknown food -> no_confident_match", async () => {
    expect((await searchFood({ food: "quantum flux casserole" }, { backend: "memory" })).status).toBe("no_confident_match");
  });
  it("top-1 accuracy >= 95/100", async () => {
    expect((await accuracy("memory")).ok).toBeGreaterThanOrEqual(95);
  });
});

describe.runIf(process.env.DATABASE_URL)("postgres backend (pg_trgm, run npm run data:load-foods first)", () => {
  afterAll(close);
  it("S1 resolves the same on Postgres", async () => {
    const r = await searchItems([{ food: "two rotis, chicken karahi and a mango lassi" }], { backend: "pg" });
    expect(r.map(show)).toEqual(["roti 80g", "chicken-karahi 250g", "mango-lassi 300g"]);
  });
  it("top-1 accuracy >= 95/100 and search p50 < 30 ms", async () => {
    await searchFood({ food: "warm up" }, { backend: "pg" });
    const { ok, p50 } = await accuracy("pg");
    expect(ok).toBeGreaterThanOrEqual(95);
    expect(p50).toBeLessThan(30);
  });
});
