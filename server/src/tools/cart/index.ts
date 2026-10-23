// T-26 cart tools: add_to_cart, remove_from_cart, view_cart, checkout_cart, and confirm_checkout only when
// CHECKOUT_CONFIRM=tool (hosts without elicitation). Alexa never places an order (D9): checkout returns an
// Amazon Add-to-Cart link once the user said yes.
import { add_to_cart, checkout_cart, confirm_checkout, remove_from_cart, view_cart } from "@dayform/contracts";
import { defineTool, ToolError } from "../../core/registry.ts";
import { env } from "../../core/env.ts";
import {
  addFromPlan, addNamed, cartCard, cartFacts, cartLinks, confirmMessage, readCart, recordCheckout, removeItem, type AddResult,
} from "../../domain/cart/index.ts";

const list = (xs: string[]) => xs.join(", ");
const addFacts = (r: AddResult) => [
  r.added.length ? `Added ${list(r.added.map((a) => `${a.packs} × ${a.name}`))}.` : "Nothing new added.",
  r.unavailable.length ? `Not available on Amazon in your area, left out: ${list(r.unavailable)}.` : "",
  r.unknown.length ? `Not in the grocery catalog: ${list(r.unknown)}.` : "",
];

type Status = "confirmed" | "declined" | "cancelled";
/** Finish a checkout the user answered: the link on yes, the cart kept either way. */
async function finish(status: Status) {
  const rows = await readCart();
  if (!rows.length) throw new ToolError("The cart is empty.");
  const { link, search } = cartLinks(rows);
  const card = cartCard(rows, status === "confirmed" ? link : null);
  await recordCheckout(status, card);
  const text =
    status === "confirmed"
      ? [`Confirmed: ${card.item_count} items, ${card.pack_count} packs, about $${card.estimated_total_usd.toFixed(2)}. Amazon Add-to-Cart link ready.`,
         "Nothing is ordered; the user checks out on Amazon.", search.length ? `Search links for items without an ASIN: ${search.join(" ")}` : ""]
      : [`Not sent (${status}). The cart is unchanged.`, cartFacts(card)];
  return { data: { ...card, checkout: { status } }, text: text.filter(Boolean).join(" ") };
}

export function cartTools(mode: "elicitation" | "tool") {
  const tools = [
    defineTool(add_to_cart, async ({ from_plan, items }) => {
      if (!from_plan && !items?.length) throw new ToolError("Say which groceries to add, or add the meal-prep plan's list.");
      const r: AddResult & { planId?: number } = { added: [], unavailable: [], unknown: [] };
      if (from_plan) {
        const p = await addFromPlan();
        if (p.planId === undefined) throw new ToolError("There is no ready meal-prep plan yet. Plan the meal prep first.");
        Object.assign(r, p);
      }
      if (items?.length) {
        const n = await addNamed(items);
        r.added.push(...n.added), r.unavailable.push(...n.unavailable), r.unknown.push(...n.unknown);
      }
      if (!r.added.length && !from_plan && r.unknown.length) throw new ToolError(`Not in the grocery catalog: ${list(r.unknown)}.`);
      const card = cartCard(await readCart());
      return { data: { ...card, added: r.added }, text: [...addFacts(r), cartFacts(card)].filter(Boolean).join(" ") };
    }),

    defineTool(remove_from_cart, async ({ item, quantity }) => {
      const removed = await removeItem(item, quantity);
      if (!removed) throw new ToolError(`${item} is not in the cart.`);
      const card = cartCard(await readCart());
      return { data: { ...card, removed }, text: `Removed ${removed.packs} × ${removed.name}. ${cartFacts(card)}` };
    }),

    defineTool(view_cart, async () => {
      const card = cartCard(await readCart());
      return { data: card, text: cartFacts(card) };
    }),

    defineTool(checkout_cart, async (_args, ctx) => {
      const card = cartCard(await readCart());
      if (!card.item_count) throw new ToolError("The cart is empty.");
      if (mode === "tool")
        return {
          data: { ...card, checkout: { status: "awaiting_confirmation" as const } },
          text: `Awaiting the user's yes or no, then call confirm_checkout. ${cartFacts(card)}`,
        };
      const r = await ctx.elicit({
        message: confirmMessage(card),
        requestedSchema: { type: "object", properties: { confirm: { type: "boolean", title: "Add to Amazon cart" } }, required: ["confirm"] },
      });
      return finish(r.action === "accept" && r.content?.confirm !== false ? "confirmed" : r.action === "cancel" ? "cancelled" : "declined");
    }),
  ];
  if (mode === "tool") tools.push(defineTool(confirm_checkout, async ({ confirm }) => finish(confirm ? "confirmed" : "declined")) as never);
  return tools;
}

export const tools = cartTools(env.checkoutConfirm());
