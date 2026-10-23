// MCP server app: stateful Streamable HTTP on POST /mcp (T-03 pattern), /health, admin routes in DEMO_MODE.
import { randomUUID } from "node:crypto";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { registerTools, type ToolDef } from "./core/registry.ts";
import { registerCards } from "./core/cards.ts";
import { adminRouter } from "./core/admin.ts";
import { env } from "./core/env.ts";

function buildServer(tools: ToolDef[]) {
  const server = new McpServer({ name: "dayform", version: "0.1.0" }, { capabilities: { logging: {} } });
  registerTools(server, tools);
  registerCards(server);
  return server;
}

export function createApp(tools: ToolDef[]) {
  const transports = new Map<string, StreamableHTTPServerTransport>();
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  // CORS for browser-based MCP hosts (MCP Inspector v2, the T-06 host page). Alexa+ calls server-to-server and ignores it.
  app.use("/mcp", (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type, mcp-session-id, mcp-protocol-version, authorization, last-event-id, accept");
    res.setHeader("Access-Control-Expose-Headers", "mcp-session-id, mcp-protocol-version");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  app.post("/mcp", async (req, res) => {
    const sid = req.header("mcp-session-id");
    let transport = sid ? transports.get(sid) : undefined;
    if (!transport) {
      if (!isInitializeRequest(req.body)) {
        // Unknown or expired session: 404 tells the client to re-initialize (MCP spec).
        res.status(sid ? 404 : 400).json({ jsonrpc: "2.0", error: { code: -32000, message: "No valid session" }, id: null });
        return;
      }
      // AgentCore may supply the session ID on initialize; adopt it, else mint one.
      const t = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => sid ?? randomUUID(),
        onsessioninitialized: (id) => void transports.set(id, t),
      });
      t.onclose = () => void (t.sessionId && transports.delete(t.sessionId));
      await buildServer(tools).connect(t);
      transport = t;
    }
    await transport.handleRequest(req, res, req.body);
  });
  const bySession = async (req: express.Request, res: express.Response) => {
    const t = transports.get(req.header("mcp-session-id") ?? "");
    if (!t) return void res.status(404).send("No valid session");
    await t.handleRequest(req, res);
  };
  app.get("/mcp", bySession);
  app.delete("/mcp", bySession);

  app.get("/health", (_req, res) => void res.json({ ok: true, sessions: transports.size, tools: tools.length }));
  if (env.demoMode()) app.use(adminRouter());
  return app;
}
