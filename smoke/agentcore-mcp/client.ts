// T-03 smoke client: npx tsx client.ts --target local|agentcore
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { SignatureV4 } from "@smithy/signature-v4";
import { HttpRequest } from "@smithy/protocol-http";
import { Sha256 } from "@aws-crypto/sha256-js";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";

const target = process.argv[process.argv.indexOf("--target") + 1] ?? "local";
const env: Record<string, string> = {};
try {
  for (const line of readFileSync(new URL("../../.env.local", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
} catch {}
const region = process.env.AWS_REGION ?? env.AWS_REGION ?? "us-east-1";

// SigV4 fetch wrapper, service bedrock-agentcore.
function sigv4Fetch(): typeof fetch {
  const signer = new SignatureV4({
    service: "bedrock-agentcore", region, sha256: Sha256,
    credentials: fromNodeProviderChain({ profile: process.env.AWS_PROFILE ?? env.AWS_PROFILE }),
  });
  return async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const headers: Record<string, string> = { host: url.host };
    new Headers(init.headers).forEach((v, k) => { headers[k] = v; });
    const query: Record<string, string> = {};
    url.searchParams.forEach((v, k) => { query[k] = v; });
    const signed = await signer.sign(new HttpRequest({
      method: init.method ?? "GET", protocol: url.protocol, hostname: url.hostname,
      path: url.pathname, query, headers, body: init.body as string | undefined,
    }));
    return fetch(url, { ...init, headers: signed.headers });
  };
}

let url: URL;
let fetchFn: typeof fetch | undefined;
if (target === "agentcore") {
  const arn = process.env.AGENT_RUNTIME_ARN ?? env.AGENTCORE_RUNTIME_ARN;
  if (!arn) { console.error("FAIL set AGENT_RUNTIME_ARN"); process.exit(1); }
  url = new URL(`https://bedrock-agentcore.${region}.amazonaws.com/runtimes/${encodeURIComponent(arn)}/invocations?qualifier=DEFAULT`);
  fetchFn = sigv4Fetch();
} else {
  url = new URL(process.env.MCP_URL_LOCAL ?? "http://localhost:8000/mcp");
}

const fail = (msg: string) => { console.log(`FAIL ${msg}`); process.exit(1); };
const ms = (t0: number) => Math.round(performance.now() - t0);

const client = new Client({ name: "t03-smoke-client", version: "0.0.1" }, { capabilities: { elicitation: { form: {} } } });
let elicited = "";
client.setRequestHandler(ElicitRequestSchema, async (req) => {
  elicited = req.params.message;
  return { action: "accept", content: { confirm: true } };
});
// DEBUG=1 traces each HTTP exchange; NO_GET=1 answers the standalone GET stream with 405 (simulates a proxy without it).
const baseFetch = fetchFn ?? fetch;
const traced: typeof fetch = async (input, init = {}) => {
  const method = init.method ?? "GET";
  if (process.env.NO_GET && method === "GET") return new Response(null, { status: 405 });
  const res = await baseFetch(input, init);
  if (process.env.DEBUG) {
    const h: string[] = [];
    res.headers.forEach((v, k) => { if (/session|content-type|amzn/i.test(k)) h.push(`${k}=${v}`); });
    console.log(`  [http] ${method} ${String(init.body ?? "").slice(0, 60)} -> ${res.status} ${h.join(" ")}`);
  }
  return res;
};
const transport = new StreamableHTTPClientTransport(url, { fetch: traced });

console.log(`target=${target} url=${url.href}`);
let t0 = performance.now();
await client.connect(transport);
const initMs = ms(t0);
const protocol = transport.protocolVersion;
console.log(`1 initialize ${initMs}ms protocol=${protocol} session=${transport.sessionId}`);
if (protocol !== "2025-11-25") fail(`protocol=${protocol}`);

const { tools } = await client.listTools();
console.log(`2 tools/list ${tools.map((t) => t.name).join(",")}`);
if (tools.length !== 2) fail(`tools=${tools.length}`);

const times: number[] = [];
for (let i = 0; i < 10; i++) {
  t0 = performance.now();
  const r = await client.callTool({ name: "ping", arguments: {} });
  times.push(ms(t0));
  if (!(r.structuredContent as any)?.server_time) fail("ping returned no server_time");
}
const warm = times.slice(1).sort((a, b) => a - b);
const p50 = warm[Math.floor(warm.length / 2)];
console.log(`3 ping ms=${times.join(",")} first=${times[0]} warm_p50=${p50}`);

t0 = performance.now();
const r = await client.callTool({ name: "confirm_demo", arguments: {} }, undefined, { timeout: Number(process.env.ELICIT_TIMEOUT_MS ?? 60000) });
const sc = r.structuredContent as { action?: string; confirmed?: boolean };
console.log(`4 confirm_demo ${ms(t0)}ms elicit_message="${elicited}" result=${JSON.stringify(sc)}`);
if (elicited !== "Proceed?" || sc?.action !== "accept" || sc.confirmed !== true) fail("elicitation round trip");

await transport.terminateSession().catch(() => {});
await client.close();
console.log(`PASS protocol=${protocol} tools=${tools.length} ping_p50=${p50}ms elicitation=${sc.action}ed init=${initMs}ms first_ping=${times[0]}ms`);
