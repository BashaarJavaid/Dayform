// T-26: cart tools through MCP on the seed: aggregation from a plan, link format, elicitation accept/decline
// (also with the GET stream refused, like AgentCore), and two-step mode (CHECKOUT_CONFIRM=tool).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { sql } from "drizzle-orm";
import { add_to_cart, checkout_cart, confirm_checkout, remove_from_cart, view_cart } from "@dayform/contracts";
import { reset } from "../../db/src/reset.ts";
import { createApp } from "../src/app.ts";
import { loadTools } from "../src/core/registry.ts";
import { getDb, query } from "../src/core/db.ts";
import { cartTools } from "../src/tools/cart/index.ts";
import { AmazonCartLinkProvider, SearchLinkProvider, matchItem } from "../src/domain/cart/index.ts";
import { loadCatalog } from "../src/domain/meal-prep/plan.ts";
import { connect, listen } from "./helpers.ts";

const LINK = "https://www.amazon.com/associates/addtocart?AssociateTag=dayform-20&ASIN.1=";
// A T-25-shaped plan row: totals.grocery lines with packs. Eggs are refrigerated (not available on Amazon here).
const GROCERY = [
  { catalog_item_id: "chicken-breast-frozen", name: "Chicken breast (frozen)", grams_needed: 2000, packs: 2 },
  { catalog_item_id: "basmati-rice", name: "Basmati rice", grams_needed: 900, packs: 1 },
  { catalog_item_id: "red-lentils", name: "Red lentils (masoor)", grams_needed: 600, packs: 2 },
  { catalog_item_id: "canned-tomatoes", name: "Diced tomatoes, canned", grams_needed: 1200, packs: 3 },
  { catalog_item_id: "eggs", name: "Eggs, large", grams_needed: 600, packs: 1 },
];

let url: string, url2: string;
let servers: Server[] = [];
beforeAll(async () => {
  process.env.DEMO_MODE = "true";
  await reset((await getDb()) as never);
  const all = await loadTools();
  ({ url, server: servers[0] } = await listen(createApp(all)));
  const twoStep = [...all.filter((t) => !["add_to_cart", "remove_from_cart", "view_cart", "checkout_cart"].includes(t.contract.name)), ...cartTools("tool")];
  ({ url: url2, server: servers[1] } = await listen(createApp(twoStep)));
});
afterAll(() => {
  servers.forEach((s) => s.close());
  delete process.env.DEMO_MODE;
});
beforeEach(async () => {
  await query(sql`DELETE FROM cart_items`);
  await query(sql`DELETE FROM cart_checkouts`);
});

type R = { isError?: boolean; structuredContent?: any; content: { text: string }[]; _meta?: any };
async function session(u = url, opts: Parameters<typeof connect>[1] = {}) {
  const c = await connect(u, opts);
  const call = async (name: string, args: Record<string, unknown> = {}, budget = 500) => {
    const t0 = performance.now();
    const r = (await c.client.callTool({ name, arguments: args })) as R;
    const ms = performance.now() - t0;
    expect(ms, `${name} ${Math.round(ms)} ms`).toBeLessThan(budget);
    return r;
  };
  return { ...c, call };
}

describe("links and matching", () => {
  it("AmazonCartLinkProvider builds the T-05 form", () => {
    expect(AmazonCartLinkProvider.link([{ asin: "B089BWP51D", name: "Basmati rice", packs: 1 }, { asin: "B08P6MF2D9", name: "Red lentils", packs: 2 }])).toBe(
      "https://www.amazon.com/associates/addtocart?AssociateTag=dayform-20&ASIN.1=B089BWP51D&Quantity.1=1&ASIN.2=B08P6MF2D9&Quantity.2=2",
    );
    expect(SearchLinkProvider.link([{ asin: null, name: "Garam masala", packs: 1 }])).toBe("https://www.amazon.com/s?k=Garam%20masala");
  });
  it("matches spoken names to catalog items", () => {
    const cat = loadCatalog();
    const id = (s: string) => matchItem(s, cat)?.id;
    expect(id("rice")).toBe("basmati-rice");
    expect(id("chicken")).toBe("chicken-breast-frozen");
    expect(id("peanut butter")).toBe("peanut-butter");
    expect(id("masoor dal")).toBe("red-lentils");
    expect(id("greek yoghurt")).toBe("greek-yogurt");
    expect(id("olive oil")).toBe("olive-oil");
    expect(id("spaceship")).toBeUndefined();
  });
});

