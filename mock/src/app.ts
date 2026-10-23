import { readFile } from "node:fs/promises";
// Mock MCP server: the 18 Dayform tools from fixtures, stateful Streamable HTTP, protocol 2025-11-25.
// Hybrid mode forwards REAL_TOOLS to a real server (one upstream session per mock session),
// relaying elicitation and progress.
import { randomUUID } from "node:crypto";
import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  ElicitRequestSchema,
  isInitializeRequest,
  type CallToolResult,
  type ServerNotification,
  type ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { CARD_MIME_TYPE, CARD_NAMES, CARD_URIS, TOOLS, confirm_checkout, type ToolContract } from "@dayform/contracts";

type Extra = RequestHandlerExtra<ServerRequest, ServerNotification>;
type Cart = { item_count: number; estimated_total_usd: number; add_to_cart_url: string | null };

export interface MockOptions {
  fixtures: Record<string, unknown>;
  checkoutConfirm?: "elicitation" | "tool";
  passthroughUrl?: string;
  realTools?: string[];
}

const result = (data: unknown): CallToolResult => ({
  content: [{ type: "text", text: JSON.stringify(data) }],
  structuredContent: data as Record<string, unknown>,
});

const uiMeta = (t: ToolContract) =>
  t.card ? { ui: { resourceUri: CARD_URIS[t.card] }, "ui/resourceUri": CARD_URIS[t.card] } : undefined;

// Placeholder card until T-32: does the MCP Apps handshake and prints the tool result it receives.
const placeholderCard = (name: string) => `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;width:768px;height:480px;overflow:auto;font:13px/1.4 system-ui;background:#111;color:#eee}
h1{font-size:16px;margin:12px}pre{margin:12px;white-space:pre-wrap}</style></head>
<body><h1>${name} (placeholder card)</h1><pre id="d">waiting for data…</pre><script>
const send=(m)=>parent.postMessage(Object.assign({jsonrpc:"2.0"},m),"*");
addEventListener("message",(e)=>{const m=e.data||{};
 if(m.id===1&&m.result)send({method:"ui/notifications/initialized",params:{}});
 if(m.method==="ui/notifications/tool-result")document.getElementById("d").textContent=JSON.stringify(m.params.structuredContent??m.params,null,2);});
send({id:1,method:"ui/initialize",params:{appInfo:{name:"${name}-placeholder",version:"0.0.0"},appCapabilities:{},protocolVersion:"2026-01-26"}});
</script></body></html>`;

