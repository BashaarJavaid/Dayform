// Scene runner. Usage: npm run demo:scene -- S1 S3 | all [--driver mcp|simulator] [--runs N]
// Asserts the tools called (in order) and key result fields per scene, prints per-turn latency,
// estimates each scene's on-air time against its budget (simulator driver),
// saves runs/last.json and flags scenes that passed last run but fail now.
// Voice mode is the user's live take: read the lines from DEMO-SCRIPT.md.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { ADMIN_TOKEN, admin } from "./env.ts";
import { mcpDriver, simulatorDriver, type Driver } from "./drivers.ts";
import { SCENES, TOOL_CONFIRM, byTool, type Ctx, type Scene } from "./scenes.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    driver: { type: "string", default: "mcp" },
    mode: { type: "string", default: "text" },
    runs: { type: "string", default: "1" },
  },
});
if (values.mode !== "text") throw new Error("voice mode is a live take by the user; the runner covers --mode text");
const wanted = !positionals.length || positionals.includes("all") ? SCENES.map((s) => s.id) : positionals.map((p) => p.toUpperCase());

type TurnLog = { line: string; ms: number; tools: string; reply?: string; firstAudioMs?: number; audioS?: number };
type SceneResult = { id: string; pass: boolean; failures: string[]; turns: TurnLog[]; note?: string; onAirS?: number; budgetS: number };

/** Expected tools must appear in this order (optional ones may be missing); extra calls are only noted. */
function orderProblems(got: string[], want: { tool: string; optional?: boolean }[]) {
  let i = 0;
  for (const w of want) {
    const j = got.indexOf(w.tool, i);
    if (j >= 0) i = j + 1;
    else if (!w.optional) return [`tools ${got.join(",") || "none"}, expected ${want.map((x) => x.tool).join(",")}`];
  }
  return [];
}

/** On-air estimate: the user's line at 2.5 words/s, then Alexa's first audio and the audio itself. */
const speakS = (line: string) => line.split(/\s+/).length / 2.5;

async function runScene(d: Driver, s: Scene, ctx: Ctx): Promise<SceneResult> {
  const r: SceneResult = { id: s.id, pass: true, failures: [], turns: [], budgetS: s.budgetSec };
  if (s.before === "advance-day") {
    if (ADMIN_TOKEN) await admin("/admin/advance-day").catch((e) => r.failures.push(`advance-day: ${e.message}`));
    else r.note = "advance-day skipped (no ADMIN_TOKEN; mock has fixed morning data)";
  }
  if (s.toolsList) {
    const t0 = performance.now();
    const { tools, protocol } = await d.listTools();
    r.turns.push({ line: "(tools/list)", ms: Math.round(performance.now() - t0), tools: `${tools.length} tools` });
    const n = TOOL_CONFIRM ? 19 : 18; // confirm_checkout exists only in CHECKOUT_CONFIRM=tool
    if (tools.length !== n) r.failures.push(`${n} tools, got ${tools.length}`);
    if (protocol !== "2025-11-25") r.failures.push(`protocol 2025-11-25, got ${protocol}`);
  }
  for (const turn of s.turns ?? []) {
    const t0 = performance.now();
    let t;
    try {
      t = await d.turn(turn.line, turn.calls);
    } catch (e) {
      r.failures.push(String(e));
      break;
    }
    const { calls } = t;
    const ms = Math.round(performance.now() - t0);
    r.turns.push({
      line: (turn.offScript ? "[off-script] " : "") + turn.line,
      ms,
      tools: calls.map((c) => `${c.tool} ${c.ms}ms`).join(" → "),
      reply: t.reply,
      firstAudioMs: t.firstAudioMs,
      audioS: t.audioS,
    });
    if (t.audioS !== undefined && !turn.offScript)
      r.onAirS = (r.onAirS ?? 0) + speakS(turn.line) + (t.firstAudioMs ?? 0) / 1000 + t.audioS;
    r.failures.push(...orderProblems(calls.map((c) => c.tool), turn.calls));
    for (const c of calls) if (c.error) r.failures.push(`${c.tool}: ${c.error.slice(0, 200)}`);
    r.failures.push(...turn.check(byTool(calls), ctx));
  }
  if (s.id === "S4") {
    if (!TOOL_CONFIRM && !d.elicitations.length) r.failures.push("no checkout elicitation");
    r.note = `${TOOL_CONFIRM ? "confirm_checkout" : `elicitation: "${d.elicitations.at(-1)}"`}; cart ${ctx.cart?.items} items $${ctx.cart?.usd}`;
  }
  if (r.onAirS !== undefined) r.onAirS = Math.round(r.onAirS);
  r.pass = !r.failures.length;
  return r;
}

