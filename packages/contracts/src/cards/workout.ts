import { z } from "zod";
import { DateTimeStr, Pr, SetRow } from "../common.ts";

/** workout: exercise, set X of Y, target weight × reps, rest countdown. `pr` set when the last set was a PR. */
export const WorkoutCard = z.object({
  session_id: z.string(),
  day_name: z.string(),
  exercise: z.string(),
  exercise_index: z.number().int().positive(),
  exercise_count: z.number().int().positive(),
  set_number: z.number().int().positive().describe("The set to do next."),
  set_count: z.number().int().positive(),
  target: z.object({ weight_kg: z.number().nonnegative(), reps: z.number().int().positive() }),
  rest_seconds: z.number().int().nonnegative(),
  rest_ends_at: DateTimeStr.nullable(),
  done_sets: z.array(SetRow).describe("Sets already done for this exercise."),
  pr: Pr.nullable(),
});
export type WorkoutCard = z.infer<typeof WorkoutCard>;
