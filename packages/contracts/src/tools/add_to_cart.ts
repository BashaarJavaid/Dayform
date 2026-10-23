import { z } from "zod";
import { CartCard } from "../cards/cart.ts";
import type { ToolContract } from "./types.ts";

export const add_to_cart = {
  name: "add_to_cart",
  description:
    "Call when the user wants groceries added to their cart: everything the current meal-prep plan needs (from_plan), or named items. Adds catalog items in whole packs. Returns what was added and the cart with the estimated total. Does not order anything.",
  input: z.object({
    from_plan: z.boolean().optional().describe("True to add the current meal-prep plan's grocery list."),
    items: z.array(z.object({ name: z.string().min(1), packs: z.number().int().positive().optional() })).optional(),
  }),
  output: CartCard.extend({
    added: z.array(z.object({ name: z.string(), packs: z.number().int().positive() })),
  }),
  card: "cart",
} satisfies ToolContract;
