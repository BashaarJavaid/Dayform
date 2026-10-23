// Dayform schema (DESIGN §6). One user. Nutrient columns use the contract names (packages/contracts/src/common.ts).
import { sql } from "drizzle-orm";
import {
  boolean, date, index, integer, jsonb, pgTable, primaryKey, real, text, timestamp,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });
const day = (name: string) => date(name, { mode: "string" });
const id = () => integer("id").primaryKey().generatedByDefaultAsIdentity();

/** The 11 tracked nutrients (D4). Per item for meal_items; foods keep them per 100 g in `nutrients` jsonb with the same keys. */
const nutrientColumns = () => ({
  kcal: real("kcal").notNull(),
  protein_g: real("protein_g").notNull(),
  carbs_g: real("carbs_g").notNull(),
  fat_g: real("fat_g").notNull(),
  fiber_g: real("fiber_g").notNull().default(0),
  sugar_g: real("sugar_g").notNull().default(0),
  sodium_mg: real("sodium_mg").notNull().default(0),
  iron_mg: real("iron_mg").notNull().default(0),
  calcium_mg: real("calcium_mg").notNull().default(0),
  potassium_mg: real("potassium_mg").notNull().default(0),
  vitamin_d_mcg: real("vitamin_d_mcg").notNull().default(0),
});

export const profile = pgTable("profile", {
  id: integer("id").primaryKey().default(1),
  name: text("name").notNull(),
  sex: text("sex").notNull(), // "male" | "female"
  birth_year: integer("birth_year").notNull(),
  height_cm: real("height_cm").notNull(),
  start_weight_kg: real("start_weight_kg").notNull(),
  activity: text("activity").notNull(), // contracts Activity
  goal: text("goal").notNull(), // contracts Goal: lose | maintain | gain
  rate_kg_per_week: real("rate_kg_per_week").notNull(),
  protein_per_kg: real("protein_per_kg").notNull(),
  /** { cuisines, dislikes, allergies, equipment, max_prep_minutes, high_protein } */
  preferences: jsonb("preferences").notNull(),
  checkin_weekday: integer("checkin_weekday").notNull(), // 0 = Sunday ... 6 = Saturday
  timezone: text("timezone").notNull(),
});

export const targets = pgTable("targets", {
  id: id(),
  effective_date: day("effective_date").notNull(),
  kcal: real("kcal").notNull(),
  protein_g: real("protein_g").notNull(),
  carbs_g: real("carbs_g").notNull(),
  fat_g: real("fat_g").notNull(),
  fiber_g: real("fiber_g").notNull(),
  sodium_mg: real("sodium_mg").notNull(),
  water_ml: real("water_ml").notNull(),
  reason_codes: text("reason_codes").array().notNull().default(sql`'{}'`),
  reason: text("reason").notNull(),
  source: text("source").notNull(), // initial | weekly | manual
  created_at: ts("created_at").notNull(),
}, (t) => [index("targets_effective_date").on(t.effective_date)]);

/** Loaded by T-12 (`npm run data:load-foods`); not a user table, reset leaves it alone. */
export const foods = pgTable("foods", {
  id: text("id").primaryKey(), // slug (DESIGN §6)
  name: text("name").notNull(),
  aliases: text("aliases").array().notNull().default(sql`'{}'`),
  /** Per 100 g, keys as in nutrientColumns (kcal, protein_g, ... vitamin_d_mcg). */
  nutrients: jsonb("nutrients").notNull(),
  /** portion name -> grams */
  portions: jsonb("portions").notNull(),
  default_portion: text("default_portion").notNull(),
  source: text("source").notNull(),
  priority: integer("priority").notNull().default(0),
}, (t) => [
  index("foods_name_trgm").using("gin", sql`${t.name} gin_trgm_ops`),
  index("foods_aliases_trgm").using("gin", sql`dayform_aliases_text(${t.aliases}) gin_trgm_ops`),
]);

