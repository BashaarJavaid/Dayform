// Two ways to run a scene turn, behind one interface:
//  - mcp: calls the scene's expected tools directly on MCP_URL (mock or real server).
//  - simulator: types the line into the T-30 backend WebSocket (SIM_URL) and lets Alexa choose the tools.
//    Results come from the card events (structuredContent), paired by call_id.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { ClientEvent, ServerEvent } from "@dayform/contracts";
import { MCP_URL, SIM_URL } from "./env.ts";

export type ExpectedCall = { tool: string; args: Record<string, unknown>; optional?: boolean };
export type ObservedCall = { tool: string; ms: number; result: any; error?: string };
export type TurnResult = {
  calls: ObservedCall[];
  reply?: string; // Alexa's final words (simulator only)
  firstAudioMs?: number; // line sent → first audio_out
  audioS?: number; // length of Alexa's audio
};

export interface Driver {
  name: string;
  /** One user line. `expected` is used by the mcp driver; the simulator driver lets Alexa choose. */
  turn(line: string, expected: ExpectedCall[]): Promise<TurnResult>;
  listTools(): Promise<{ tools: { name: string }[]; protocol: string | undefined }>;
  /** Elicitation messages seen so far (auto-accepted). */
  elicitations: string[];
  close(): Promise<void>;
}

export async function mcpDriver(url = MCP_URL): Promise<Driver & { client: Client }> {
  const client = new Client({ name: "dayform-demo", version: "0.1.0" }, { capabilities: { elicitation: { form: {} } } });
  const elicitations: string[] = [];
  client.setRequestHandler(ElicitRequestSchema, async (req) => {
    elicitations.push(String(req.params.message));
    return { action: "accept", content: { confirm: true } };
  });
  const transport = new StreamableHTTPClientTransport(new URL(url));
  await client.connect(transport);
  await client.listTools(); // lets the SDK validate structuredContent against each outputSchema
  return {
    name: `mcp ${url}`,
    client,
    elicitations,
    async turn(_line, expected) {
      const calls: ObservedCall[] = [];
      for (const c of expected) {
        const t0 = performance.now();
        try {
          const r = await client.callTool({ name: c.tool, arguments: c.args });
          const ms = Math.round(performance.now() - t0);
          calls.push({ tool: c.tool, ms, result: r.structuredContent, error: r.isError ? JSON.stringify(r.content) : undefined });
        } catch (e) {
          calls.push({ tool: c.tool, ms: Math.round(performance.now() - t0), result: undefined, error: String(e) });
          break;
        }
      }
      return { calls };
    },
    async listTools() {
      return { tools: (await client.listTools()).tools, protocol: transport.protocolVersion };
    },
    close: () => client.close(),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function simulatorDriver(url = SIM_URL): Promise<Driver> {
  const ws = new WebSocket(url);
  await new Promise((ok, bad) => {
    ws.onopen = ok;
    ws.onerror = () => bad(new Error(`cannot reach ${url} (npm run sim:backend)`));
  });
  const elicitations: string[] = [];
  let listener: ((ev: ServerEvent) => void) | null = null;
  ws.onmessage = (m) => listener?.(JSON.parse(String(m.data)));
  const send = (ev: ClientEvent) => ws.send(JSON.stringify(ev));
  let mcp: Awaited<ReturnType<typeof mcpDriver>> | undefined; // S7's tools/list goes straight to MCP_URL

  return {
    name: `simulator ${url}`,
    elicitations,
    turn(line) {
      return new Promise((resolve, reject) => {
        const t0 = performance.now();
        const calls = new Map<string, ObservedCall>();
        let reply = "";
        let firstAudioMs: number | undefined;
        let audioBytes = 0;
        let busy = false;
        let pending = false;
        let idleTimer: NodeJS.Timeout | undefined;
        const finish = async () => {
          listener = null;
          clearTimeout(timeout);
          const audioS = audioBytes / 48000; // 24 kHz PCM16
          // Let Alexa finish talking before the next line (typed input during playback is barge-in, F-008).
          const playEnd = (firstAudioMs ?? 0) + audioS * 1000;
          await sleep(Math.max(0, playEnd - (performance.now() - t0)) + 300);
          resolve({ calls: [...calls.values()], reply: reply.trim(), firstAudioMs, audioS: Math.round(audioS * 10) / 10 });
        };
        const timeout = setTimeout(() => {
          listener = null;
          reject(new Error(`turn timed out after 90 s: "${line}"`));
        }, 90_000);
        listener = (ev) => {
          if (ev.type === "audio_out") {
            firstAudioMs ??= Math.round(performance.now() - t0);
            audioBytes += (ev.data.length * 3) / 4;
          } else if (ev.type === "tool_call_started") {
            calls.set(ev.call_id, { tool: ev.name, ms: 0, result: undefined });
          } else if (ev.type === "tool_call_finished") {
            const c = calls.get(ev.call_id) ?? { tool: ev.name, ms: 0, result: undefined };
            c.ms = Math.round(ev.latency_ms);
            if (ev.status === "error") c.error = ev.summary;
            calls.set(ev.call_id, c);
          } else if (ev.type === "card" && ev.call_id && calls.has(ev.call_id)) {
            calls.get(ev.call_id)!.result = ev.data;
          } else if (ev.type === "alexa_transcript" && ev.final) {
            reply += " " + ev.text;
          } else if (ev.type === "elicitation_request") {
            elicitations.push(ev.message);
            pending = true;
            // Same as a click on Yes in the confirm overlay.
            setTimeout(() => {
              pending = false;
              send({ type: "elicitation_response", id: ev.id, action: "accept", content: { confirm: true } });
            }, 800);
          } else if (ev.type === "error") {
            reply += ` [error: ${ev.message}]`;
          } else if (ev.type === "state") {
            clearTimeout(idleTimer);
            if (ev.state !== "idle") busy = true;
            // A turn ends on idle that stays idle for 1.5 s with no confirm waiting.
            else if (busy) idleTimer = setTimeout(() => !pending && finish(), 1500);
          }
        };
        send({ type: "text_input", text: line });
      });
    },
    async listTools() {
      mcp ??= await mcpDriver();
      return mcp.listTools();
    },
    async close() {
      ws.close();
      await mcp?.close();
    },
  };
}
