import { z } from "zod";
import { SetRow } from "../common.ts";
import { WorkoutCard } from "../cards/workout.ts";
import type { ToolContract } from "./types.ts";

export const log_set = {
  name: "log_set",
  description:
    "Call during a live session when the user finishes a set, e.g. 'done, eight reps'. Weight defaults to the set's target. Records the set and checks for a personal record. Returns the logged set, whether it was a PR, the rest time, and the next set's target.",
  input: z.object({
    reps: z.number().int().positive(),
    weight_kg: z.number().nonnegative().optional().describe("Default: the target weight."),
    rpe: z.number().min(1).max(10).optional(),
  }),
  output: WorkoutCard.extend({
    logged: SetRow.extend({ exercise: z.string() }),
    is_pr: z.boolean(),
    session_complete: z.boolean(),
  }),
  card: "workout",
} satisfies ToolContract;
