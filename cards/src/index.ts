// Native export (T-31, CARDS_MODE=native): the same 8 components the MCP Apps builds render.
import type { ComponentType } from "react";
import { CARD_URIS, type CardName } from "@dayform/contracts";
import type { CardProps } from "./ui.tsx";
import { Rings } from "./cards/Rings.tsx";
import { MealLogged } from "./cards/MealLogged.tsx";
import { Workout } from "./cards/Workout.tsx";
import { Pr } from "./cards/Pr.tsx";
import { Progress } from "./cards/Progress.tsx";
import { MealPrep } from "./cards/MealPrep.tsx";
import { Cart } from "./cards/Cart.tsx";
import { Brief } from "./cards/Brief.tsx";

export { Rings, MealLogged, Workout, Pr, Progress, MealPrep, Cart, Brief };
export type { CallTool, CardProps, ToolResult } from "./ui.tsx";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCard = ComponentType<CardProps<any>>;

/** Card name -> component. */
export const CARD_COMPONENTS: Record<CardName, AnyCard> = {
  rings: Rings,
  "meal-logged": MealLogged,
  workout: Workout,
  pr: Pr,
  progress: Progress,
  "meal-prep": MealPrep,
  cart: Cart,
  brief: Brief,
};

/** `ui://cards/<name>` (a tool's `_meta.ui.resourceUri`) -> component. Render with `data = structuredContent`. */
export const CardByUri: Record<string, AnyCard> = Object.fromEntries(
  (Object.keys(CARD_COMPONENTS) as CardName[]).map((n) => [CARD_URIS[n], CARD_COMPONENTS[n]]),
);
