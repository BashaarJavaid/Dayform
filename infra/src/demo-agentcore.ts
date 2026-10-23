// Runs the Demo Monitor's scene runner (demo/src/scene.ts) against the deployed AgentCore runtime.
// Tools go to MCP_URL from .env.aws (SigV4); admin routes (advance-day) are not reachable through AgentCore, so they
// go to ADMIN_URL: a local server on the same Aurora (DB_DRIVER=data-api), which shares the demo clock table.
//   npm run demo:agentcore -w @dayform/infra -- all      (scenes)
//   npm run demo:agentcore -w @dayform/infra -- warm     (demo/src/warm.ts: reset, 10 s timers, warm-up)
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envAws = resolve(import.meta.dirname, "../../.env.aws");
for (const line of readFileSync(envAws, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}
process.env.AWS_PROFILE ??= "hirz-login";
await import("./sigv4-fetch.ts");
await import(process.argv[2] === "warm" ? "../../demo/src/warm.ts" : "../../demo/src/scene.ts");
