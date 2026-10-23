// Warm-up before a take (T-41 task 1): Aurora ACU check, seed reset, get_daily_summary,
// Sonic warm-up (stub until T-30), card preloads. Prints READY with timings, or NOT READY.
import { execFileSync } from "node:child_process";
import { ADMIN_TOKEN, ADMIN_URL, MCP_URL, admin } from "./env.ts";
import { mcpDriver } from "./drivers.ts";

type Step = { name: string; run: () => Promise<string> };
const SKIP = "SKIP";
const t0 = performance.now();
let failed = 0;

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
    name: "Reset to seed state + 10 s rest timers",
    run: async () => {
      if (!ADMIN_TOKEN) return `${SKIP} (no ADMIN_TOKEN; admin routes arrive with T-20 on ${ADMIN_URL})`;
      const r = await admin("/admin/reset");
      // Reset clears the rest-timer override (seen 2026-10-23), so set the demo's 10 s again.
      const t = await admin("/admin/timer-speed", "POST", { rest_seconds: 10 });
      return `clock ${r.clock}, ${r.ms} ms on the server; rest timers ${t.rest_seconds} s`;
    },
  },
  {
    name: "get_daily_summary + card preloads",
    run: async () => {
      const d = await mcpDriver();
      const [c] = await d.turn("", [{ tool: "get_daily_summary", args: {} }]);
      if (c.error || !c.result?.targets) throw new Error(c.error ?? "no targets in the result");
      // Read every card resource once so the first take pays no cold start.
      const cards = (await d.client.listResources()).resources.filter((r) => r.uri.startsWith("ui://"));
      for (const r of cards) await d.client.readResource({ uri: r.uri });
      await d.close();
      return `summary ${c.ms} ms; ${cards.length} cards read (${MCP_URL})`;
    },
  },
  {
    name: "Sonic warm-up turn",
    // TODO(T-30): open a Sonic session through the simulator backend and send one silent turn.
    run: async () => `${SKIP} (simulator backend arrives with T-30)`,
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
console.log(`\n${failed ? "NOT READY" : "READY"} in ${(Math.round(performance.now() - t0) / 1000).toFixed(1)} s`);
process.exit(failed ? 1 : 0);