function buildSession(opts: MockOptions) {
  const server = new McpServer({ name: "dayform-mock", version: "0.1.0" });
  const real = new Set(opts.realTools ?? []);
  const tools: ToolContract[] = [...TOOLS, ...(opts.checkoutConfirm === "tool" ? [confirm_checkout] : [])];

  // Hybrid: one upstream session per mock session, opened on the first forwarded call.
  let upstream: Promise<{ client: Client; extra?: Extra }> | undefined;
  const connectUpstream = async () => {
    const client = new Client(
      { name: "dayform-mock-hybrid", version: "0.1.0" },
      { capabilities: { elicitation: { form: {} } } },
    );
    const up: { client: Client; extra?: Extra } = { client };
    client.setRequestHandler(ElicitRequestSchema, async (req) => {
      if (!up.extra) throw new Error("Elicitation arrived outside a forwarded tool call");
      // relatedRequestId: ride the caller's POST stream (DESIGN §3, F-009).
      return server.server.elicitInput(req.params, { relatedRequestId: up.extra.requestId });
    });
    await client.connect(new StreamableHTTPClientTransport(new URL(opts.passthroughUrl!)));
    return up;
  };
  const forward = (name: string) => async (args: Record<string, unknown>, extra: Extra) => {
    const up = await (upstream ??= connectUpstream());
    up.extra = extra;
    const token = extra._meta?.progressToken;
    try {
      return (await up.client.callTool({ name, arguments: args }, undefined, {
        resetTimeoutOnProgress: true,
        onprogress: (p) => {
          if (token !== undefined)
            void extra.sendNotification({ method: "notifications/progress", params: { ...p, progressToken: token } });
        },
      })) as CallToolResult;
    } finally {
      up.extra = undefined;
    }
  };

  const cart = () => opts.fixtures.checkout_cart as Cart;
  const checkout = (status: string) =>
    result({
      ...cart(),
      add_to_cart_url: status === "confirmed" ? cart().add_to_cart_url : null,
      checkout: { status },
    });

  const handlers: Record<string, (args: any, extra: Extra) => Promise<CallToolResult>> = {
    checkout_cart: async (_args, extra) => {
      if (opts.checkoutConfirm === "tool") return checkout("awaiting_confirmation");
      const { item_count, estimated_total_usd } = cart();
      const r = await server.server.elicitInput(
        {
          mode: "form",
          message: `Add ${item_count} items, about $${Math.round(estimated_total_usd)}, to your Amazon cart?`,
          requestedSchema: {
            type: "object",
            properties: { confirm: { type: "boolean", title: "Add to Amazon cart" } },
            required: ["confirm"],
          },
        },
        { relatedRequestId: extra.requestId },
      );
      const ok = r.action === "accept" && r.content?.confirm !== false;
      return checkout(ok ? "confirmed" : r.action === "cancel" ? "cancelled" : "declined");
    },
    confirm_checkout: async ({ confirm }) => checkout(confirm ? "confirmed" : "declined"),
  };

  for (const t of tools) {
    const fixture = async () => result(opts.fixtures[t.name]);
    server.registerTool(
      t.name,
      { description: t.description, inputSchema: t.input, outputSchema: t.output, _meta: uiMeta(t) },
      (real.has(t.name) ? forward(t.name) : (handlers[t.name] ?? fixture)) as any,
    );
  }
  // REAL_TOOLS outside the contracts (e.g. a stub's ping) are forwarded with a loose schema.
  for (const name of real) {
    if (tools.some((t) => t.name === name)) continue;
    server.registerTool(
      name,
      { description: `Forwarded to ${opts.passthroughUrl}.`, inputSchema: z.looseObject({}) },
      forward(name) as any,
    );
  }

  for (const name of CARD_NAMES) {
    server.registerResource(
      `${name} card`,
      CARD_URIS[name],
      { mimeType: CARD_MIME_TYPE, description: `The ${name} card (768×480).` },
      // Serve the real T-32 build when it exists, else the placeholder (orchestrator, 2026-10-22).
      async (uri) => {
        const text = await readFile(new URL(`../../cards/dist/${name}.html`, import.meta.url), "utf8").catch(() => placeholderCard(name));
        return { contents: [{ uri: uri.href, mimeType: CARD_MIME_TYPE, text }] };
      },
    );
  }

  return { server, close: async () => (upstream ? (await upstream).client.close() : undefined) };
}

export function createMockApp(opts: MockOptions) {
  if (opts.realTools?.length && !opts.passthroughUrl) throw new Error("REAL_TOOLS needs MOCK_PASSTHROUGH_URL");
  const transports = new Map<string, StreamableHTTPServerTransport>();
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.post("/mcp", async (req, res) => {
    const sid = req.header("mcp-session-id");
    let transport = sid ? transports.get(sid) : undefined;
    if (!transport) {
      if (!isInitializeRequest(req.body)) {
        res
          .status(sid ? 404 : 400)
          .json({ jsonrpc: "2.0", error: { code: -32000, message: "No valid session" }, id: null });
        return;
      }
      const session = buildSession(opts);
      const t = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => void transports.set(id, t),
      });
      t.onclose = () => {
        if (t.sessionId) transports.delete(t.sessionId);
        void session.close();
      };
      await session.server.connect(t);
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
  app.get("/health", (_req, res) => void res.json({ ok: true, sessions: transports.size }));
  return app;
}
