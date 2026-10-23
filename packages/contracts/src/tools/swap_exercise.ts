import { z } from "zod";
import { WorkoutCard } from "../cards/workout.ts";
import type { ToolContract } from "./types.ts";

export const swap_exercise = {
  name: "swap_exercise",
  description:
    "Call during a live session when the user wants to replace an exercise, e.g. 'my shoulder feels off, swap the overhead press'. Picks an alternative for the same muscle with the equipment available. Returns the replaced exercise, the new exercise and its target.",
  input: z.object({
    exercise: z.string().optional().describe("Exercise to replace. Default: the current one."),
    reason: z.string().optional(),
  }),
  output: WorkoutCard.extend({
    replaced: z.string(),
    reason: z.string().nullable(),
  }),
  card: "workout",
} satisfies ToolContract;
