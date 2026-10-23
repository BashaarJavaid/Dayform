// MCP client for the simulated device: Streamable HTTP to MCP_URL (SigV4 for AgentCore), elicitation,
// progress/log notifications → progress events, tool trace, cards read once per URI.
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  ElicitRequestSchema,
  LoggingMessageNotificationSchema,
  type ElicitRequest,
  type ElicitResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { SignatureV4 } from "@smithy/signature-v4";
import { HttpRequest } from "@smithy/protocol-http";
import { Sha256 } from "@aws-crypto/sha256-js";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { MCP_AUTH, MCP_URL, REGION } from "./env.ts";
import type { Ctx } from "./hub.ts";

/** SigV4 fetch wrapper for AgentCore (service bedrock-agentcore), from T-03. */
function sigv4Fetch(): typeof fetch {
  const signer = new SignatureV4({ service: "bedrock-agentcore", region: REGION, sha256: Sha256, credentials: defaultProvider() });
  return async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const headers: Record<string, string> = { host: url.host };
    new Headers(init.headers).forEach((v, k) => (headers[k] = v));
    const query: Record<string, string> = {};
    url.searchParams.forEach((v, k) => (query[k] = v));
    const signed = await signer.sign(
      new HttpRequest({ method: init.method ?? "GET", protocol: url.protocol, hostname: url.hostname, path: url.pathname, query, headers, body: init.body as string | undefined }),
    );
    return fetch(url, { ...init, headers: signed.headers });
  };
}

/** Tool input JSON Schema as Bedrock (Converse and Sonic) accepts it. */
export const toolSchema = (t: Tool) => {
  const { $schema: _drop, ...json } = t.inputSchema as Record<string, unknown>;
  return json;
};

const MAX_RESULT_CHARS = 4000;

/** One-line result summary for the "under the hood" trace: the top-level scalar fields. */
function summarize(sc: unknown, text: string): string {
  if (sc && typeof sc === "object") {
    const parts = Object.entries(sc as Record<string, unknown>)
      .filter(([, v]) => v === null || ["string", "number", "boolean"].includes(typeof v))
      .map(([k, v]) => `${k}=${typeof v === "string" && v.length > 40 ? v.slice(0, 40) + "…" : v}`);
    if (parts.length) return parts.slice(0, 5).join(", ");
    return Object.keys(sc).slice(0, 6).join(", ");
  }
  return text.slice(0, 120);
}

export class McpLink {
  client!: Client;
  tools: Tool[] = [];
  private cards = new Map<string, string>();
  private callId: string | null = null;

  constructor(
    private ctx: Ctx,
    private onElicit: (p: ElicitRequest["params"]) => Promise<ElicitResult>,
  ) {}

  async connect() {
    const client = new Client({ name: "dayform-simulator", version: "0.1.0" }, { capabilities: { elicitation: { form: {} } } });
    client.setRequestHandler(ElicitRequestSchema, (req) => this.onElicit(req.params));
    client.setNotificationHandler(LoggingMessageNotificationSchema, (n) => {
      const d = n.params.data;
      this.ctx.emit({ type: "progress", call_id: this.callId, text: typeof d === "string" ? d : JSON.stringify(d) });
    });
    const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), MCP_AUTH === "sigv4" ? { fetch: sigv4Fetch() } : {});
    await client.connect(transport);
    this.client = client;
    this.tools = (await client.listTools()).tools;
    this.cards.clear();
    console.log(`[mcp] ${MCP_URL} protocol=${transport.protocolVersion} tools=${this.tools.length}`);
  }

  private async reconnect() {
    await this.client?.close().catch(() => {});
    await this.connect();
  }

  /** Call a tool, emitting the trace and the card. Returns the text the voice model sees and the structuredContent. */
  async call(name: string, args: Record<string, unknown>): Promise<{ ok: boolean; text: string; data: unknown }> {
    const call_id = randomUUID().slice(0, 8);
    this.callId = call_id;
    this.ctx.emit({ type: "tool_call_started", call_id, name, args });
    const t0 = performance.now();
    const run = () =>
      this.client.callTool({ name, arguments: args }, undefined, {
        timeout: 120_000,
        resetTimeoutOnProgress: true,
        onprogress: (p) => this.ctx.emit({ type: "progress", call_id, text: p.message ?? `${p.progress}${p.total ? "/" + p.total : ""}` }),
      });
    let res: Awaited<ReturnType<typeof run>> | undefined;
    let err: string | undefined;
    try {
      try {
        res = await run();
      } catch (e) {
        // Session gone (server restart, AgentCore recycle): reconnect, re-read tools/list, retry once.
        if (!/session|404|ECONNREFUSED|fetch failed|not connected/i.test(String(e))) throw e;
        console.log(`[mcp] ${name} failed (${String(e).slice(0, 80)}); reconnecting`);
        await this.reconnect();
        res = await run();
      }
    } catch (e) {
      err = String((e as Error)?.message ?? e);
    }
    const latency_ms = Math.round(performance.now() - t0);
    this.ctx.turn.tool(latency_ms);
    this.callId = null;
    const text = (res?.content as { type: string; text?: string }[] | undefined)?.map((c) => c.text ?? "").join("\n") ?? "";
    const sc = res?.structuredContent;
    const ok = !err && !res?.isError;
    this.ctx.emit({
      type: "tool_call_finished", call_id, name, args, latency_ms,
      status: ok ? "ok" : "error",
      summary: ok ? summarize(sc, text) : (err ?? text).slice(0, 160),
    });
    if (ok) await this.card(call_id, name, res!, sc);
    if (!ok) return { ok, text: `Error: ${(err ?? text).slice(0, 500)}`, data: undefined };
    const scJson = sc ? JSON.stringify(sc) : "";
    const forModel = text === scJson || !scJson ? text : `${text}\n${scJson}`;
    return { ok, text: forModel.slice(0, MAX_RESULT_CHARS), data: sc };
  }

  private async card(call_id: string, name: string, res: { _meta?: any }, data: unknown) {
    const meta = res._meta ?? this.tools.find((t) => t.name === name)?._meta;
    const uri: string | undefined = meta?.ui?.resourceUri ?? meta?.["ui/resourceUri"];
    if (!uri) return;
    try {
      let html = this.cards.get(uri);
      if (html === undefined) {
        const r = await this.client.readResource({ uri });
        html = (r.contents[0] as { text?: string })?.text ?? "";
        this.cards.set(uri, html);
      }
      this.ctx.emit({ type: "card", call_id, resource_uri: uri, html, data });
    } catch (e) {
      this.ctx.emit({ type: "error", message: `card ${uri}: ${String(e).slice(0, 200)}`, code: "card" });
    }
  }
}
