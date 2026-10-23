import { z } from "zod";
import { DateStr } from "../common.ts";
import type { ToolContract } from "./types.ts";

export const log_bodyweight = {
  name: "log_bodyweight",
  description:
    "Call when the user tells you their body weight. Records today's weight. Returns the weight, the 7-day trend weight, and the change over the last week in kg.",
  input: z.object({
    kg: z.number().positive().describe("Body weight in kg. Convert pounds to kg first."),
  }),
  output: z.object({
    date: DateStr,
    kg: z.number(),
    trend_kg: z.number().describe("exponential moving average (alpha 0.1) of daily weights."),
    weekly_change_kg: z.number().describe("Trend change over the last 7 days; negative is a loss."),
  }),
} satisfies ToolContract;
