// T-24 manual check: the S3 sequence through a real MCP client against a running dev server.
// Usage: npx tsx server/test/live-workout-s3.probe.ts http://localhost:8011
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const base = process.argv[2] ?? "http://localhost:8001";
try { process.loadEnvFile(new URL("../../.env.local", import.meta.url).pathname); } catch {}
const admin = await fetch(`${base}/admin/timer-speed`, {
  method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${process.env.ADMIN_TOKEN}` },
  body: JSON.stringify({ rest_seconds: 10 }),
});
console.log("POST /admin/timer-speed", admin.status, await admin.text());

const open = async () => {
  const client = new Client({ name: "s3-probe", version: "0" });
  const t = new StreamableHTTPClientTransport(new URL(`${base}/mcp`));
  await client.connect(t);
  console.log("MCP session", t.sessionId);
  return client;
};
const call = async (c: Client, name: string, args: Record<string, unknown> = {}) => {
  const t0 = performance.now();
  const r: any = await c.callTool({ name, arguments: args });
  console.log(`\n== ${name} ${JSON.stringify(args)}  ${Math.round(performance.now() - t0)} ms  isError=${!!r.isError}  card=${r._meta?.ui?.resourceUri ?? "-"}`);
  console.log("text:", r.content[0].text);
  const s = r.structuredContent ?? {};
  const { plan, done_sets, exercises, ...rest } = s;
  console.log("structured:", JSON.stringify(rest));
  if (plan) console.log("plan:", plan.map((p: any) => `${p.exercise} ${p.target_weight_kg}x${p.target_reps}`).join(" | "));
  if (exercises) console.log("exercises:", JSON.stringify(exercises));
};
const a = await open();
await call(a, "start_workout");
await call(a, "log_set", { reps: 8 });
await call(a, "swap_exercise", { exercise: "overhead press", reason: "shoulder feels off" });
await a.close();
const b = await open();
await call(b, "log_set", { reps: 10 });
await call(b, "finish_workout");
await b.close();
