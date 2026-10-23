// VOICE_ENGINE=sonic (default): Nova Sonic bidirectional stream, from the T-02 relay (smoke/nova-sonic/server.ts).
// Sonic hears the mic, picks MCP tools, speaks. Typed input goes into the same session once Alexa stops talking
// (F-008: input during play time counts as barge-in). The session renews before Sonic's 8-minute limit with a summary.
import { randomUUID } from "node:crypto";
import {
  BedrockRuntimeClient,
  InvokeModelWithBidirectionalStreamCommand,
  type InvokeModelWithBidirectionalStreamInput,
} from "@aws-sdk/client-bedrock-runtime";
import { NodeHttp2Handler } from "@smithy/node-http-handler";
import { ALEXA_VOICE, REGION, RENEW_AFTER_S, SYSTEM_PROMPT, VOICE_MODEL_FALLBACK_ID, VOICE_MODEL_ID } from "../env.ts";
import { pollyPcm24, playMs, type Ctx, type Engine } from "../hub.ts";
import { toolSchema } from "../mcp.ts";
import { Transcriber } from "./converse.ts";

const bedrock = new BedrockRuntimeClient({
  region: REGION,
  requestHandler: new NodeHttp2Handler({ requestTimeout: 600000, sessionTimeout: 600000, disableConcurrentStreams: false, maxConcurrentStreams: 20 }),
});
const SILENCE = Buffer.alloc(1024).toString("base64"); // 32 ms of 16 kHz 16-bit mono
const MAX_RESULT = 6000;

/** One Bedrock bidirectional stream (one Sonic session). */
class SonicSession {
  private promptName = randomUUID();
  private audioContent = randomUUID();
  private queue: object[] = [];
  private wake: (() => void) | null = null;
  private closed = false;
  private lastMicAt = 0;
  private silenceTimer: NodeJS.Timeout;
  private cur: { role?: string; stage?: string } = {};
  private toolUses = new Map<string, any>(); // toolUse events waiting for their contentEnd
  private toolChain: Promise<unknown> = Promise.resolve(); // Sonic may ask for several tools at once: run them in order
  private toolsQueued = 0;
  private results: [string, { ok: boolean; text: string; data: unknown }][] = [];
  /** An MCP call is queued or in flight (elicitation can keep it open for a while). */
  get toolRunning() {
    return this.toolsQueued > 0;
  }
  gotOutput = false;
  startedAt = Date.now();
  onDead: (err: unknown) => void = () => {};

  constructor(model: string, system: string, private eng: SonicEngine) {
    const tools = eng.ctx.mcp.tools.map((t) => ({
      toolSpec: { name: t.name, description: t.description ?? t.name, inputSchema: { json: JSON.stringify(toolSchema(t)) } },
    }));
    this.push({ sessionStart: { inferenceConfiguration: { maxTokens: 1024, topP: 0.9, temperature: 0.7 }, turnDetectionConfiguration: { endpointingSensitivity: "MEDIUM" } } });
    this.push({
      promptStart: {
        promptName: this.promptName,
        textOutputConfiguration: { mediaType: "text/plain" },
        audioOutputConfiguration: { mediaType: "audio/lpcm", sampleRateHertz: 24000, sampleSizeBits: 16, channelCount: 1, voiceId: ALEXA_VOICE, encoding: "base64", audioType: "SPEECH" },
        toolUseOutputConfiguration: { mediaType: "application/json" },
        toolConfiguration: { tools },
      },
    });
    this.sendText("SYSTEM", system, false);
    this.push({
      contentStart: {
        promptName: this.promptName, contentName: this.audioContent, type: "AUDIO", interactive: true, role: "USER",
        audioInputConfiguration: { mediaType: "audio/lpcm", sampleRateHertz: 16000, sampleSizeBits: 16, channelCount: 1, audioType: "SPEECH", encoding: "base64" },
      },
    });
    // Keep the audio stream alive with silence while the mic is idle (typed use).
    this.silenceTimer = setInterval(() => {
      if (Date.now() - this.lastMicAt > 200) this.audio(SILENCE, false);
    }, 32);
    void this.run(model);
  }

  get toolPending() {
    return this.toolUses.size > 0 || this.toolsQueued > 0;
  }

