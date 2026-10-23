// Grocery catalog item (T-13): DESIGN §6 catalog_items plus the fields T-25 needs to turn grams into packs.
import { z } from "zod";
import { DateStr, DateTimeStr } from "./common.ts";
import { CartItem } from "./cards/cart.ts";

export const CatalogItem = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  name: z.string().min(1),
  category: z.enum(["protein", "grains_pulses", "dairy", "produce", "spices", "fats", "snacks", "other"]),
  storage: z.enum(["shelf_stable", "refrigerated", "frozen", "fresh"]),
  asin: CartItem.shape.asin.nullable(),
  title: z.string().min(1),
  pack_label: z.string().min(1).describe("Shown as CartItem.pack_size."),
  pack_size: z.number().positive(),
  pack_unit: z.enum(["g", "ml", "count"]),
  grams_per_pack: z.number().positive().describe("Edible weight of one pack, for grams → packs."),
  price_usd: z.number().positive(),
  price_date: DateStr,
  food_id: z.string().regex(/^(usda-\d+|[a-z]+(-[a-z]+)*)$/),
  url: z.string().url(),
  availability: z.string(),
  sold_by: z.string(),
  verified_at: DateTimeStr.nullable(),
});
export const Catalog = z.array(CatalogItem).min(1);
export type CatalogItem = z.infer<typeof CatalogItem>;
