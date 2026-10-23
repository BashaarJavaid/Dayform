import { z } from "zod";
import { BriefCard } from "../cards/brief.ts";
import type { ToolContract } from "./types.ts";

export const get_morning_brief = {
  name: "get_morning_brief",
  description:
    "Call when the user greets you in the morning ('good morning') or asks for their brief. Returns yesterday's intake and training, the weight trend against plan, one insight, today's workout and targets, and why targets changed if they did.",
  input: z.object({}),
  output: BriefCard,
  card: "brief",
} satisfies ToolContract;
