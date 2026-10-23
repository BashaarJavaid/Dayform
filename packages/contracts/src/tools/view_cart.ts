import { z } from "zod";
import { CartCard } from "../cards/cart.ts";
import type { ToolContract } from "./types.ts";

export const view_cart = {
  name: "view_cart",
  description: "Call when the user asks what is in their cart. Returns the items, packs and estimated total.",
  input: z.object({}),
  output: CartCard,
  card: "cart",
} satisfies ToolContract;
