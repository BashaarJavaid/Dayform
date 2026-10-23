import { z } from "zod";
import { DateStr, SetRow } from "../common.ts";
import { PrCard } from "../cards/pr.ts";
import type { ToolContract } from "./types.ts";

export const log_workout = {
  name: "log_workout",
  description:
    "Call when the user reports an exercise they already finished outside a live session, e.g. 'I did 3 sets of 5 squats at 100 kg' or 'I ran 5 km in 28 minutes'. Give sets for strength or cardio for cardio. Returns what was logged, total volume, and any personal records.",
  input: z.object({
    exercise: z.string().min(1).describe("Exercise as the user said it; nicknames are fine."),
    sets: z
      .array(
        z.object({
          reps: z.number().int().positive(),
          weight_kg: z.number().nonnegative().optional(),
          rpe: z.number().min(1).max(10).optional(),
        }),
      )
      .optional(),
    cardio: z
      .object({
        type: z.string(),
        duration_min: z.number().positive(),
        distance_km: z.number().positive().optional(),
      })
      .optional(),
  }),
  output: PrCard.extend({
    date: DateStr,
    exercise: z.string(),
    sets: z.array(SetRow),
    cardio: z.object({ type: z.string(), duration_min: z.number(), distance_km: z.number().nullable() }).nullable(),
    volume_kg: z.number(),
  }),
  card: "pr",
} satisfies ToolContract;
