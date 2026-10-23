// T-06 smoke: minimal stateful MCP server (SDK v1) with one MCP Apps card.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";

const PORT = Number(process.env.PORT ?? 8106);
const CARD_URI = "ui://cards/rings";
const dist = new URL("./dist/", import.meta.url);

const macro = z.object({ eaten: z.number(), target: z.number() });
const rings = { calories: macro, protein: macro, carbs: macro, fat: macro };

function buildServer() {
  const server = new McpServer({ name: "dayform-smoke-apps", version: "0.0.1" });

  registerAppTool(server as any, "show_rings", {
    description: "Show today's calories, protein, carbs and fat against targets. Returns eaten and target for each.",
    inputSchema: {},
    outputSchema: rings,
    _meta: { ui: { resourceUri: CARD_URI } },
  }, async () => {
    // Fixed sample day for the smoke test (stands in for a DB read).
    const data = {
      calories: { eaten: 1420, target: 2300 },
      protein: { eaten: 96, target: 160 },
      carbs: { eaten: 150, target: 250 },
      fat: { eaten: 41, target: 70 },
    };
    return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
  });

  server.registerTool("log_water_stub", {
    description: "Log water in millilitres. Smoke-test stub: prints to the server log and returns the amount.",
    inputSchema: { ml: z.number().positive() },
    outputSchema: { logged_ml: z.number() },
  }, async ({ ml }) => {
    console.log(`[log_water_stub] called with ml=${ml}`);
    return { content: [{ type: "text", text: `logged ${ml} ml` }], structuredContent: { logged_ml: ml } };
  });

  registerAppResource(server as any, "rings card", CARD_URI, {}, async () => ({
    // Read on each request from the built single-file card.
    contents: [{ uri: CARD_URI, mimeType: RESOURCE_MIME_TYPE, text: readFileSync(new URL("rings.html", dist), "utf8") }],
  }));
  return server;
}

const transports = new Map<string, StreamableHTTPServerTransport>();
const app = express();
app.use(express.json());

app.post("/mcp", async (req, res) => {
  const sid = req.header("mcp-session-id");
  let transport = sid ? transports.get(sid) : undefined;
  if (!transport) {
    if (sid || !isInitializeRequest(req.body)) {
      res.status(400).json({ jsonrpc: "2.0", error: { code: -32000, message: "No valid session" }, id: null });
      return;
    }
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => { transports.set(id, transport!); },
    });
    transport.onclose = () => { if (transport!.sessionId) transports.delete(transport!.sessionId); };
    await buildServer().connect(transport);
  }
  await transport.handleRequest(req, res, req.body);
});
const bySession = async (req: express.Request, res: express.Response) => {
  const t = transports.get(req.header("mcp-session-id") ?? "");
  if (!t) { res.status(400).send("No valid session"); return; }
  await t.handleRequest(req, res);
};
app.get("/mcp", bySession);
app.delete("/mcp", bySession);

app.get("/", (_req, res) => res.sendFile(new URL("host.html", dist).pathname));
app.get("/host.js", (_req, res) => res.sendFile(new URL("host.js", dist).pathname));

app.listen(PORT, () => {
  console.log(`MCP server: http://localhost:${PORT}/mcp`);
  console.log(`Host page:  http://localhost:${PORT}/`);
  console.log(`Card MIME type: ${RESOURCE_MIME_TYPE}`);
});
