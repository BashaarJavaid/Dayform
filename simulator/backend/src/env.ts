// Settings for the simulator backend. .env.local (repo root) never overrides the shell.
import { resolve } from "node:path";

try {
  process.loadEnvFile(resolve(import.meta.dirname, "../../../.env.local"));
} catch {}

const e = process.env;
export const PORT = Number(e.SIM_PORT ?? 8300);
export const REGION = e.AWS_REGION ?? "us-east-1";
export const VOICE_ENGINE = (e.VOICE_ENGINE ?? "sonic") as "sonic" | "pipeline" | "text";
export const MCP_URL = e.MCP_URL ?? "http://localhost:8100/mcp";
export const MCP_AUTH = (e.MCP_AUTH ?? "none") as "none" | "sigv4";
/** Admin routes live on the server's origin; AgentCore has none, so point ADMIN_URL at a server that does. */
export const ADMIN_URL = e.ADMIN_URL ?? new URL(MCP_URL).origin;
export const ADMIN_TOKEN = e.ADMIN_TOKEN;
export const VOICE_MODEL_ID = e.VOICE_MODEL_ID ?? "amazon.nova-2-5-sonic";
export const VOICE_MODEL_FALLBACK_ID = e.VOICE_MODEL_FALLBACK_ID ?? "amazon.nova-2-sonic-v1:0";
export const ALEXA_VOICE = e.ALEXA_VOICE ?? "tiffany";
export const REASONING_MODEL_ID = e.REASONING_MODEL_ID ?? "us.amazon.nova-2-lite-v1:0";
/** Sonic session renewal (must be under 8 min). Seconds; tests force it lower. */
export const RENEW_AFTER_S = Number(e.SONIC_RENEW_AFTER_S ?? 420);

/** Six ticket lines, plus the T-02 hearing fixes (program day names, "Dayform"). */
export const SYSTEM_PROMPT = [
  "You are Alexa, with the Dayform fitness add-on (Dayform is one word).",
  "Use tools for every fitness fact.",
  "Say only numbers that come from tool results.",
  "Keep replies to 1–2 sentences.",
  "Say the assumptions a tool returns.",
  "When a request needs several tools, call them in order without asking.",
  "List each food once with its quantity: \"two rotis\" is food roti, quantity 2.",
  "Meal prep with a cart runs four tools, one after another: 1) get_daily_summary to read today's targets, 2) plan_meal_prep, 3) add_to_cart with from_plan true, 4) checkout_cart, which asks the user to confirm and returns the Amazon link. Never skip step 1 or step 4. When checkout_cart returns status confirmed, the user has already said yes: say the total and that the Amazon link is on screen.",
  "Plain spoken words only, under 30 words: no markdown, emoji, links or item lists (the card on screen shows the details).",
  "The training program days are push, pull, legs and upper; \"start push day\" means start_workout with day push.",
].join("\n");
