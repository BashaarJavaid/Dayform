import { z } from "zod";
import { ProgressCard, ProgressMetric } from "../cards/progress.ts";
import type { ToolContract } from "./types.ts";

export const get_progress = {
  name: "get_progress",
  description:
    "Call when the user asks how they are progressing over time: a lift ('how's my bench going?'), body weight, calories or protein. Returns a weekly series and a summary with start, end and change.",
  input: z.object({
    metric: ProgressMetric.describe("e1rm for a lift (estimated one-rep max)."),
    exercise: z.string().optional().describe("Required when metric is e1rm."),
    range_weeks: z.number().int().min(1).max(26).optional().describe("Default: 6."),
  }),
  output: ProgressCard,
  card: "progress",
} satisfies ToolContract;
