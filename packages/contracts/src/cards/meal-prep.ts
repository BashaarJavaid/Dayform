import { z } from "zod";
import { DateStr, Macros, MealType } from "../common.ts";

export const Recipe = z.object({
  id: z.string(),
  name: z.string(),
  servings: z.number().int().positive(),
  per_serving: Macros,
  ingredients: z.array(z.object({ catalog_item_id: z.string(), name: z.string(), grams: z.number().positive() })),
  steps: z.array(z.string()),
});

export const MealPlan = z.object({
  plan_id: z.string(),
  start_date: DateStr,
  targets: Macros.describe("Daily targets the plan was checked against (±5%, D17)."),
  days: z.array(
    z.object({
      date: DateStr,
      meals: z.array(z.object({ meal: MealType, recipe_id: z.string() })),
      totals: Macros,
      within_tolerance: z.boolean(),
    }),
  ),
  recipes: z.array(Recipe),
  batch_cook: z.object({ total_minutes: z.number().int().positive(), steps: z.array(z.string()) }),
  grocery: z.array(z.object({ catalog_item_id: z.string(), name: z.string(), grams_needed: z.number().positive() })),
});
export type MealPlan = z.infer<typeof MealPlan>;

/** meal-prep: carousel of days, meals, macros per day, batch-cook steps. `plan` is null unless status is ready. */
export const MealPrepCard = z.object({
  status: z.enum(["ready", "preparing", "failed"]),
  message: z.string().nullable().describe("Why it is preparing or failed."),
  plan: MealPlan.nullable(),
});
export type MealPrepCard = z.infer<typeof MealPrepCard>;
