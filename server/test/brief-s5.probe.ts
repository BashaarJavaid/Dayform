// T-27 manual check: S5 through a real MCP client against a running dev server (DEMO_MODE=true).
// Usage: npx tsx server/test/brief-s5.probe.ts http://localhost:8013   (run npm run db:reset first)
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const base = process.argv[2] ?? "http://localhost:8001";
try { process.loadEnvFile(new URL("../../.env.local", import.meta.url).pathname); } catch {}
const t0 = performance.now();
const adv = await fetch(`${base}/admin/advance-day`, { method: "POST", headers: { authorization: `Bearer ${process.env.ADMIN_TOKEN}` } });
console.log(`POST /admin/advance-day ${adv.status} ${Math.round(performance.now() - t0)} ms`, await adv.text());

const client = new Client({ name: "s5-probe", version: "0" });
await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
for (let i = 0; i < 2; i++) {
  const t1 = performance.now();
  const r: any = await client.callTool({ name: "get_morning_brief", arguments: {} });
  console.log(`\n== get_morning_brief ${Math.round(performance.now() - t1)} ms isError=${!!r.isError} card=${r._meta?.ui?.resourceUri ?? "-"}`);
  if (i === 0) console.log("text:", r.content[0].text, "\nstructured:", JSON.stringify(r.structuredContent, null, 1));
}
// Acceptance: plan_meal_prep after advance-day returns the overnight plan instantly.
const t2 = performance.now();
const mp: any = await client.callTool({ name: "plan_meal_prep", arguments: {} });
console.log(`\n== plan_meal_prep ${Math.round(performance.now() - t2)} ms status=${mp.structuredContent?.status}`, mp.content[0].text);
await client.close();
