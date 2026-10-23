// Shared settings for the demo scripts. .env.local (repo root) never overrides the shell.
import { resolve } from "node:path";

try {
  process.loadEnvFile(resolve(import.meta.dirname, "../../.env.local"));
} catch {}

export const MCP_URL = process.env.MCP_URL ?? "http://localhost:8100/mcp";
// MCP_AUTH=sigv4 (AgentCore target): the infra signer patches global fetch for the AgentCore host.
if (process.env.MCP_AUTH === "sigv4") await import("../../infra/src/sigv4-fetch.ts");
export const ADMIN_URL = process.env.ADMIN_URL ?? "http://localhost:8001";
export const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
export const SIM_URL = process.env.SIM_URL ?? `ws://localhost:${process.env.SIM_PORT ?? 8300}`;

/** POST/GET an admin route (DESIGN §8). Throws on a non-2xx answer. */
export async function admin(path: string, method = "POST", body?: unknown) {
  const res = await fetch(ADMIN_URL + path, {
    method,
    headers: { authorization: `Bearer ${ADMIN_TOKEN}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}
