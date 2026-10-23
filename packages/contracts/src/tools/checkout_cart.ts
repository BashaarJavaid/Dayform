import { z } from "zod";
import { CartCard } from "../cards/cart.ts";
import type { ToolContract } from "./types.ts";

export const CheckoutResult = CartCard.extend({
  checkout: z.object({
    status: z.enum(["confirmed", "declined", "cancelled", "awaiting_confirmation"]),
  }),
});

export const checkout_cart = {
  name: "checkout_cart",
  description:
    "Call when the user wants to send their cart to Amazon. Asks the user to confirm the items and total first. Alexa never places the order: on confirmation it returns an Amazon Add-to-Cart link, and the user checks out on Amazon. Returns the confirmation status, the link and the total.",
  input: z.object({}),
  output: CheckoutResult,
  card: "cart",
} satisfies ToolContract;
