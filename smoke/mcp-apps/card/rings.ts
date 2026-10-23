// The rings card (View side), built with the ext-apps App API.
import { App } from "@modelcontextprotocol/ext-apps";

type Macro = { eaten: number; target: number };
const KEYS = ["calories", "protein", "carbs", "fat"] as const;
const COLORS = { calories: "#f97316", protein: "#22c55e", carbs: "#3b82f6", fat: "#eab308" };
const UNITS = { calories: "kcal", protein: "g", carbs: "g", fat: "g" };

function ring(key: (typeof KEYS)[number], m: Macro) {
  const r = 62, c = 2 * Math.PI * r, p = Math.min(m.eaten / m.target, 1);
  return `<div class="ring" data-key="${key}">
    <svg width="150" height="150" viewBox="0 0 150 150">
      <circle cx="75" cy="75" r="${r}" stroke="#2a2f3a" stroke-width="14" fill="none"/>
      <circle cx="75" cy="75" r="${r}" stroke="${COLORS[key]}" stroke-width="14" fill="none" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}" transform="rotate(-90 75 75)"/>
      <text x="75" y="72" text-anchor="middle" class="num">${m.eaten}</text>
      <text x="75" y="96" text-anchor="middle" class="sub">of ${m.target} ${UNITS[key]}</text>
    </svg><div class="label">${key}</div></div>`;
}

const app = new App({ name: "dayform-rings", version: "0.0.1" }, {});
app.ontoolresult = (params) => {
  const d = params.structuredContent as Record<string, Macro> | undefined;
  if (!d) return;
  document.getElementById("rings")!.innerHTML = KEYS.map((k) => ring(k, d[k])).join("");
};
document.getElementById("water")!.addEventListener("click", async () => {
  const status = document.getElementById("status")!;
  try {
    const r = await app.callServerTool({ name: "log_water_stub", arguments: { ml: 250 } });
    status.textContent = r.isError ? "error" : `Logged ${(r.structuredContent as any)?.logged_ml} ml`;
  } catch (e) {
    status.textContent = `callServerTool failed: ${e}`;
  }
});
await app.connect();
