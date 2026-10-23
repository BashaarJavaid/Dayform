// T-02 smoke: browser <-> WebSocket relay <-> Nova Sonic bidirectional stream.
// Event shapes follow https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-input-events.html
// and the AWS sample amazon-nova-samples/speech-to-speech/amazon-nova-2-sonic/sample-codes/websocket-nodejs/src/client.ts
import { readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import {
  BedrockRuntimeClient,
  InvokeModelWithBidirectionalStreamCommand,
  type InvokeModelWithBidirectionalStreamInput,
} from "@aws-sdk/client-bedrock-runtime";
import { NodeHttp2Handler } from "@smithy/node-http-handler";

const here = dirname(fileURLToPath(import.meta.url));

// Load AWS_PROFILE / AWS_REGION / VOICE_MODEL_ID from the repo's .env.local (process env wins).
const envFile = join(here, "../../.env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^(AWS_PROFILE|AWS_REGION|VOICE_MODEL_ID)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
const MODEL_ID = process.env.VOICE_MODEL_ID ?? "amazon.nova-2-sonic-v1:0";
const REGION = process.env.AWS_REGION ?? "us-east-1";
const PORT = Number(process.env.PORT ?? 8102);
const RECONNECT_AFTER_S = Number(process.env.RECONNECT_AFTER_S ?? 60); // 0 = off

const SYSTEM_PROMPT =
  "You are Alexa, a friendly voice assistant with the Dayform fitness add-on. " +
  "When the user says they ate or drank something, call log_meal_stub with each food and its quantity, " +
  "then confirm briefly in one or two short sentences using the tool result. Keep every reply short and spoken.";

const LOG_MEAL_STUB_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      description: "Each food or drink the user had.",
      items: {
        type: "object",
        properties: {
          food: { type: "string", description: "Food name, e.g. eggs, roti, chicken karahi." },
          quantity: { type: "number", description: "How many or how much; 1 if not said." },
          unit: { type: "string", description: "Optional unit, e.g. plate, glass, cup." },
        },
        required: ["food", "quantity"],
      },
    },
  },
  required: ["items"],
};

function runLogMealStub(input: any) {
  // Fixed result: the smoke test only proves the round trip.
  return { logged: true, items: input?.items ?? [], total_kcal: 156, protein_g: 12.6, remaining_kcal: 1844 };
}

const bedrock = new BedrockRuntimeClient({
  region: REGION,
  requestHandler: new NodeHttp2Handler({ requestTimeout: 300000, sessionTimeout: 300000, disableConcurrentStreams: false, maxConcurrentStreams: 20 }),
});

type Out = (msg: object) => void;
type Line = { role: string; text: string };

const SILENCE = Buffer.alloc(1024).toString("base64"); // 32 ms of 16 kHz 16-bit mono

/** One Bedrock bidirectional stream (one Sonic session). */
class SonicSession {
  promptName = randomUUID();
  audioContent = randomUUID();
  private queue: object[] = [];
  private wake: (() => void) | null = null;
  private closed = false;
  private lastMicAt = 0;
  private silenceTimer: NodeJS.Timeout;
  private cur: { role?: string; type?: string; stage?: string } = {};
  private pendingTool: any = null;
  startedAt = Date.now();
  lastOutputAt = 0;
  turnMarkAt = 0; // set when a typed turn is sent; cleared on first audio
  onDead: (err: unknown) => void = () => {};

  constructor(private voice: string, private system: string, private out: Out, private transcript: Line[]) {
    this.push({ sessionStart: { inferenceConfiguration: { maxTokens: 1024, topP: 0.9, temperature: 0.7 }, turnDetectionConfiguration: { endpointingSensitivity: "MEDIUM" } } });
    this.push({
      promptStart: {
        promptName: this.promptName,
        textOutputConfiguration: { mediaType: "text/plain" },
        audioOutputConfiguration: { mediaType: "audio/lpcm", sampleRateHertz: 24000, sampleSizeBits: 16, channelCount: 1, voiceId: voice, encoding: "base64", audioType: "SPEECH" },
        toolUseOutputConfiguration: { mediaType: "application/json" },
        toolConfiguration: {
          tools: [{ toolSpec: { name: "log_meal_stub", description: "Log foods and drinks the user says they ate or drank.", inputSchema: { json: JSON.stringify(LOG_MEAL_STUB_SCHEMA) } } }],
        },
      },
    });
    this.sendText("SYSTEM", system, false);
    this.push({
      contentStart: {
        promptName: this.promptName, contentName: this.audioContent, type: "AUDIO", interactive: true, role: "USER",
        audioInputConfiguration: { mediaType: "audio/lpcm", sampleRateHertz: 16000, sampleSizeBits: 16, channelCount: 1, audioType: "SPEECH", encoding: "base64" },
      },
    });
    // Keep the audio stream alive with silence when the mic is idle (typed-only use).
    this.silenceTimer = setInterval(() => {
      if (Date.now() - this.lastMicAt > 200) this.audio(SILENCE, false);
    }, 32);
    this.run();
  }

