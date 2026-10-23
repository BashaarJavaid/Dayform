// UNDERSTANDING=server (D3, D10; T-28). Each tool takes `{text}` (contracts ServerModeInput); one forced-tool call
// to the reasoning model (Nova, D21) turns the text into the tool's alexa-mode input, with the demo date, the last
// meal entry and the open workout as context. The registry validates the result with the contract and calls the
// same handler alexa mode uses. This goes over the 500 ms budget by design (one model call, ~650 ms).
import { sql } from "drizzle-orm";
import type { ToolContract } from "@dayform/contracts";
import { clock } from "../core/clock.ts";
import { query } from "../core/db.ts";
import { structured } from "../core/llm.ts";
import type { ToolCtx } from "../core/registry.ts";
import { openSession } from "../domain/session/index.ts";

const TZ = () => process.env.DEMO_TZ ?? "Asia/Karachi";

/** Facts the model may need to fill the input: local time, the last meal entry, the open workout. */
export async function context(): Promise<string> {
  const now = await clock.now();
  const local = new Intl.DateTimeFormat("en-GB", { timeZone: TZ(), dateStyle: "full", timeStyle: "short" }).format(now);
  const [meal] = await query<{ id: number; date: string; meal_type: string; items: string | null }>(sql`
    SELECT e.id, e.date::text AS date, e.meal_type, string_agg(i.quantity || ' ' || i.unit || ' ' || i.name, ', ' ORDER BY i.id) AS items
    FROM meal_entries e LEFT JOIN meal_items i ON i.entry_id = e.id
    GROUP BY e.id ORDER BY e.eaten_at DESC, e.id DESC LIMIT 1`);
  const s = await openSession();
  const slot = s && !s.state.complete ? s.state.slots[s.state.current] : undefined;
  return [
    `Now: ${local} (${TZ()}).`,
    meal ? `Last logged meal: entry_id ${meal.id}, ${meal.meal_type} on ${meal.date}: ${meal.items ?? "no items"}.` : "No meal logged yet.",
    slot
      ? `Open workout: ${s!.state.day_name}, current exercise ${slot.name}, set ${s!.state.set_number} of ${slot.sets}, target ${slot.target.reps} reps at ${slot.target.weight_kg} kg.`
      : "No workout in progress.",
  ].join("\n");
}

export async function parseRequest(contract: ToolContract, text: string, _ctx?: ToolCtx, llm = structured): Promise<unknown> {
  const r = await llm({
    name: contract.name,
    description: contract.description,
    schema: contract.input,
    system:
      "You turn what a user said to a voice assistant into the input of one tool call. Use only what the user said and the context. " +
      "Leave optional fields out unless the user said them or the context settles them; never invent quantities. Never output null.",
    prompt: `Context:\n${await context()}\n\nThe user said: "${text}"\n\nCall ${contract.name}.`,
    maxTokens: 800,
    timeoutMs: 15_000,
  });
  return r.data;
}