describe("cart tools", () => {
  it("add_to_cart {from_plan} aggregates the plan's grocery list in packs, leaves out unavailable items, and a retry does not double", async () => {
    await query(sql`INSERT INTO meal_plans (status, start_date, end_date, plan, totals, within_tolerance, created_at)
      VALUES ('ready', '2099-01-01', '2099-01-04', ${JSON.stringify({ grocery: GROCERY.map(({ catalog_item_id, name, grams_needed }) => ({ catalog_item_id, name, grams_needed })) })}::jsonb,
      ${JSON.stringify({ constraints: "", grocery: GROCERY })}::jsonb, true, '2099-01-01T00:00:00Z')`);
    const s = await session();
    const r = await s.call("add_to_cart", { from_plan: true });
    expect(r.isError).toBeFalsy();
    const out = add_to_cart.output.parse(r.structuredContent);
    expect(out.items.map((i) => [i.catalog_item_id, i.packs])).toEqual([["chicken-breast-frozen", 2], ["basmati-rice", 1], ["red-lentils", 2], ["canned-tomatoes", 3]]);
    expect(out).toMatchObject({ item_count: 4, pack_count: 8, add_to_cart_url: null });
    expect(out.estimated_total_usd).toBe(Math.round((2 * 10.04 + 8.88 + 2 * 3.96 + 3 * 0.86) * 100) / 100);
    expect(r.content[0].text).toContain("Not available on Amazon in your area, left out: Eggs, large.");
    expect(r._meta.ui.resourceUri).toContain("cart");
    const again = add_to_cart.output.parse((await s.call("add_to_cart", { from_plan: true })).structuredContent);
    expect(again.pack_count).toBe(8);
    expect(again.added).toEqual([]);
    await query(sql`DELETE FROM meal_plans WHERE start_date = '2099-01-01'`);
  });

  it("add_to_cart {items} merges packs; remove_from_cart and view_cart", async () => {
    const s = await session();
    const a = add_to_cart.output.parse((await s.call("add_to_cart", { items: [{ name: "rice" }, { name: "peanut butter", packs: 2 }, { name: "spaceship" }] })).structuredContent);
    expect(a.added).toEqual([{ name: "Basmati rice", packs: 1 }, { name: "Peanut butter, creamy", packs: 2 }]);
    const b = add_to_cart.output.parse((await s.call("add_to_cart", { items: [{ name: "basmati rice", packs: 2 }] })).structuredContent);
    expect(b.items.find((i) => i.catalog_item_id === "basmati-rice")!.packs).toBe(3);
    const rm = remove_from_cart.output.parse((await s.call("remove_from_cart", { item: "peanut butter", quantity: 1 })).structuredContent);
    expect(rm.removed).toEqual({ name: "Peanut butter, creamy", packs: 1 });
    expect(rm.pack_count).toBe(4);
    const rm2 = remove_from_cart.output.parse((await s.call("remove_from_cart", { item: "rice" })).structuredContent);
    expect(rm2.removed.packs).toBe(3);
    const v = view_cart.output.parse((await s.call("view_cart")).structuredContent);
    expect(v.items.map((i) => [i.catalog_item_id, i.packs])).toEqual([["peanut-butter", 1]]);
    expect((await s.call("remove_from_cart", { item: "honey" })).isError).toBe(true);
    expect((await s.call("add_to_cart", { items: [{ name: "spaceship" }] })).isError).toBe(true);
  });
});

