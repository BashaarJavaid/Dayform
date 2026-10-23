import { z } from "zod";
import { DateTimeStr, DayNumbers, Macros, MealType } from "../common.ts";

export const MealItem = z.object({
  food: z.string().describe("Matched food name."),
  said: z.string().describe("The words the user said for this item."),
  quantity: z.number().positive(),
  unit: z.string(),
  grams: z.number().positive(),
  macros: Macros,
  assumed: z.boolean().describe("True when the portion was a standard portion, not what the user said (D5)."),
  estimated: z.boolean().describe("True when the reasoning model estimated the nutrients (D4)."),
  assumption: z.string().nullable().describe("The assumption in words, for Alexa to say."),
});
export type MealItem = z.infer<typeof MealItem>;

/** meal-logged: items with portions, assumed and estimated badges, meal totals, and the day. */
export const MealLoggedCard = z.object({
  entry: z.object({
    id: z.string(),
    meal: MealType,
    logged_at: DateTimeStr,
    items: z.array(MealItem),
    totals: Macros,
  }),
  day: z.object({
    eaten: DayNumbers,
    targets: DayNumbers,
    remaining: DayNumbers,
  }),
});
export type MealLoggedCard = z.infer<typeof MealLoggedCard>;
