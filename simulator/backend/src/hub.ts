// Shared pieces every voice engine uses: event emitter, turn timing, Polly speech, elicitation by voice.
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import type { ServerEvent } from "@dayform/contracts";
import { REGION } from "./env.ts";
import type { McpLink } from "./mcp.ts";

export interface Ctx {
  emit(ev: ServerEvent): void;
  turn: TurnClock;
  mcp: McpLink;
  /** Typed or heard user text. True when it answered a pending elicitation (then the engine drops it). */
  answerElicitation(text: string): boolean;
  /** True while an elicitation waits for the user's answer. */
  readonly awaitingAnswer: boolean;
  /** Conversation lines for Sonic session renewal summaries. */
  transcript: { role: "User" | "Alexa" | "Tool call"; text: string }[];
}

export interface Engine {
  start(): Promise<void>;
  stop(): Promise<void>;
  text(text: string): void;
  audio(b64: string): void;
  /** Speak a line outside the model's turn (the elicitation question). */
  say(text: string): Promise<void>;
}

/** Turn timing (task 7): end of speech (or typed send) → first audio, tool time, total. */
export class TurnClock {
  private t0 = 0;
  private first = 0;
  private toolMs = 0;
  private tools = 0;
  constructor(private emit: (ev: ServerEvent) => void) {}
  begin() {
    this.t0 = performance.now();
    this.first = 0;
    this.toolMs = 0;
    this.tools = 0;
  }
  get active() {
    return this.t0 > 0;
  }
  audio() {
    if (this.t0 && !this.first) this.first = performance.now();
  }
  tool(ms: number) {
    this.toolMs += ms;
    this.tools++;
  }
  end() {
    if (!this.t0) return;
    const now = performance.now();
    const first = this.first ? Math.round(this.first - this.t0) : null;
    const text = `Turn: first audio ${first ?? "–"} ms · ${this.tools} tool call(s) ${this.toolMs} ms · total ${Math.round(now - this.t0)} ms`;
    console.log(`[timing] ${text}`);
    // No timing event in the contracts yet: it rides a progress event (proposed contract change in the hand-off).
    this.emit({ type: "progress", call_id: null, text });
    this.t0 = 0;
  }
}

let polly: PollyClient | undefined;
let pollyDown = false;
/** Polly neural speech as 24 kHz PCM16 base64 chunks (Polly PCM tops out at 16 kHz, so upsample 2:3). */
export async function pollyPcm24(text: string): Promise<string[]> {
  if (pollyDown) return [];
  try {
    polly ??= new PollyClient({ region: REGION });
    const r = await polly.send(new SynthesizeSpeechCommand({ Text: text, VoiceId: "Joanna", Engine: "neural", OutputFormat: "pcm", SampleRate: "16000" }));
    const pcm16 = Buffer.from(await r.AudioStream!.transformToByteArray());
    const n = Math.floor(pcm16.length / 2);
    const out = Buffer.alloc(Math.floor((n * 3) / 2) * 2);
    for (let i = 0; i < out.length / 2; i++) {
      const x = (i * 2) / 3;
      const j = Math.floor(x);
      const a = pcm16.readInt16LE(Math.min(j, n - 1) * 2);
      const b = pcm16.readInt16LE(Math.min(j + 1, n - 1) * 2);
      out.writeInt16LE(Math.round(a + (b - a) * (x - j)), i * 2);
    }
    const chunks: string[] = [];
    for (let i = 0; i < out.length; i += 9600) chunks.push(out.subarray(i, i + 9600).toString("base64"));
    return chunks;
  } catch (e) {
    pollyDown = true;
    console.log(`[polly] off, replies are silent: ${String(e).slice(0, 160)}`);
    return [];
  }
}

/** Play time of base64 PCM16 24 kHz audio, in ms (48 bytes per ms). */
export const playMs = (chunks: string[]) => chunks.reduce((s, c) => s + (c.length * 3) / 4, 0) / 48;

const YES = /^\s*(yes|yeah|yep|yup|sure|ok(ay)?|confirm(ed)?|do it|go ahead|please do|correct)\b/i;
const NO = /^\s*(no|nope|nah|cancel|don'?t|stop|never ?mind)\b/i;
/** Spoken or typed yes/no → elicitation answer; every boolean field in the requested schema gets the answer. */
export function spokenAnswer(text: string, schema: Record<string, any>): { action: "accept" | "decline"; content?: Record<string, unknown> } | null {
  if (YES.test(text)) {
    const content: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema.properties ?? {})) if ((v as any).type === "boolean") content[k] = true;
    return { action: "accept", content };
  }
  if (NO.test(text)) return { action: "decline" };
  return null;
}