  private push(event: object) {
    if (this.closed) return;
    this.queue.push({ event });
    this.wake?.();
  }

  sendText(role: "SYSTEM" | "USER" | "ASSISTANT", content: string, interactive: boolean) {
    const contentName = randomUUID();
    this.push({ contentStart: { promptName: this.promptName, contentName, type: "TEXT", interactive, role, textInputConfiguration: { mediaType: "text/plain" } } });
    this.push({ textInput: { promptName: this.promptName, contentName, content } });
    this.push({ contentEnd: { promptName: this.promptName, contentName } });
  }

  typed(text: string) {
    this.transcript.push({ role: "USER", text });
    this.turnMarkAt = Date.now();
    this.sendText("USER", text, true);
  }

  audio(b64: string, fromMic = true) {
    if (fromMic) this.lastMicAt = Date.now();
    this.push({ audioInput: { promptName: this.promptName, contentName: this.audioContent, content: b64 } });
  }

  get busy() {
    return this.pendingTool !== null || Date.now() - this.lastOutputAt < 2000;
  }

  async close() {
    if (this.closed) return;
    clearInterval(this.silenceTimer);
    this.push({ contentEnd: { promptName: this.promptName, contentName: this.audioContent } });
    this.push({ promptEnd: { promptName: this.promptName } });
    this.push({ sessionEnd: {} });
    await new Promise((r) => setTimeout(r, 300));
    this.closed = true;
    this.wake?.();
  }

  private async *events(): AsyncGenerator<InvokeModelWithBidirectionalStreamInput> {
    while (true) {
      while (this.queue.length) yield { chunk: { bytes: new TextEncoder().encode(JSON.stringify(this.queue.shift())) } };
      if (this.closed) return;
      await new Promise<void>((r) => (this.wake = r));
      this.wake = null;
    }
  }

  private async run() {
    try {
      const res = await bedrock.send(new InvokeModelWithBidirectionalStreamCommand({ modelId: MODEL_ID, body: this.events() }));
      for await (const ev of res.body!) {
        if (ev.chunk?.bytes) this.handle(JSON.parse(new TextDecoder().decode(ev.chunk.bytes)).event ?? {});
        else {
          const [k, v] = Object.entries(ev)[0] ?? [];
          this.out({ type: "error", source: k, detail: v });
        }
      }
    } catch (err: any) {
      if (!this.closed) {
        this.out({ type: "error", source: err?.name ?? "stream", detail: err?.message ?? String(err) });
        clearInterval(this.silenceTimer);
        this.closed = true;
        this.onDead(err);
      }
    }
  }

