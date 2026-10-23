// Simulator backend (T-30): one simulated Echo Show. WebSocket on SIM_PORT (8300) for the frontend and sim:probe,
// events per packages/contracts/src/events.ts; HTTP admin proxy at /admin/* (DEMO_MODE routes, ADMIN_TOKEN added here).
// Every connected client sees every event; the engine starts with the first client and stops with the last.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { ADMIN_ROUTES, ClientEvent, type ServerEvent } from "@dayform/contracts";
import type { ElicitRequest, ElicitResult } from "@modelcontextprotocol/sdk/types.js";
import { ADMIN_TOKEN, ADMIN_URL, MCP_URL, PORT, VOICE_ENGINE } from "./env.ts";
import { McpLink } from "./mcp.ts";
import { TurnClock, spokenAnswer, type Ctx, type Engine } from "./hub.ts";
import { ConverseEngine } from "./engines/converse.ts";
import { SonicEngine } from "./engines/sonic.ts";

const clients = new Set<WebSocket>();
const emit = (ev: ServerEvent) => {
  if (ev.type !== "audio_out") {
    const { type, ...rest } = ev as any;
    if (type === "card") rest.html = `${rest.html.length} chars`;
    console.log(`→ ${type} ${JSON.stringify(rest).slice(0, 200)}`);
  }
  const msg = JSON.stringify(ev);
  for (const c of clients) if (c.readyState === WebSocket.OPEN) c.send(msg);
};

// Elicitation (task 2): emit the request, ask aloud, resolve on a click or a spoken/typed yes or no.
let pending: { id: string; schema: Record<string, any>; resolve: (r: ElicitResult) => void } | null = null;
const onElicit = (p: ElicitRequest["params"]) =>
  new Promise<ElicitResult>((resolve) => {
    const id = randomUUID().slice(0, 8);
    const schema = ((p as any).requestedSchema ?? {}) as Record<string, any>;
    pending = { id, schema, resolve };
    emit({ type: "elicitation_request", id, message: p.message, requested_schema: schema });
    void engine.say(p.message);
  });
const settle = (r: ElicitResult) => {
  const p = pending!;
  pending = null;
  console.log(`[elicitation] ${p.id} → ${JSON.stringify(r)}`);
  emit({ type: "state", state: "thinking" });
  p.resolve(r);
};

const ctx: Ctx = {
  emit,
  turn: new TurnClock(emit),
  mcp: undefined as unknown as McpLink,
  transcript: [],
  get awaitingAnswer() {
    return pending !== null;
  },
  answerElicitation(text) {
    if (!pending) return false;
    const a = spokenAnswer(text, pending.schema);
    if (!a) return false;
    settle(a as ElicitResult);
    return true;
  },
};
ctx.mcp = new McpLink(ctx, onElicit);
const engine: Engine = VOICE_ENGINE === "sonic" ? new SonicEngine(ctx) : new ConverseEngine(ctx, VOICE_ENGINE === "pipeline");
let running = false;

// Admin proxy (task 6): /admin/reset, /admin/advance-day, /admin/timer-speed, /admin/status.
const adminPaths = new Set<string>(Object.values(ADMIN_ROUTES).map((r) => r.path));
const http = createServer(async (req, res) => {
  const path = (req.url ?? "/").split("?")[0];
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type");
  if (req.method === "OPTIONS") return void res.writeHead(204).end();
  if (path === "/health") return void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, engine: VOICE_ENGINE, mcp: MCP_URL }));
  if (!adminPaths.has(path)) return void res.writeHead(404).end();
  const body = req.method === "POST" ? await new Promise<string>((r) => { let b = ""; req.on("data", (d) => (b += d)); req.on("end", () => r(b)); }) : undefined;
  try {
    const up = await fetch(ADMIN_URL + path, {
      method: req.method,
      headers: { authorization: `Bearer ${ADMIN_TOKEN ?? ""}`, "content-type": "application/json" },
      body: body || undefined,
    });
    res.writeHead(up.status, { "content-type": up.headers.get("content-type") ?? "application/json" }).end(await up.text());
  } catch (e) {
    res.writeHead(502, { "content-type": "application/json" }).end(JSON.stringify({ ok: false, error: String(e) }));
  }
});

new WebSocketServer({ server: http }).on("connection", async (ws) => {
  clients.add(ws);
  ws.on("close", () => {
    clients.delete(ws);
    if (!clients.size && running) {
      running = false;
      void engine.stop();
    }
  });
  ws.on("message", (raw) => {
    let m: ClientEvent;
    try {
      m = ClientEvent.parse(JSON.parse(raw.toString()));
    } catch (e) {
      return void ws.send(JSON.stringify({ type: "error", message: `bad client event: ${String(e).slice(0, 200)}`, code: "bad_event" }));
    }
    if (m.type === "audio_in") return engine.audio(m.data);
    if (m.type === "text_input") {
      console.log(`← text_input ${JSON.stringify(m.text)}`);
      return engine.text(m.text);
    }
    if (m.type === "elicitation_response" && pending?.id === m.id) settle({ action: m.action, content: m.content as ElicitResult["content"] });
  });
  if (!running) {
    running = true;
    try {
      await engine.start();
    } catch (e) {
      running = false;
      emit({ type: "error", message: `voice engine ${VOICE_ENGINE}: ${String(e).slice(0, 300)}`, code: "engine" });
      return;
    }
  }
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "state", state: "idle" } satisfies ServerEvent));
});

try {
  await ctx.mcp.connect();
} catch (e) {
  console.error(`[mcp] cannot reach ${MCP_URL}: ${String(e).slice(0, 200)} (start the mock with npm run mock)`);
  process.exit(1);
}
http.listen(PORT, () => console.log(`simulator backend ws://localhost:${PORT}  engine=${VOICE_ENGINE}  mcp=${MCP_URL}  admin=${ADMIN_URL}`));
