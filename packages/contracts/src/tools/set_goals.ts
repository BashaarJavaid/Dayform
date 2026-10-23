import { z } from "zod";
import { Activity, DateStr, DayNumbers, Goal } from "../common.ts";
import { RingsCard } from "../cards/rings.ts";
import type { ToolContract } from "./types.ts";

export const set_goals = {
  name: "set_goals",
  description:
    "Call when the user wants to set or change their goal (lose, maintain or gain weight), their weekly rate, their current weight or their activity level. Recomputes daily targets from their stats. Returns the new daily targets, the previous targets, the reason they changed, and today's intake against them.",
  input: z.object({
    goal: Goal,
    rate_kg_per_week: z.number().min(0).max(1).optional().describe("Target change per week in kg, e.g. 0.5."),
    weight_kg: z.number().positive().optional().describe("Current body weight in kg."),
    activity: Activity.optional(),
  }),
  output: RingsCard.extend({
    goal: Goal,
    rate_kg_per_week: z.number(),
    effective_date: DateStr,
    previous_targets: DayNumbers.nullable(),
    reason: z.string(),
  }),
  card: "rings",
} satisfies ToolContract;
