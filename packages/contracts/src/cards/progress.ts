import { z } from "zod";
import { DateStr } from "../common.ts";

export const ProgressMetric = z.enum(["e1rm", "bodyweight", "calories", "protein"]);

/** progress: a line chart (6 weeks by default) with a summary. */
export const ProgressCard = z.object({
  metric: ProgressMetric,
  exercise: z.string().nullable().describe("Set when metric is e1rm."),
  unit: z.enum(["kg", "kcal", "g"]),
  range_weeks: z.number().int().positive(),
  series: z.array(z.object({ date: DateStr, value: z.number() })),
  summary: z.object({
    start: z.number(),
    end: z.number(),
    change: z.number(),
    change_pct: z.number(),
  }),
});
export type ProgressCard = z.infer<typeof ProgressCard>;
