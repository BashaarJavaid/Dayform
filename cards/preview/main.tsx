import { createRoot } from "react-dom/client";
import { CARD_COMPONENTS } from "../src/index.ts";
import type { CardName } from "@dayform/contracts";
import { mountCardFrame, type HostToolResult } from "../host/index.ts";

const html = import.meta.glob("../dist/*.html", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const fixtures = import.meta.glob("../../mock/fixtures/*.json", { import: "default", eager: true }) as Record<string, Record<string, unknown>>;
const fixture = (tool: string) => fixtures[`../../mock/fixtures/${tool}.json`];

/** One preview entry per card state worth seeing: card name + the tool whose fixture feeds it. */
const bench = (fixture("finish_workout").prs as Record<string, unknown>[])[0];
const ENTRIES: { id: string; card: CardName; tool: string; data?: Record<string, unknown> }[] = [
  { id: "rings", card: "rings", tool: "get_daily_summary" },
  { id: "meal-logged", card: "meal-logged", tool: "log_meal" },
  { id: "workout", card: "workout", tool: "start_workout" },
  { id: "workout-pr", card: "workout", tool: "log_set" },
  { id: "pr", card: "pr", tool: "finish_workout" },
  // One set that earns both PR kinds (T-23): one celebration, rep-best as a secondary line.
  { id: "pr-both-kinds", card: "pr", tool: "log_workout", data: { prs: [bench, { ...bench, kind: "rep_best" }] } },
  { id: "pr-none", card: "pr", tool: "log_workout", data: { prs: [] } },
  { id: "progress", card: "progress", tool: "get_progress" },
  { id: "meal-prep", card: "meal-prep", tool: "plan_meal_prep" },
  { id: "meal-prep-preparing", card: "meal-prep", tool: "plan_meal_prep", data: { status: "preparing", message: "Building a 4-day plan against your new targets.", plan: null } },
  { id: "cart", card: "cart", tool: "view_cart" },
  { id: "cart-checkout", card: "cart", tool: "checkout_cart" },
  { id: "brief", card: "brief", tool: "get_morning_brief" },
  // Shapes seen from the real server (T-31): "<X> day" names, rest-day yesterday, UTC timestamps.
  { id: "brief-server", card: "brief", tool: "get_morning_brief", data: { ...fixture("get_morning_brief"),
    yesterday: { ...(fixture("get_morning_brief").yesterday as object), workout: null },
    today: { ...(fixture("get_morning_brief").today as Record<string, unknown>), workout: { day_name: "Legs day", lead: { exercise: "back squat", weight_kg: 102.5, reps: 5 } } } } },
  { id: "workout-server", card: "workout", tool: "start_workout", data: { ...fixture("start_workout"), day_name: "Push day" } },
  { id: "meal-logged-utc", card: "meal-logged", tool: "log_meal", data: { ...fixture("log_meal"),
    entry: { ...(fixture("log_meal").entry as object), logged_at: "2026-10-23T08:02:00.000Z" } } },
];

const params = new URLSearchParams(location.search);
const scale = Number(params.get("scale") ?? 1);
const only = params.get("only");
const logEl = document.getElementById("log")!;
const log = (s: string) => { logEl.textContent += s + "\n"; console.log(s); };

// Card buttons in the preview answer with the matching mock fixture.
const callTool = async (name: string, args: Record<string, unknown>): Promise<HostToolResult> => {
  log(`card -> tools/call ${name} ${JSON.stringify(args)}`);
  await new Promise((r) => setTimeout(r, 300));
  const data = fixture(name);
  return data ? { structuredContent: data, content: [{ type: "text", text: JSON.stringify(data) }] } : { isError: true, content: [] };
};
const openLink = (url: string) => log(`card -> open link ${url.slice(0, 80)}…`);

const root = document.getElementById("entries")!;
for (const e of ENTRIES.filter((x) => !only || x.id === only)) {
  const data = e.data ?? fixture(e.tool);
  const section = document.createElement("section");
  section.className = "entry";
  section.innerHTML = `<h2>${e.id} <code>ui://cards/${e.card}</code> ← <code>${e.tool}</code></h2>
    <div class="pair"><div class="slot"><span>MCP Apps</span><div class="frame" data-mode="mcp" data-entry="${e.id}"></div></div>
    <div class="slot"><span>Native</span><div class="frame" data-mode="native" data-entry="${e.id}"></div></div></div>`;
  root.appendChild(section);

  const [mcpEl, nativeEl] = section.querySelectorAll<HTMLElement>(".frame");
  mountCardFrame({
    container: mcpEl, html: html[`../dist/${e.card}.html`], scale,
    toolResult: { structuredContent: data, content: [{ type: "text", text: JSON.stringify(data) }] },
    onCallTool: callTool, onOpenLink: openLink,
  });

  const Card = CARD_COMPONENTS[e.card];
  const wrap = document.createElement("div");
  wrap.style.zoom = String(scale);
  nativeEl.appendChild(wrap);
  createRoot(wrap).render(<Card data={data} callTool={callTool} openLink={openLink} />);
}
