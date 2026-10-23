import { z } from "zod";
import { SetRow } from "../common.ts";
import { PrCard } from "../cards/pr.ts";
import type { ToolContract } from "./types.ts";

export const finish_workout = {
  name: "finish_workout",
  description:
    "Call when the user ends the live session, e.g. 'I'm done' or 'finish workout'. Closes the session. Returns the summary: duration, exercises with their sets, total volume and the PRs set.",
  input: z.object({}),
  output: PrCard.extend({
    session_id: z.string(),
    day_name: z.string(),
    duration_min: z.number(),
    exercises: z.array(z.object({ exercise: z.string(), sets: z.array(SetRow) })),
    total_volume_kg: z.number(),
  }),
  card: "pr",
} satisfies ToolContract;
