// Warm-up before a take (T-41 task 1). Prints READY with timings, or NOT READY.
// Steps that could write state (the food-search log_meal, the voice turn) run before the reset,
// so the take still starts from the seed state. Open the simulator page first: the voice engine
// runs only while a client is connected, so the warm session stays open only if the page holds it.
import { execFileSync } from "node:child_process";
import { ADMIN_TOKEN, ADMIN_URL, MCP_URL, SIM_URL, admin } from "./env.ts";
import { mcpDriver, simulatorDriver } from "./drivers.ts";

type Step = { name: string; run: () => Promise<string> };
const SKIP = "SKIP";
const t0 = performance.now();
let failed = 0;
const mcp = await mcpDriver();

const steps: Step[] = [
  {
    name: "Aurora min capacity >= 0.5 ACU",
    run: async () => {
      const arn = process.env.AURORA_CLUSTER_ARN;
      if (process.env.DB_DRIVER !== "data-api" || !arn) return `${SKIP} (DB_DRIVER is not data-api)`;
      const out = execFileSync("aws", ["rds", "describe-db-clusters", "--db-cluster-identifier", arn.split(":").at(-1)!,
        "--query", "DBClusters[0].[Status,ServerlessV2ScalingConfiguration.MinCapacity]", "--output", "text"], { encoding: "utf8" });
      const [status, min] = out.trim().split(/\s+/);
      if (status !== "available" || !(Number(min) >= 0.5)) throw new Error(`status ${status}, min ${min} ACU`);
      return `${status}, min ${min} ACU`;
    },
  },
  {
    name: "Food search (S1-shaped log_meal; the reset below removes it)",
    run: async () => {
      const args = { meal: "lunch", items: [{ food: "roti", quantity: 2 }, { food: "chicken karahi" }, { food: "mango lassi", quantity: 1 }] };
      const ms: number[] = [];
      for (let i = 0; i < 2; i++) {
        const { calls: [c] } = await mcp.turn("", [{ tool: "log_meal", args }]);
        if (c.error || c.result?.entry?.items?.length !== 3) throw new Error(c.error ?? "log_meal did not match 3 items");
        ms.push(c.ms);
      }
      return `log_meal cold ${ms[0]} ms, warm ${ms[1]} ms`;
    },
  },
  {
    name: "Voice engine warm-up turn (simulator backend)",
    run: async () => {
      const health = await fetch(SIM_URL.replace(/^ws/, "http") + "/health").then((r) => r.json(), () => null);
      if (!health) return `${SKIP} (no simulator backend on ${SIM_URL})`;
      const sim = await simulatorDriver();
      const t = await sim.turn("Hello.", []);
      await sim.close();
      // The text engine sometimes answers "Hello" with get_morning_brief; read-only calls are fine before the reset.
      const writes = t.calls.filter((c) => !c.tool.startsWith("get_"));
      if (writes.length) throw new Error(`warm-up line called tools: ${writes.map((c) => c.tool).join(",")}`);
      if (t.firstAudioMs === undefined) throw new Error(`no audio; reply "${t.reply}"`);
      return `engine ${health.engine}, first audio ${t.firstAudioMs} ms, "${t.reply}"`;
    },
  },
  {
    name: "Reset to seed state + 10 s rest timers",
    run: async () => {
      if (!ADMIN_TOKEN) return `${SKIP} (no ADMIN_TOKEN; admin routes on ${ADMIN_URL})`;
      const r = await admin("/admin/reset");
      // Reset clears the rest-timer override (seen 2026-10-23), so set the demo's 10 s again.
      const t = await admin("/admin/timer-speed", "POST", { rest_seconds: 10 });
      return `clock ${r.clock}, ${r.ms} ms on the server; rest timers ${t.rest_seconds} s`;
    },
  },
  {
    name: "get_daily_summary + card preloads",
    run: async () => {
      const { calls: [c] } = await mcp.turn("", [{ tool: "get_daily_summary", args: {} }]);
      if (c.error || !c.result?.targets) throw new Error(c.error ?? "no targets in the result");
      // Read every card resource once so the first take pays no cold start.
      const cards = (await mcp.client.listResources()).resources.filter((r) => r.uri.startsWith("ui://"));
      for (const r of cards) await mcp.client.readResource({ uri: r.uri });
      return `summary ${c.ms} ms, eaten ${c.result.eaten.kcal} kcal; ${cards.length} cards read (${MCP_URL})`;
    },
  },
];

for (const s of steps) {
  const t = performance.now();
  try {
    const msg = await s.run();
    console.log(`${msg.startsWith(SKIP) ? "skip" : "ok  "}  ${String(Math.round(performance.now() - t)).padStart(5)} ms  ${s.name}: ${msg}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${String(Math.round(performance.now() - t)).padStart(5)} ms  ${s.name}: ${(e as Error).message}`);
  }
}
await mcp.close();
console.log(`\n${failed ? "NOT READY" : "READY"} in ${(Math.round(performance.now() - t0) / 1000).toFixed(1)} s`);
process.exit(failed ? 1 : 0);
