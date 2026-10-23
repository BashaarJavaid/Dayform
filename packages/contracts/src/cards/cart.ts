import { z } from "zod";
import { DateStr } from "../common.ts";

export const CartItem = z.object({
  catalog_item_id: z.string(),
  name: z.string(),
  asin: z.string().regex(/^[A-Z0-9]{10}$/),
  pack_size: z.string(),
  packs: z.number().int().positive(),
  unit_price_usd: z.number().nonnegative(),
  line_total_usd: z.number().nonnegative(),
});
export type CartItem = z.infer<typeof CartItem>;

/** cart: items, packs, estimated total, "Open Amazon cart" button and QR code (from add_to_cart_url). */
export const CartCard = z.object({
  items: z.array(CartItem),
  item_count: z.number().int().nonnegative().describe("Distinct items."),
  pack_count: z.number().int().nonnegative(),
  estimated_total_usd: z.number().nonnegative(),
  price_date: DateStr.describe("When the catalog prices were read."),
  add_to_cart_url: z
    .string()
    .url()
    .nullable()
    .describe("Amazon Add-to-Cart link; set once the user confirmed checkout (D9, D15)."),
});
export type CartCard = z.infer<typeof CartCard>;