export const meal_entries = pgTable("meal_entries", {
  id: id(),
  eaten_at: ts("eaten_at").notNull(),
  date: day("date").notNull(), // local day (Asia/Karachi)
  meal_type: text("meal_type").notNull(), // contracts MealType
  said: text("said"), // the user's words
}, (t) => [index("meal_entries_date").on(t.date)]);

export const meal_items = pgTable("meal_items", {
  id: id(),
  entry_id: integer("entry_id").notNull().references(() => meal_entries.id, { onDelete: "cascade" }),
  food_id: text("food_id"), // foods.id slug; null for an estimated food with no table row
  name: text("name").notNull(),
  said: text("said"),
  quantity: real("quantity").notNull(),
  unit: text("unit").notNull(),
  grams: real("grams").notNull(),
  ...nutrientColumns(),
  estimated: boolean("estimated").notNull().default(false),
  assumptions: text("assumptions").array().notNull().default(sql`'{}'`),
}, (t) => [index("meal_items_entry").on(t.entry_id)]);

export const water_logs = pgTable("water_logs", {
  id: id(),
  logged_at: ts("logged_at").notNull(),
  date: day("date").notNull(),
  ml: real("ml").notNull(),
}, (t) => [index("water_logs_date").on(t.date)]);

export const bodyweight_logs = pgTable("bodyweight_logs", {
  id: id(),
  logged_at: ts("logged_at").notNull(),
  date: day("date").notNull(),
  weight_kg: real("weight_kg").notNull(),
}, (t) => [index("bodyweight_logs_date").on(t.date)]);

export const exercises = pgTable("exercises", {
  id: text("id").primaryKey(), // slug, data/exercises/exercises.json
  name: text("name").notNull(),
  aliases: text("aliases").array().notNull().default(sql`'{}'`),
  type: text("type").notNull(), // strength | cardio
  muscle: text("muscle").notNull(),
  equipment: text("equipment").notNull(),
  alternatives: text("alternatives").array().notNull().default(sql`'{}'`), // ordered exercise ids
});

export const program_days = pgTable("program_days", {
  id: text("id").primaryKey(), // push | pull | legs | upper
  name: text("name").notNull(),
  position: integer("position").notNull(),
  weekday: integer("weekday").notNull(),
});