  private handle(e: any) {
    if (e.contentStart) {
      let stage: string | undefined;
      try { stage = JSON.parse(e.contentStart.additionalModelFields ?? "{}").generationStage; } catch {}
      this.cur = { role: e.contentStart.role, type: e.contentStart.type, stage };
    } else if (e.audioOutput) {
      this.lastOutputAt = Date.now();
      if (this.turnMarkAt) {
        this.out({ type: "latency", kind: "text", ms: Date.now() - this.turnMarkAt });
        this.turnMarkAt = 0;
      }
      this.out({ type: "audio", data: e.audioOutput.content });
    } else if (e.textOutput) {
      const text: string = e.textOutput.content;
      const role = e.textOutput.role ?? this.cur.role;
      if (text.includes('"interrupted"')) { this.out({ type: "interrupt" }); return; }
      this.out({ type: "text", role, stage: this.cur.stage, text });
      if (role === "USER" || (role === "ASSISTANT" && this.cur.stage !== "SPECULATIVE")) this.transcript.push({ role, text });
    } else if (e.toolUse) {
      this.pendingTool = e.toolUse;
    } else if (e.contentEnd && e.contentEnd.type === "TOOL" && this.pendingTool) {
      const t = this.pendingTool;
      this.pendingTool = null;
      let input: any = {};
      try { input = JSON.parse(t.content); } catch {}
      const result = t.toolName === "log_meal_stub" ? runLogMealStub(input) : { error: `unknown tool ${t.toolName}` };
      this.transcript.push({ role: "TOOL", text: `${t.toolName} ${JSON.stringify(input)}` });
      this.out({ type: "tool", name: t.toolName, input, result });
      const contentName = randomUUID();
      this.push({ contentStart: { promptName: this.promptName, contentName, interactive: false, type: "TOOL", role: "TOOL", toolResultInputConfiguration: { toolUseId: t.toolUseId, type: "TEXT", textInputConfiguration: { mediaType: "text/plain" } } } });
      this.push({ toolResult: { promptName: this.promptName, contentName, content: JSON.stringify(result) } });
      this.push({ contentEnd: { promptName: this.promptName, contentName } });
    } else if (e.contentEnd) {
      if (e.contentEnd.stopReason === "END_TURN" && this.cur.role === "ASSISTANT") this.out({ type: "turn_end" });
    } else if (e.completionEnd) {
      this.out({ type: "completion_end" });
    }
  }
}

/** Code-built summary (no LLM): the last few transcript lines, trimmed. */
function summarize(t: Line[]): string {
  const lines = t.slice(-20).map((l) => `${l.role === "ASSISTANT" ? "Alexa" : l.role === "TOOL" ? "Tool call" : "User"}: ${l.text.slice(0, 160)}`);
  return lines.length ? "Summary of the conversation so far (continue from here; do not repeat it back):\n" + lines.join("\n") : "";
}

const http = createServer((req, res) => {
  if (req.url === "/" || req.url === "/index.html") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(readFileSync(join(here, "index.html")));
  } else { res.writeHead(404); res.end(); }
});

new WebSocketServer({ server: http }).on("connection", (ws: WebSocket) => {
  const out: Out = (m) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(m));
  const transcript: Line[] = [];
  let voice = "tiffany";
  let s: SonicSession | null = null;

  const open = (system: string) => {
    const sess = new SonicSession(voice, system, out, transcript);
    sess.onDead = () => { if (s === sess) reconnect("stream error"); };
    s = sess;
  };
  const reconnect = async (why: string) => {
    const old = s;
    const summary = summarize(transcript);
    open(summary ? `${SYSTEM_PROMPT}\n\n${summary}` : SYSTEM_PROMPT);
    await old?.close();
    console.log(`[reconnect] ${why}; summary lines=${summary.split("\n").length - 1}`);
    out({ type: "reconnected", why, summary });
  };
  const timer = setInterval(() => {
    if (RECONNECT_AFTER_S > 0 && s && !s.busy && Date.now() - s.startedAt > RECONNECT_AFTER_S * 1000) reconnect(`${RECONNECT_AFTER_S}s elapsed`);
  }, 1000);

  ws.on("message", (raw, isBinary) => {
    if (isBinary) { s?.audio((raw as Buffer).toString("base64")); return; }
    const m = JSON.parse(raw.toString());
    if (m.type === "start") {
      voice = m.voice ?? voice;
      s?.close();
      open(SYSTEM_PROMPT);
      console.log(`[start] model=${MODEL_ID} voice=${voice}`);
      out({ type: "ready", model: MODEL_ID, voice, reconnectAfterS: RECONNECT_AFTER_S });
    } else if (m.type === "text") {
      console.log(`[text] ${m.text}`);
      s?.typed(m.text);
    } else if (m.type === "reconnect") reconnect("manual");
  });
  ws.on("close", () => { clearInterval(timer); s?.close(); });
});

http.listen(PORT, () => console.log(`Nova Sonic relay on http://localhost:${PORT}  model=${MODEL_ID} region=${REGION} profile=${process.env.AWS_PROFILE ?? "(default)"} reconnectAfter=${RECONNECT_AFTER_S}s`));
