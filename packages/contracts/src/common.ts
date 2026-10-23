import { z } from "zod";

/** YYYY-MM-DD, in the demo clock's day. */
export const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** ISO 8601 date-time from clock.now(). */
export const DateTimeStr = z.string().datetime({ offset: true });

export const Macros = z.object({
  kcal: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
});
export type Macros = z.infer<typeof Macros>;

/** The numbers tracked per day against targets (D4, D8; the targets table). */
export const DayNumbers = Macros.extend({
  fiber_g: z.number(),
  sodium_mg: z.number(),
  water_ml: z.number(),
});
export type DayNumbers = z.infer<typeof DayNumbers>;

export const MealType = z.enum(["breakfast", "lunch", "dinner", "snack"]);
export const Goal = z.enum(["lose", "maintain", "gain"]);
export const Activity = z.enum(["sedentary", "light", "moderate", "active", "very_active"]);

/** One set as logged. */
export const SetRow = z.object({
  set: z.number().int().positive(),
  weight_kg: z.number().nonnegative(),
  reps: z.number().int().positive(),
  rpe: z.number().min(1).max(10).nullable(),
});
export type SetRow = z.infer<typeof SetRow>;

/** A personal record (D6): new best estimated 1RM, or best weight for a rep count. */
export const Pr = z.object({
  exercise: z.string(),
  kind: z.enum(["e1rm", "rep_best"]),
  weight_kg: z.number(),
  reps: z.number().int().positive(),
  e1rm_kg: z.number(),
  previous_e1rm_kg: z.number().nullable(),
  change_kg: z.number().nullable(),
});
export type Pr = z.infer<typeof Pr>;

/** UNDERSTANDING=server (D3): every tool takes one plain-text input instead of its alexa-mode input. */
export const ServerModeInput = z.object({
  text: z.string().min(1).describe("What the user said, word for word."),
});
