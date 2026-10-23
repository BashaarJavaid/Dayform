import { z } from "zod";
import { DateStr, DayNumbers, Macros } from "../common.ts";

/** brief: yesterday, one insight, today's workout and targets, why targets changed. Every number is checked against the DB. */
export const BriefCard = z.object({
  date: DateStr,
  yesterday: z.object({
    eaten: Macros,
    targets: Macros,
    workout: z.string().nullable().describe("Session name, or null for a rest day."),
  }),
  weight: z.object({
    change_kg_week: z.number(),
    planned_kg_week: z.number(),
  }),
  insight: z.string(),
  today: z.object({
    workout: z
      .object({
        day_name: z.string(),
        lead: z.object({ exercise: z.string(), weight_kg: z.number(), reps: z.number().int().positive() }),
      })
      .nullable(),
    targets: DayNumbers,
  }),
  targets_change: z
    .object({ kcal_delta: z.number(), previous_kcal: z.number(), reason: z.string() })
    .nullable()
    .describe("Null when targets did not change."),
});
export type BriefCard = z.infer<typeof BriefCard>;
