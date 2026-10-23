import { set_goals } from "./set_goals.ts";
import { log_bodyweight } from "./log_bodyweight.ts";
import { log_meal } from "./log_meal.ts";
import { correct_meal } from "./correct_meal.ts";
import { log_water } from "./log_water.ts";
import { get_daily_summary } from "./get_daily_summary.ts";
import { log_workout } from "./log_workout.ts";
import { get_progress } from "./get_progress.ts";
import { start_workout } from "./start_workout.ts";
import { log_set } from "./log_set.ts";
import { swap_exercise } from "./swap_exercise.ts";
import { finish_workout } from "./finish_workout.ts";
import { plan_meal_prep } from "./plan_meal_prep.ts";
import { add_to_cart } from "./add_to_cart.ts";
import { remove_from_cart } from "./remove_from_cart.ts";
import { view_cart } from "./view_cart.ts";
import { checkout_cart } from "./checkout_cart.ts";
import { get_morning_brief } from "./get_morning_brief.ts";
export { confirm_checkout } from "./confirm_checkout.ts";
export { CheckoutResult } from "./checkout_cart.ts";
export type { ToolContract } from "./types.ts";
export {
  set_goals,
  log_bodyweight,
  log_meal,
  correct_meal,
  log_water,
  get_daily_summary,
  log_workout,
  get_progress,
  start_workout,
  log_set,
  swap_exercise,
  finish_workout,
  plan_meal_prep,
  add_to_cart,
  remove_from_cart,
  view_cart,
  checkout_cart,
  get_morning_brief,
};

/** The 18 tools, in DESIGN §4 order. CHECKOUT_CONFIRM=tool adds confirm_checkout. */
export const TOOLS = [
  set_goals,
  log_bodyweight,
  log_meal,
  correct_meal,
  log_water,
  get_daily_summary,
  log_workout,
  get_progress,
  start_workout,
  log_set,
  swap_exercise,
  finish_workout,
  plan_meal_prep,
  add_to_cart,
  remove_from_cart,
  view_cart,
  checkout_cart,
  get_morning_brief,
] as const;
export type ToolName = (typeof TOOLS)[number]["name"] | "confirm_checkout";