describe("checkout_cart with elicitation", () => {
  const fill = (s: Awaited<ReturnType<typeof session>>) =>
    s.call("add_to_cart", { items: ["rice", "red lentils", "chicken", "tuna", "olive oil"].map((name) => ({ name })) });

  it("accept → Add-to-Cart link with every item; the question names items and total; works with the GET stream refused", async () => {
    const s = await session(url, { noGet: true });
    const cart = add_to_cart.output.parse((await fill(s)).structuredContent);
    const r = await s.call("checkout_cart");
    expect(r.isError).toBeFalsy();
    const out = checkout_cart.output.parse(r.structuredContent);
    expect(out.checkout.status).toBe("confirmed");
    expect(out.add_to_cart_url!.startsWith(LINK)).toBe(true);
    for (const [n, i] of cart.items.entries()) expect(out.add_to_cart_url).toContain(`ASIN.${n + 1}=${i.asin}&Quantity.${n + 1}=${i.packs}`);
    expect(s.elicitations).toHaveLength(1);
    expect((s.elicitations[0] as any).message).toBe(`Add 5 items, about $${Math.round(cart.estimated_total_usd)}, to your Amazon cart?`);
    expect((s.elicitations[0] as any).requestedSchema.properties.confirm.type).toBe("boolean");
    const [row] = await query<{ status: string; link: string }>(sql`SELECT status, link FROM cart_checkouts`);
    expect(row).toEqual({ status: "confirmed", link: out.add_to_cart_url });
  });

  it("decline → not sent, cart unchanged; cancel → cancelled", async () => {
    const s = await session(url, { answer: { action: "accept", content: { confirm: false } } });
    await fill(s);
    const before = view_cart.output.parse((await s.call("view_cart")).structuredContent);
    const r = await s.call("checkout_cart");
    const out = checkout_cart.output.parse(r.structuredContent);
    expect(out.checkout.status).toBe("declined");
    expect(out.add_to_cart_url).toBeNull();
    expect(r.content[0].text).toContain("Not sent");
    expect(view_cart.output.parse((await s.call("view_cart")).structuredContent)).toEqual(before);
    const c = await session(url, { answer: { action: "cancel" } });
    expect(checkout_cart.output.parse((await c.call("checkout_cart")).structuredContent).checkout.status).toBe("cancelled");
  });

  it("empty cart → error; confirm_checkout is not registered in elicitation mode", async () => {
    const s = await session();
    expect((await s.call("checkout_cart")).isError).toBe(true);
    expect(s.elicitations).toHaveLength(0);
    const names = (await s.client.listTools()).tools.map((t) => t.name);
    expect(names).toContain("checkout_cart");
    expect(names).not.toContain("confirm_checkout");
  });
});

describe("two-step mode (CHECKOUT_CONFIRM=tool)", () => {
  it("checkout_cart → awaiting_confirmation without elicitation; confirm_checkout yes → link, no → declined", async () => {
    const s = await session(url2);
    expect((await s.client.listTools()).tools.map((t) => t.name)).toContain("confirm_checkout");
    await s.call("add_to_cart", { items: [{ name: "oats" }, { name: "almonds", packs: 2 }] });
    const a = checkout_cart.output.parse((await s.call("checkout_cart")).structuredContent);
    expect(a.checkout.status).toBe("awaiting_confirmation");
    expect(a.add_to_cart_url).toBeNull();
    expect(s.elicitations).toHaveLength(0);
    const no = confirm_checkout.output.parse((await s.call("confirm_checkout", { confirm: false })).structuredContent);
    expect(no.checkout.status).toBe("declined");
    const yes = confirm_checkout.output.parse((await s.call("confirm_checkout", { confirm: true })).structuredContent);
    expect(yes.checkout.status).toBe("confirmed");
    expect(yes.add_to_cart_url).toBe(`${LINK}B01KV4H51G&Quantity.1=1&ASIN.2=B015GK0Z8A&Quantity.2=2`);
  });
});