const d = values.driver === "simulator" ? await simulatorDriver() : await mcpDriver();
const runs = Number(values.runs);
console.log(`Dayform scene runner · ${new Date().toISOString()} · driver ${d.name} · mode ${values.mode} · runs ${runs}`);
const all: SceneResult[][] = [];
for (let run = 1; run <= runs; run++) {
  if (runs > 1) {
    // Every take starts from the seed state with 10 s rest timers (same as demo:warm).
    await admin("/admin/reset");
    await admin("/admin/timer-speed", "POST", { rest_seconds: 10 });
  }
  console.log(`\n── run ${run}/${runs}`);
  const ctx: Ctx = {};
  const results: SceneResult[] = [];
  const done = new Set<string>();
  for (const id of wanted) {
    const s = SCENES.find((x) => x.id === id);
    if (!s) throw new Error(`unknown scene ${id}`);
    if (s.needs && !done.has(s.needs)) {
      const pre = await runScene(d, SCENES.find((x) => x.id === s.needs)!, ctx);
      console.log(`(setup ${s.needs}: ${pre.pass ? "ok" : "FAILED"})`);
    }
    const r = await runScene(d, s, ctx);
    done.add(id);
    results.push(r);
    const air = r.onAirS === undefined ? "" : `  on-air ~${r.onAirS}s / budget ${r.budgetS}s${r.onAirS > r.budgetS ? " OVER" : ""}`;
    console.log(`${r.id} ${r.pass ? "PASS" : "FAIL"}${air}${r.note ? `  (${r.note})` : ""}`);
    for (const t of r.turns) {
      const audio = t.audioS === undefined ? "" : `  [first audio ${t.firstAudioMs ?? "-"} ms, ${t.audioS}s audio]`;
      console.log(`   ${String(t.ms).padStart(5)} ms  "${t.line}"  ${t.tools}${audio}`);
      if (t.reply) console.log(`            Alexa: "${t.reply}"`);
    }
    for (const f of r.failures) console.log(`   ✗ ${f}`);
  }
  all.push(results);
  console.log(`run ${run}: ${results.map((r) => `${r.id} ${r.pass ? "PASS" : "FAIL"}`).join(" | ")}`);
  console.log(`Slowest turn: ${results.map((r) => `${r.id} ${Math.max(0, ...r.turns.map((t) => t.ms))}ms`).join(" | ")}`);
  const air = results.filter((r) => r.onAirS !== undefined);
  if (air.length) console.log(`On-air total ~${air.reduce((a, r) => a + r.onAirS!, 0)}s (S7 not included; script max 179s)`);
}
await d.close();

const runsDir = resolve(import.meta.dirname, "../runs");
mkdirSync(runsDir, { recursive: true });
const lastPath = resolve(runsDir, "last.json");
let prev: SceneResult[] = [];
try {
  prev = JSON.parse(readFileSync(lastPath, "utf8")).results;
} catch {}
const results = all.at(-1)!;
const regressions = results.filter((r) => !r.pass && prev.find((p) => p.id === r.id)?.pass);
writeFileSync(lastPath, JSON.stringify({ at: new Date().toISOString(), driver: d.name, results, runs: all }, null, 2));
const clean = all.filter((rs) => rs.every((r) => r.pass)).length;
console.log(`\nClean runs: ${clean}/${runs}`);
console.log(`Regressions since last run: ${regressions.map((r) => r.id).join(", ") || "none"}`);
process.exit(clean === runs ? 0 : 1);