  private push(event: object) {
    if (this.closed) return;
    this.queue.push({ event });
    this.wake?.();
  }

  sendText(role: "SYSTEM" | "USER", content: string, interactive: boolean) {
    const contentName = randomUUID();
    this.push({ contentStart: { promptName: this.promptName, contentName, type: "TEXT", interactive, role, textInputConfiguration: { mediaType: "text/plain" } } });
    this.push({ textInput: { promptName: this.promptName, contentName, content } });
    this.push({ contentEnd: { promptName: this.promptName, contentName } });
  }

  audio(b64: string, fromMic = true) {
    if (fromMic) this.lastMicAt = Date.now();
    this.push({ audioInput: { promptName: this.promptName, contentName: this.audioContent, content: b64 } });
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

  private async run(model: string) {
    try {
      const res = await bedrock.send(new InvokeModelWithBidirectionalStreamCommand({ modelId: model, body: this.events() }));
      for await (const ev of res.body!) {
        if (ev.chunk?.bytes) this.handle(JSON.parse(new TextDecoder().decode(ev.chunk.bytes)).event ?? {});
        else throw Object.assign(new Error(JSON.stringify(ev).slice(0, 300)), { name: Object.keys(ev)[0] });
      }
    } catch (err) {
      if (!this.closed) {
        clearInterval(this.silenceTimer);
        this.closed = true;
        this.onDead(err);
      }
    }
  }

  /** Sonic parses tool results as JSON ("Tool Response parsing error" otherwise): structuredContent, or the text wrapped. */
  private toolResult(toolUseId: string, r: { ok: boolean; text: string; data: unknown }) {
    let content = JSON.stringify(r.ok ? (r.data ?? { result: r.text }) : { error: r.text });
    if (content.length > MAX_RESULT) content = JSON.stringify({ result: r.text.slice(0, MAX_RESULT) });
    const contentName = randomUUID();
    this.push({ contentStart: { promptName: this.promptName, contentName, interactive: false, type: "TOOL", role: "TOOL", toolResultInputConfiguration: { toolUseId, type: "TEXT", textInputConfiguration: { mediaType: "text/plain" } } } });
    this.push({ toolResult: { promptName: this.promptName, contentName, content } });
    this.push({ contentEnd: { promptName: this.promptName, contentName } });
  }

  private handle(e: any) {
    const eng = this.eng;
    if (process.env.SONIC_DEBUG && !e.audioOutput) console.log(`[sonic:event] ${JSON.stringify(e).slice(0, 240)}`);
    if (e.contentStart) {
      let stage: string | undefined;
      try { stage = JSON.parse(e.contentStart.additionalModelFields ?? "{}").generationStage; } catch {}
      this.cur = { role: e.contentStart.role, stage };
    } else if (e.audioOutput) {
      this.gotOutput = true;
      eng.output(e.audioOutput.content);
    } else if (e.textOutput) {
      this.gotOutput = true;
      const text: string = e.textOutput.content;
      const role = e.textOutput.role ?? this.cur.role;
      if (text.includes('"interrupted"')) return eng.interrupted();
      if (role === "USER") eng.heard(text);
      else if (role === "ASSISTANT") eng.said(text, this.cur.stage !== "SPECULATIVE");
    } else if (e.toolUse) {
      this.toolUses.set(e.toolUse.toolUseId, e.toolUse);
    } else if (e.contentEnd?.type === "TOOL") {
      const t = this.toolUses.get(e.contentEnd.toolUseId) ?? [...this.toolUses.values()][0];
      if (!t) return;
      this.toolUses.delete(t.toolUseId);
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(t.content); } catch {}
      this.toolsQueued++;
      // Sonic re-asks for tools whose results are still pending (seen in S4 while checkout_cart waits on the
      // elicitation): the same call twice in one turn reuses the first result instead of running again.
      const key = `${t.toolName} ${JSON.stringify(input)}`;
      const again = eng.turnCalls.get(key);
      this.toolChain = this.toolChain.then(async () => {
        let r: Awaited<ReturnType<typeof eng.ctx.mcp.call>>;
        if (again) {
          console.log(`[sonic] repeated ${key}: reusing the first result`);
          r = await again;
        } else {
          eng.ctx.transcript.push({ role: "Tool call", text: key });
          const p = eng.ctx.mcp.call(t.toolName, input);
          eng.turnCalls.set(key, p);
          r = await p;
        }
        this.toolsQueued--;
        eng.lastActivity = Date.now();
        // Hold results until the whole batch is done; otherwise Sonic talks over the checkout question.
        this.results.push([t.toolUseId, r]);
        if (this.toolsQueued === 0 && this.toolUses.size === 0) for (const [id, res] of this.results.splice(0)) this.toolResult(id, res);
        eng.ctx.emit({ type: "state", state: "thinking" });
      });
    } else if (e.contentEnd?.stopReason === "END_TURN" && this.cur.role === "ASSISTANT") {
      eng.endTurnSoon();
    }
  }
}

