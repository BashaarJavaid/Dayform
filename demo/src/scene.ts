// Scene runner. Usage: npm run demo:scene -- S1 S3 | all [--driver mcp|simulator] [--mode text|voice]
// Asserts the tools called and key result fields per scene, prints per-turn latency,
// saves runs/last.json and flags scenes that passed last run but fail now.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { ADMIN_TOKEN, admin } from "./env.ts";
import { mcpDriver, simulatorDriver, type Driver } from "./drivers.ts";
import { SCENES, TOOL_CONFIRM, byTool, type Ctx, type Scene } from "./scenes.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { driver: { type: "string", default: "mcp" }, mode: { type: "string", default: "text" } },
});
if (values.mode !== "text") throw new Error("voice mode waits for T-30; run --mode text");
const wanted = !positionals.length || positionals.includes("all") ? SCENES.map((s) => s.id) : positionals.map((p) => p.toUpperCase());

type SceneResult = { id: string; pass: boolean; failures: string[]; turns: { line: string; ms: number; tools: string }[]; note?: string };

async function runScene(d: Driver, s: Scene, ctx: Ctx): Promise<SceneResult> {
  const r: SceneResult = { id: s.id, pass: true, failures: [], turns: [] };
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
    const calls = await d.turn(turn.line, turn.calls);
    const ms = Math.round(performance.now() - t0);
    r.turns.push({ line: (turn.offScript ? "[off-script] " : "") + turn.line, ms, tools: calls.map((c) => `${c.tool} ${c.ms}ms`).join(" → ") });
    const got = calls.map((c) => c.tool).join(",");
    const want = turn.calls.map((c) => c.tool).join(",");
    if (got !== want) r.failures.push(`tools ${got || "none"}, expected ${want}`);
    for (const c of calls) if (c.error) r.failures.push(`${c.tool}: ${c.error.slice(0, 200)}`);
    r.failures.push(...turn.check(byTool(calls), ctx));
  }
  if (s.id === "S4") {
    if (!TOOL_CONFIRM && !d.elicitations.length) r.failures.push("no checkout elicitation");
    r.note = `${TOOL_CONFIRM ? "confirm_checkout" : `elicitation: "${d.elicitations.at(-1)}"`}; cart ${ctx.cart?.items} items $${ctx.cart?.usd}`;
  }
  r.pass = !r.failures.length;
  return r;
}

const d = values.driver === "simulator" ? await simulatorDriver() : await mcpDriver();
console.log(`Dayform scene runner · ${new Date().toISOString()} · driver ${d.name} · mode ${values.mode}\n`);
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
  console.log(`${r.id} ${r.pass ? "PASS" : "FAIL"}${r.note ? `  (${r.note})` : ""}`);
  for (const t of r.turns) console.log(`   ${String(t.ms).padStart(5)} ms  "${t.line}"  ${t.tools}`);
  for (const f of r.failures) console.log(`   ✗ ${f}`);
}
await d.close();

const runsDir = resolve(import.meta.dirname, "../runs");
mkdirSync(runsDir, { recursive: true });
const lastPath = resolve(runsDir, "last.json");
let prev: SceneResult[] = [];
try {
  prev = JSON.parse(readFileSync(lastPath, "utf8")).results;
} catch {}
const regressions = results.filter((r) => !r.pass && prev.find((p) => p.id === r.id)?.pass);
writeFileSync(lastPath, JSON.stringify({ at: new Date().toISOString(), driver: d.name, results }, null, 2));

const slow = results.map((r) => `${r.id} ${Math.max(0, ...r.turns.map((t) => t.ms))}ms`).join(" | ");
console.log(`\n${results.map((r) => `${r.id} ${r.pass ? "PASS" : "FAIL"}`).join(" | ")}`);
console.log(`Slowest turn: ${slow}`);
console.log(`Regressions since last run: ${regressions.map((r) => r.id).join(", ") || "none"}`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
