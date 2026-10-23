export * from "./rings.ts";
export * from "./meal-logged.ts";
export * from "./workout.ts";
export * from "./pr.ts";
export * from "./progress.ts";
export * from "./meal-prep.ts";
export * from "./cart.ts";
export * from "./brief.ts";
import { RingsCard } from "./rings.ts";
import { MealLoggedCard } from "./meal-logged.ts";
import { WorkoutCard } from "./workout.ts";
import { PrCard } from "./pr.ts";
import { ProgressCard } from "./progress.ts";
import { MealPrepCard } from "./meal-prep.ts";
import { CartCard } from "./cart.ts";
import { BriefCard } from "./brief.ts";

/** The 8 cards (DESIGN §5), each 768×480. A tool's structuredContent always contains its card's fields. */
export const CARDS = {
  rings: RingsCard,
  "meal-logged": MealLoggedCard,
  workout: WorkoutCard,
  pr: PrCard,
  progress: ProgressCard,
  "meal-prep": MealPrepCard,
  cart: CartCard,
  brief: BriefCard,
} as const;
export type CardName = keyof typeof CARDS;
export const CARD_NAMES = Object.keys(CARDS) as CardName[];
export const cardUri = (name: CardName) => `ui://cards/${name}` as const;
/** Card name → resource URI. */
export const CARD_URIS = Object.fromEntries(CARD_NAMES.map((n) => [n, cardUri(n)])) as Record<CardName, string>;
/** MCP Apps resource MIME type (ext-apps RESOURCE_MIME_TYPE, T-06). */
export const CARD_MIME_TYPE = "text/html;profile=mcp-app";
