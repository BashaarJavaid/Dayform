import { z } from "zod";
import { CartCard } from "../cards/cart.ts";
import type { ToolContract } from "./types.ts";

export const remove_from_cart = {
  name: "remove_from_cart",
  description:
    "Call when the user wants an item taken out of the cart, or fewer packs of it. Returns what was removed and the updated cart.",
  input: z.object({
    item: z.string().min(1),
    quantity: z.number().int().positive().optional().describe("Packs to remove. Default: all."),
  }),
  output: CartCard.extend({
    removed: z.object({ name: z.string(), packs: z.number().int().positive() }),
  }),
  card: "cart",
} satisfies ToolContract;