export class SonicEngine implements Engine {
  private s: SonicSession | null = null;
  private model = VOICE_MODEL_ID;
  private playEnd = 0; // when the audio sent so far finishes playing (Sonic streams faster than real time)
  private typedQueue: string[] = [];
  private endTimer?: NodeJS.Timeout;
  private renewTimer?: NodeJS.Timeout;
  private renewing = false;
  private lastRenewAt = 0;
  private stopped = true;
  lastActivity = 0;
  turnCalls = new Map<string, ReturnType<Ctx["mcp"]["call"]>>();
  private spoken = { spec: 0, final: 0 }; // Sonic sends each sentence's FINAL text when it finishes playing it

  // While an elicitation waits, the mic goes to Transcribe, not Sonic: Sonic takes a spoken "yes" during a pending
  // tool call as a new turn and calls the tools again (seen in testing).
  private yesNo: Transcriber;

  constructor(public ctx: Ctx) {
    this.yesNo = new Transcriber(ctx, (text) => void ctx.answerElicitation(text));
  }

  async start() {
    this.stopped = false;
    this.open(SYSTEM_PROMPT);
    this.renewTimer = setInterval(() => {
      if (this.s && Date.now() - this.s.startedAt > RENEW_AFTER_S * 1000 && this.idle()) void this.renew(`${RENEW_AFTER_S}s elapsed`);
      // Safety net: Sonic went quiet mid-turn (seen once after a tool result) → end the turn, renew the session.
      if (this.ctx.turn.active && !this.s?.toolRunning && Date.now() > Math.max(this.playEnd, this.lastActivity) + 8000) {
        console.log("[sonic] turn stalled 8 s; ending it and renewing the session");
        this.ctx.turn.end();
        this.ctx.emit({ type: "state", state: "idle" });
        void this.renew("stalled turn");
      }
      this.flushTyped();
    }, 250);
    console.log(`[sonic] model=${this.model} voice=${ALEXA_VOICE} renewAfter=${RENEW_AFTER_S}s`);
  }

  async stop() {
    this.stopped = true;
    clearInterval(this.renewTimer);
    await this.s?.close();
    this.s = null;
  }

  private open(system: string) {
    const sess = new SonicSession(this.model, system, this);
    sess.onDead = (err) => {
      if (this.s !== sess || this.stopped) return;
      const msg = `${(err as any)?.name ?? "stream"}: ${(err as any)?.message ?? err}`;
      console.log(`[sonic] session died: ${msg.slice(0, 300)}`);
      // Model unavailable before any output → next model in DESIGN §10 order (Nova 2 Sonic).
      if (!sess.gotOutput && this.model !== VOICE_MODEL_FALLBACK_ID && /AccessDenied|ResourceNotFound|model identifier|not authorized|unsupported model/i.test(msg)) {
        console.log(`[sonic] falling back to ${VOICE_MODEL_FALLBACK_ID}`);
        this.model = VOICE_MODEL_FALLBACK_ID;
      }
      this.ctx.emit({ type: "error", message: `Sonic: ${msg.slice(0, 200)}`, code: "sonic" });
      void this.renew("stream error");
    };
    this.s = sess;
  }

  private idle() {
    return !this.s?.toolPending && Date.now() > this.playEnd + 300 && !this.ctx.turn.active;
  }

