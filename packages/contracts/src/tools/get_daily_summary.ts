import { z } from "zod";
import { DateStr, DateTimeStr, Macros, MealType } from "../common.ts";
import { RingsCard } from "../cards/rings.ts";
import type { ToolContract } from "./types.ts";

export const get_daily_summary = {
  name: "get_daily_summary",
  description:
    "Call when the user asks how their day is going, what they have eaten, or how much they have left. Returns the day's totals against targets (calories, protein, carbs, fat, fiber, sodium, water) and the meals logged.",
  input: z.object({
    date: DateStr.optional().describe("Default: today."),
  }),
  output: RingsCard.extend({
    meals: z.array(
      z.object({
        id: z.string(),
        meal: MealType,
        logged_at: DateTimeStr,
        item_count: z.number().int().nonnegative(),
        totals: Macros,
      }),
    ),
  }),
  card: "rings",
} satisfies ToolContract;
