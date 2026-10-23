import type { z } from "zod";
import type { CardName } from "../cards/index.ts";

export interface ToolContract {
  name: string;
  /** When to call it, why, and what it returns (Alexa+ guidance). The server uses it as is. */
  description: string;
  /** Alexa-mode input. Declare only parameters the tool honors. */
  input: z.ZodObject;
  /** structuredContent. Contains the card's fields when `card` is set. */
  output: z.ZodObject;
  card?: CardName;
}