  /** Renew the session with a code-built summary (no LLM). Debounced: one at a time, at most every 2 s. */
  private async renew(why: string) {
    if (this.renewing || this.stopped) return;
    const wait = this.lastRenewAt + 2000 - Date.now();
    this.renewing = true;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastRenewAt = Date.now();
    const old = this.s;
    const lines = this.ctx.transcript.slice(-20).map((l) => `${l.role}: ${l.text.slice(0, 200)}`);
    const summary = lines.length ? `\n\nSummary of the conversation so far (continue from here; do not repeat it back):\n${lines.join("\n")}` : "";
    this.open(SYSTEM_PROMPT + summary);
    await old?.close();
    this.renewing = false;
    console.log(`[sonic] renewed (${why}); summary lines=${lines.length}`);
  }

  audio(b64: string) {
    if (this.ctx.awaitingAnswer) this.yesNo.push(b64);
    else this.s?.audio(b64);
  }

  text(text: string) {
    this.ctx.emit({ type: "user_transcript", text, final: true });
    if (this.ctx.answerElicitation(text)) return;
    this.typedQueue.push(text);
    this.flushTyped();
  }

  /** Send typed input only when Alexa is not talking or calling a tool (F-008). */
  private flushTyped() {
    if (!this.typedQueue.length || !this.s || this.renewing || !this.idle()) return;
    const text = this.typedQueue.shift()!;
    this.ctx.transcript.push({ role: "User", text });
    this.ctx.turn.begin();
    this.spoken = { spec: 0, final: 0 };
    this.turnCalls.clear();
    this.lastActivity = Date.now();
    this.ctx.emit({ type: "state", state: "thinking" });
    this.s.sendText("USER", text, true);
  }

  // ---- called by the session ----
  output(b64: string) {
    clearTimeout(this.endTimer);
    this.lastActivity = Date.now();
    this.ctx.turn.audio();
    if (Date.now() > this.playEnd) this.ctx.emit({ type: "state", state: "speaking" });
    this.playEnd = Math.max(Date.now(), this.playEnd) + (b64.length * 3) / 4 / 48;
    this.ctx.emit({ type: "audio_out", data: b64 });
  }

  heard(text: string) {
    this.lastActivity = Date.now();
    this.ctx.emit({ type: "user_transcript", text, final: true });
    if (this.ctx.answerElicitation(text)) return;
    this.ctx.transcript.push({ role: "User", text });
    if (!this.ctx.turn.active) {
      this.ctx.turn.begin(); // end of speech ≈ when Sonic sends the final user transcript
      this.spoken = { spec: 0, final: 0 };
      this.turnCalls.clear();
      this.ctx.emit({ type: "state", state: "thinking" });
    }
  }

  said(text: string, final: boolean) {
    this.lastActivity = Date.now();
    this.ctx.emit({ type: "alexa_transcript", text, final });
    this.spoken[final ? "final" : "spec"]++;
    if (final) this.ctx.transcript.push({ role: "Alexa", text });
  }

  interrupted() {
    this.playEnd = Date.now();
    this.ctx.emit({ type: "state", state: "listening" });
  }

  /** END_TURN: idle once the audio has played out and Sonic has sent every sentence's FINAL text
   * (input before that counts as barge-in, F-008). Gives up waiting for FINAL texts 4 s after the audio ends. */
  endTurnSoon() {
    clearTimeout(this.endTimer);
    const fire = () => {
      if (this.s?.toolPending) return void (this.endTimer = setTimeout(fire, 300));
      const left = this.playEnd - Date.now();
      if (left > 0) return void (this.endTimer = setTimeout(fire, left + 200));
      if (this.spoken.final < this.spoken.spec && -left < 4000) return void (this.endTimer = setTimeout(fire, 200));
      this.ctx.turn.end();
      this.ctx.emit({ type: "state", state: "idle" });
      this.flushTyped();
    };
    this.endTimer = setTimeout(fire, 600);
  }

  /** The elicitation question: Sonic is waiting on the tool result, so Polly speaks it. */
  async say(text: string) {
    this.ctx.emit({ type: "alexa_transcript", text, final: true });
    const chunks = await pollyPcm24(text);
    for (const c of chunks) this.output(c);
    await new Promise((r) => setTimeout(r, playMs(chunks)));
    if (this.ctx.awaitingAnswer) this.ctx.emit({ type: "state", state: "listening" });
  }
}
