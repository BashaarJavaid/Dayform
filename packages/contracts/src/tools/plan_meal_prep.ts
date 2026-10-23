import { z } from "zod";
import { MealPrepCard } from "../cards/meal-prep.ts";
import type { ToolContract } from "./types.ts";

export const plan_meal_prep = {
  name: "plan_meal_prep",
  description:
    "Call when the user wants a meal-prep plan for the coming days. Builds recipes from the grocery catalog, one batch-cook session and a day-by-day plan within 5% of their targets. Returns the plan, or status 'preparing' while a new plan is made; call again to get it.",
  input: z.object({
    days: z.number().int().min(1).max(7).optional().describe("Default: 4."),
    constraints: z.string().optional().describe("Extra wishes in the user's words, e.g. 'no beef, quick lunches'."),
  }),
  output: MealPrepCard,
  card: "meal-prep",
} satisfies ToolContract;
