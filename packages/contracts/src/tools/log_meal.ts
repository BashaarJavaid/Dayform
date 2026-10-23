import { z } from "zod";
import { MealType } from "../common.ts";
import { MealLoggedCard } from "../cards/meal-logged.ts";
import type { ToolContract } from "./types.ts";

export const log_meal = {
  name: "log_meal",
  description:
    "Call when the user says what they ate or drank (other than plain water). Pass each food as the user said it; leave quantity and unit out if they did not say them. Matches foods, desi dishes included, logs the meal and computes nutrients. Returns the logged items with portions, any assumptions to tell the user (for example an assumed standard portion, or an estimated food), the meal totals, and today's totals and what is left against targets.",
  input: z.object({
    items: z
      .array(
        z.object({
          food: z.string().min(1).describe("The food as the user said it, e.g. 'chicken karahi'."),
          quantity: z.number().positive().optional(),
          unit: z.string().optional().describe("e.g. 'plate', 'cup', 'g', 'roti'."),
        }),
      )
      .min(1),
    meal: MealType.optional().describe("Leave out to infer from the time of day."),
  }),
  output: MealLoggedCard.extend({
    assumptions: z.array(z.string()).describe("Things to tell the user that were assumed or estimated."),
  }),
  card: "meal-logged",
} satisfies ToolContract;
