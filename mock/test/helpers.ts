import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { Express } from "express";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ElicitRequestSchema, type ElicitResult } from "@modelcontextprotocol/sdk/types.js";

export async function listen(app: Express): Promise<{ url: string; server: Server }> {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () =>
      resolve({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`, server }),
    );
  });
}

/** An SDK client that answers elicitation with `answer` and records the requests. */
export async function connect(url: string, answer: ElicitResult = { action: "accept", content: { confirm: true } }) {
  const client = new Client({ name: "test", version: "0.0.0" }, { capabilities: { elicitation: { form: {} } } });
  const elicitations: unknown[] = [];
  client.setRequestHandler(ElicitRequestSchema, async (req) => {
    elicitations.push(req.params);
    return answer;
  });
  const transport = new StreamableHTTPClientTransport(new URL(url));
  await client.connect(transport);
  return { client, transport, elicitations };
}
