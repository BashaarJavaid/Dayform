// T-03 smoke: stateful MCP server (SDK 1.32.1) for AgentCore Runtime.
// Container contract: 0.0.0.0:8000, POST /mcp, ARM64 (runtime-mcp-protocol-contract.html).
import { randomUUID } from "node:crypto";
import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

function buildServer() {
  const server = new McpServer({ name: "dayform-smoke-agentcore", version: "0.0.1" });

  server.registerTool("ping", {
    description: "Return the server time in ISO 8601.",
    inputSchema: {},
    outputSchema: { server_time: z.string() },
  }, async () => {
    const data = { server_time: new Date().toISOString() };
    return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
  });

  server.registerTool("confirm_demo", {
    description: "Ask the user to confirm (elicitation) and return their answer.",
    inputSchema: {},
    outputSchema: { action: z.enum(["accept", "decline", "cancel"]), confirmed: z.boolean() },
  }, async (_args, extra) => {
    // relatedRequestId puts the elicitation on this POST's SSE response stream.
    // Without it the SDK uses the standalone GET stream, which AgentCore answers with 405.
    const r = await server.server.elicitInput({
      mode: "form",
      message: "Proceed?",
      requestedSchema: { type: "object", properties: { confirm: { type: "boolean", title: "Confirm" } }, required: ["confirm"] },
    }, { relatedRequestId: extra.requestId });
    const data = { action: r.action, confirmed: r.action === "accept" && r.content?.confirm === true };
    return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
  });
  return server;
}

const transports = new Map<string, StreamableHTTPServerTransport>();
const app = express();
app.use(express.json());

app.post("/mcp", async (req, res) => {
  const sid = req.header("mcp-session-id");
  let transport = sid ? transports.get(sid) : undefined;
  if (!transport) {
    if (!isInitializeRequest(req.body)) {
      // Unknown or expired session: 404 tells the client to re-initialize (MCP spec).
      res.status(sid ? 404 : 400).json({ jsonrpc: "2.0", error: { code: -32000, message: "No valid session" }, id: null });
      return;
    }
    // If the platform supplies a session ID on initialize, adopt it; else mint one.
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => sid ?? randomUUID(),
      onsessioninitialized: (id) => { transports.set(id, transport!); },
    });
    transport.onclose = () => { if (transport!.sessionId) transports.delete(transport!.sessionId); };
    await buildServer().connect(transport);
  }
  await transport.handleRequest(req, res, req.body);
});
const bySession = async (req: express.Request, res: express.Response) => {
  const t = transports.get(req.header("mcp-session-id") ?? "");
  if (!t) { res.status(404).send("No valid session"); return; }
  await t.handleRequest(req, res);
};
app.get("/mcp", bySession);
app.delete("/mcp", bySession);

app.listen(8000, "0.0.0.0", () => console.log("MCP server: http://0.0.0.0:8000/mcp"));
