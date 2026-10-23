import { z } from "zod";
import { WorkoutCard } from "../cards/workout.ts";
import type { ToolContract } from "./types.ts";

export const start_workout = {
  name: "start_workout",
  description:
    "Call when the user wants to start a live gym session now, e.g. 'start push day'. Starts today's session from their program. Returns the session plan and the first set's target weight and reps.",
  input: z.object({
    day: z.string().optional().describe("Program day, e.g. 'push' or 'legs'. Default: the next day in the program."),
  }),
  output: WorkoutCard.extend({
    plan: z.array(
      z.object({
        exercise: z.string(),
        sets: z.number().int().positive(),
        target_weight_kg: z.number().nonnegative(),
        target_reps: z.number().int().positive(),
      }),
    ),
  }),
  card: "workout",
} satisfies ToolContract;
