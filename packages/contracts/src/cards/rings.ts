import { z } from "zod";
import { DateStr, DayNumbers } from "../common.ts";

/** rings: calories, protein, carbs and fat against targets, plus water. */
export const RingsCard = z.object({
  date: DateStr,
  eaten: DayNumbers,
  targets: DayNumbers,
});
export type RingsCard = z.infer<typeof RingsCard>;
