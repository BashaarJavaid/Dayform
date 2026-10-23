import { z } from "zod";
import { MealLoggedCard } from "../cards/meal-logged.ts";
import type { ToolContract } from "./types.ts";

export const correct_meal = {
  name: "correct_meal",
  description:
    "Call when the user corrects a meal they already logged, e.g. 'actually, make that one roti' or 'I didn't have the lassi'. Changes the last logged meal unless an entry is given. Returns the updated meal, what changed, and today's new totals and remaining.",
  input: z.object({
    entry_id: z.string().optional().describe("Meal entry to change. Default: the last logged meal."),
    changes: z
      .array(
        z.object({
          food: z.string().min(1),
          action: z.enum(["set_quantity", "remove", "add"]),
          quantity: z.number().positive().optional(),
          unit: z.string().optional(),
        }),
      )
      .min(1),
  }),
  output: MealLoggedCard.extend({
    changes_applied: z.array(z.string()),
  }),
  card: "meal-logged",
} satisfies ToolContract;
