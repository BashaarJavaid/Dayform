// VOICE_ENGINE=text: typed input → Nova (Converse with the MCP tools) → Polly voice (or silence).
// VOICE_ENGINE=pipeline: the same, with Amazon Transcribe streaming in front for mic audio.
import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type Message,
  type Tool as BedrockTool,
} from "@aws-sdk/client-bedrock-runtime";
import { StartStreamTranscriptionCommand, TranscribeStreamingClient } from "@aws-sdk/client-transcribe-streaming";
import { REASONING_MODEL_ID, REGION, SYSTEM_PROMPT } from "../env.ts";
import { pollyPcm24, playMs, type Ctx, type Engine } from "../hub.ts";
import { toolSchema } from "../mcp.ts";

const MAX_STEPS = 8;
const KEEP_TURNS = 12;

export class ConverseEngine implements Engine {
  private bedrock = new BedrockRuntimeClient({ region: REGION });
  private history: Message[] = [];
  private queue: string[] = [];
  private busy = false;
  private stt?: Transcriber;

  constructor(private ctx: Ctx, pipeline: boolean) {
    if (pipeline) this.stt = new Transcriber(ctx, (t) => this.text(t, true));
  }

  async start() {}
  async stop() {
    this.stt?.stop();
  }

  audio(b64: string) {
    this.stt?.push(b64);
  }

  text(text: string, heard = false) {
    if (!heard) this.ctx.emit({ type: "user_transcript", text, final: true });
    if (this.ctx.answerElicitation(text)) return;
    this.queue.push(text);
    void this.drain();
  }

  private async drain() {
    if (this.busy) return;
    this.busy = true;
    while (this.queue.length) {
      const text = this.queue.shift()!;
      try {
        await this.turn(text);
      } catch (e) {
        console.error("[turn]", e);
        this.ctx.emit({ type: "error", message: String((e as Error)?.message ?? e).slice(0, 300), code: "turn" });
      }
      this.ctx.turn.end();
      this.ctx.emit({ type: "state", state: "idle" });
    }
    this.busy = false;
  }

  private tools(): BedrockTool[] {
    return this.ctx.mcp.tools.map((t) => ({
      toolSpec: { name: t.name, description: t.description ?? t.name, inputSchema: { json: toolSchema(t) as never } },
    }));
  }

  private trim() {
    // Keep the last KEEP_TURNS user turns; a turn starts at a user message with text (not tool results).
    const starts = this.history.flatMap((m, i) => (m.role === "user" && m.content?.some((c) => c.text) ? [i] : []));
    if (starts.length > KEEP_TURNS) this.history = this.history.slice(starts[starts.length - KEEP_TURNS]);
  }

  private async turn(text: string) {
    this.ctx.turn.begin();
    this.ctx.emit({ type: "state", state: "thinking" });
    this.ctx.transcript.push({ role: "User", text });
    this.history.push({ role: "user", content: [{ text }] });
    this.trim();
    let reply = "";
    for (let step = 0; step < MAX_STEPS; step++) {
      const r = await this.bedrock.send(
        new ConverseCommand({
          modelId: REASONING_MODEL_ID,
          system: [{ text: SYSTEM_PROMPT }],
          messages: this.history,
          toolConfig: { tools: this.tools() },
          inferenceConfig: { maxTokens: 800, temperature: 0.2 },
        }),
      );
      const msg = r.output!.message!;
      this.history.push(msg);
      const uses = msg.content?.filter((c) => c.toolUse) ?? [];
      if (r.stopReason !== "tool_use" || !uses.length) {
        reply = (msg.content ?? []).map((c) => c.text ?? "").join(" ");
        break;
      }
      const results: ContentBlock[] = [];
      for (const { toolUse } of uses) {
        const args = (toolUse!.input ?? {}) as Record<string, unknown>;
        this.ctx.transcript.push({ role: "Tool call", text: `${toolUse!.name} ${JSON.stringify(args)}` });
        const res = await this.ctx.mcp.call(toolUse!.name!, args);
        this.ctx.emit({ type: "state", state: "thinking" });
        results.push({ toolResult: { toolUseId: toolUse!.toolUseId, content: [{ text: res.text }], status: res.ok ? "success" : "error" } });
      }
      this.history.push({ role: "user", content: results });
    }
    reply = reply.replace(/<thinking>[\s\S]*?<\/thinking>/g, "").replace(/https?:\/\/\S+/g, "").replace(/[*_#`]/g, "").replace(/\s+/g, " ").trim() || "Sorry, I couldn't do that.";
    this.ctx.transcript.push({ role: "Alexa", text: reply });
    this.ctx.emit({ type: "alexa_transcript", text: reply, final: true });
    await this.say(reply, false);
  }

  async say(text: string, listenAfter = true) {
    if (listenAfter) this.ctx.emit({ type: "alexa_transcript", text, final: true });
    const chunks = await pollyPcm24(text);
    if (chunks.length) {
      this.ctx.turn.audio();
      this.ctx.emit({ type: "state", state: "speaking" });
      for (const data of chunks) this.ctx.emit({ type: "audio_out", data });
      await new Promise((r) => setTimeout(r, playMs(chunks)));
    }
    if (listenAfter && this.ctx.awaitingAnswer) this.ctx.emit({ type: "state", state: "listening" });
  }
}

/** Thin Transcribe streaming wrapper: opens on mic audio, closes after 2 s without audio, debounces finals. */
export class Transcriber {
  private client = new TranscribeStreamingClient({ region: REGION });
  private chunks: Buffer[] = [];
  private wake?: () => void;
  private open = false;
  private lastAudio = 0;
  private finals: string[] = [];
  private timer?: NodeJS.Timeout;

  constructor(private ctx: Ctx, private onUtterance: (text: string) => void) {}

  push(b64: string) {
    this.lastAudio = Date.now();
    this.chunks.push(Buffer.from(b64, "base64"));
    this.wake?.();
    if (!this.open) void this.run();
  }

  stop() {
    this.lastAudio = 0;
    this.wake?.();
  }

  private async *audio() {
    while (true) {
      while (this.chunks.length) yield { AudioEvent: { AudioChunk: this.chunks.shift()! } };
      if (Date.now() - this.lastAudio > 2000) return;
      await new Promise<void>((r) => {
        this.wake = r;
        setTimeout(r, 250);
      });
    }
  }

  private async run() {
    this.open = true;
    try {
      const r = await this.client.send(
        new StartStreamTranscriptionCommand({ LanguageCode: "en-US", MediaEncoding: "pcm", MediaSampleRateHertz: 16000, AudioStream: this.audio() }),
      );
      for await (const ev of r.TranscriptResultStream!) {
        for (const res of ev.TranscriptEvent?.Transcript?.Results ?? []) {
          const text = res.Alternatives?.[0]?.Transcript ?? "";
          if (!text) continue;
          if (res.IsPartial) {
            this.ctx.emit({ type: "user_transcript", text: [...this.finals, text].join(" "), final: false });
            continue;
          }
          this.finals.push(text);
          clearTimeout(this.timer);
          this.timer = setTimeout(() => {
            const all = this.finals.join(" ");
            this.finals = [];
            this.ctx.emit({ type: "user_transcript", text: all, final: true });
            this.onUtterance(all);
          }, 700);
        }
      }
    } catch (e) {
      this.ctx.emit({ type: "error", message: `transcribe: ${String(e).slice(0, 200)}`, code: "stt" });
    }
    this.open = false;
  }
}
