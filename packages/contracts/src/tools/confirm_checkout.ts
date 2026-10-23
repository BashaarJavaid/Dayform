import { z } from "zod";
import { CheckoutResult } from "./checkout_cart.ts";
import type { ToolContract } from "./types.ts";

/** Only with CHECKOUT_CONFIRM=tool (the 19th tool, T-26): checkout_cart returns awaiting_confirmation, this completes it. */
export const confirm_checkout = {
  name: "confirm_checkout",
  description:
    "Call only after checkout_cart returned status 'awaiting_confirmation' and you have read the items and total to the user. Pass whether the user said yes. Returns the confirmation status and, if confirmed, the Amazon Add-to-Cart link. Alexa never places the order.",
  input: z.object({
    confirm: z.boolean(),
  }),
  output: CheckoutResult,
  card: "cart",
} satisfies ToolContract;
