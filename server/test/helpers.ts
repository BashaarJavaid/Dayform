import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { Express } from "express";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ElicitRequestSchema, LoggingMessageNotificationSchema, type ElicitResult } from "@modelcontextprotocol/sdk/types.js";

export async function listen(app: Express): Promise<{ base: string; url: string; server: Server }> {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve({ base, url: `${base}/mcp`, server });
    });
  });
}

/** SDK client. noGet answers the standalone GET stream with 405, like AgentCore (T-03 client NO_GET=1). */
export async function connect(url: string, opts: { noGet?: boolean; answer?: ElicitResult } = {}) {
  const client = new Client({ name: "test", version: "0.0.0" }, { capabilities: { elicitation: { form: {} } } });
  const elicitations: unknown[] = [];
  const logs: unknown[] = [];
  const gets: number[] = [];
  client.setRequestHandler(ElicitRequestSchema, async (req) => {
    elicitations.push(req.params);
    return opts.answer ?? { action: "accept", content: { confirm: true } };
  });
  client.setNotificationHandler(LoggingMessageNotificationSchema, (n) => void logs.push(n.params.data));
  const f: typeof fetch = async (input, init = {}) => {
    if ((init.method ?? "GET") === "GET") {
      gets.push(1);
      if (opts.noGet) return new Response(null, { status: 405 });
    }
    return fetch(input, init);
  };
  const transport = new StreamableHTTPClientTransport(new URL(url), { fetch: f });
  await client.connect(transport);
  return { client, transport, elicitations, logs, gets };
}