export const program_exercises = pgTable("program_exercises", {
  day_id: text("day_id").notNull().references(() => program_days.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  exercise_id: text("exercise_id").notNull().references(() => exercises.id),
  sets: integer("sets").notNull(),
  reps_min: integer("reps_min").notNull(),
  reps_max: integer("reps_max").notNull(),
  rest_seconds: integer("rest_seconds").notNull(),
  increment_kg: real("increment_kg").notNull(),
}, (t) => [primaryKey({ columns: [t.day_id, t.position] })]);

export const workout_sessions = pgTable("workout_sessions", {
  id: text("id").primaryKey(), // contracts session_id
  day_id: text("day_id"), // program day, null for an ad-hoc session
  date: day("date").notNull(),
  started_at: ts("started_at").notNull(),
  ended_at: ts("ended_at"),
  status: text("status").notNull(), // active | done | abandoned
  mcp_session_id: text("mcp_session_id"),
  /** Live state: current exercise/set, swaps. Shape owned by T-24. */
  state: jsonb("state"),
}, (t) => [index("workout_sessions_date").on(t.date)]);

export const sets = pgTable("sets", {
  id: id(),
  session_id: text("session_id").notNull().references(() => workout_sessions.id, { onDelete: "cascade" }),
  exercise_id: text("exercise_id").notNull(),
  set_number: integer("set_number").notNull(),
  weight_kg: real("weight_kg").notNull(),
  reps: integer("reps").notNull(),
  rpe: real("rpe"),
  e1rm_kg: real("e1rm_kg").notNull(), // Epley: weight * (1 + reps / 30)
  pr_e1rm: boolean("pr_e1rm").notNull().default(false),
  pr_rep_best: boolean("pr_rep_best").notNull().default(false),
  logged_at: ts("logged_at").notNull(),
}, (t) => [index("sets_exercise").on(t.exercise_id), index("sets_session").on(t.session_id)]);

export const cardio_logs = pgTable("cardio_logs", {
  id: id(),
  session_id: text("session_id").references(() => workout_sessions.id, { onDelete: "cascade" }),
  exercise_id: text("exercise_id").notNull(),
  date: day("date").notNull(),
  logged_at: ts("logged_at").notNull(),
  duration_min: real("duration_min").notNull(),
  distance_km: real("distance_km"),
});

export const next_targets = pgTable("next_targets", {
  id: id(),
  for_date: day("for_date").notNull(),
  exercise_id: text("exercise_id").notNull(),
  weight_kg: real("weight_kg").notNull(),
  reps: integer("reps").notNull(),
  reason: text("reason").notNull(),
}, (t) => [index("next_targets_for_date").on(t.for_date)]);

export const meal_plans = pgTable("meal_plans", {
  id: id(),
  status: text("status").notNull(), // ready | preparing | failed
  start_date: day("start_date").notNull(),
  end_date: day("end_date").notNull(),
  plan: jsonb("plan"),
  totals: jsonb("totals"),
  within_tolerance: boolean("within_tolerance"),
  created_at: ts("created_at").notNull(),
});

/** Grocery catalog (T-13, contracts CatalogItem). Reset reloads it from data/catalog/catalog.json. */
export const catalog_items = pgTable("catalog_items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category"),
  asin: text("asin"), // null: no verified ASIN, the cart falls back to a search link
  pack_size: text("pack_size").notNull(), // CatalogItem.pack_label, shown as CartItem.pack_size
  pack_unit: text("pack_unit"), // g | ml | count
  grams_per_pack: real("grams_per_pack"),
  price_usd: real("price_usd").notNull(),
  price_date: day("price_date").notNull(),
  food_id: text("food_id"),
  url: text("url").notNull(),
  verified_at: ts("verified_at"),
});

export const cart_items = pgTable("cart_items", {
  id: id(),
  catalog_item_id: text("catalog_item_id").notNull(),
  quantity: integer("quantity").notNull(),
  meal_plan_id: integer("meal_plan_id"),
  added_at: ts("added_at").notNull(),
});

export const cart_checkouts = pgTable("cart_checkouts", {
  id: id(),
  created_at: ts("created_at").notNull(),
  status: text("status").notNull(), // confirmed | declined
  items: jsonb("items").notNull(),
  total_usd: real("total_usd").notNull(),
  link: text("link"),
});

export const briefs = pgTable("briefs", {
  for_date: day("for_date").primaryKey(),
  brief: jsonb("brief").notNull(), // contracts BriefCard
  created_at: ts("created_at").notNull(),
});

/** One row (id 1). clock.now() = demo_now + (real now - set_at). */
export const demo_clock = pgTable("demo_clock", {
  id: integer("id").primaryKey().default(1),
  demo_now: ts("demo_now").notNull(),
  set_at: ts("set_at").notNull(),
  rest_seconds: integer("rest_seconds"), // null: program rest times
});

/** Tables reset truncates and the seed fills. foods is loaded by T-12 and left alone. */
export const USER_TABLES = [
  "profile", "targets", "meal_entries", "meal_items", "water_logs", "bodyweight_logs",
  "workout_sessions", "sets", "cardio_logs", "next_targets", "meal_plans",
  "cart_items", "cart_checkouts", "briefs", "demo_clock",
] as const;
/** Reloaded by reset from data/exercises, data/program and data/catalog. */
export const PROGRAM_TABLES = ["exercises", "program_days", "program_exercises", "catalog_items"] as const;
