import { z } from "zod";
import { RingsCard } from "../cards/rings.ts";
import type { ToolContract } from "./types.ts";

export const log_water = {
  name: "log_water",
  description:
    "Call when the user says they drank water. Give ml or glasses (one glass is 250 ml). Returns the amount added and today's water and intake against targets.",
  input: z.object({
    ml: z.number().positive().optional(),
    glasses: z.number().positive().optional(),
  }),
  output: RingsCard.extend({
    added_ml: z.number(),
  }),
  card: "rings",
} satisfies ToolContract;
