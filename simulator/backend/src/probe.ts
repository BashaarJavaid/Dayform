// sim:probe: type lines into the simulator backend and print every event until each turn ends (state idle).
// Usage: npm run sim:probe -- [--say-yes|--decline|--no-answer] [--gap <s>] "<line>" ["<line>" ...]
// Elicitation is answered with a click (elicitation_response accept {confirm:true}) unless --say-yes types "yes".
// --audio speaks each line instead (Polly voice, 16 kHz audio_in in real time) to test the mic path without a mic.
import { WebSocket } from "ws";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import type { ClientEvent, ServerEvent } from "@dayform/contracts";

const argv = process.argv.slice(2);
const flag = (f: string) => argv.includes(f);
const gapIdx = argv.indexOf("--gap");
const gapS = gapIdx >= 0 ? Number(argv[gapIdx + 1]) : 0;
const lines = argv.filter((a, i) => !a.startsWith("--") && (gapIdx < 0 || i !== gapIdx + 1));
if (!lines.length) {
  console.error('usage: sim:probe -- [--say-yes|--decline] [--gap s] "<utterance>" ...');
  process.exit(2);
}
const url = process.env.SIM_URL ?? `ws://localhost:${process.env.SIM_PORT ?? 8300}`;
const ws = new WebSocket(url);
const t0 = Date.now();
const ts = () => `+${((Date.now() - t0) / 1000).toFixed(2)}s`.padStart(8);
const send = (ev: ClientEvent) => ws.send(JSON.stringify(ev));
const AUDIO = flag("--audio");
let polly: PollyClient | undefined;
/** Type the line, or with --audio speak it as mic audio followed by 1.5 s of silence. */
async function userSays(text: string) {
  console.log(ts(), (AUDIO ? "SPEAK audio_in" : "SEND text_input").padEnd(19), JSON.stringify(text));
  if (!AUDIO) return send({ type: "text_input", text });
  try { process.loadEnvFile(new URL("../../../.env.local", import.meta.url).pathname); } catch {}
  polly ??= new PollyClient({ region: process.env.AWS_REGION ?? "us-east-1" });
  const r = await polly.send(new SynthesizeSpeechCommand({ Text: text, VoiceId: "Matthew", Engine: "neural", OutputFormat: "pcm", SampleRate: "16000" }));
  const pcm = Buffer.concat([Buffer.from(await r.AudioStream!.transformToByteArray()), Buffer.alloc(48000)]);
  for (let i = 0; i < pcm.length; i += 1024) {
    send({ type: "audio_in", data: pcm.subarray(i, i + 1024).toString("base64") });
    await new Promise((res) => setTimeout(res, 32));
  }
}

let inTurn = false;
let onIdle: (() => void) | null = null;
let audioBytes = 0;
ws.on("message", (raw) => {
  const ev = JSON.parse(raw.toString()) as ServerEvent;
  if (ev.type === "audio_out") return void (audioBytes += (ev.data.length * 3) / 4);
  const { type, ...rest } = ev as any;
  if (type === "card") rest.html = `<${rest.html.length} chars>`, rest.data = JSON.stringify(rest.data).slice(0, 160) + "…";
  if (type === "card" && /cart/.test(ev.type === "card" ? ev.resource_uri : "")) rest.add_to_cart_url = (ev as any).data?.add_to_cart_url;
  console.log(ts(), type.padEnd(19), JSON.stringify(rest));
  if (ev.type === "elicitation_request" && !flag("--no-answer")) {
    setTimeout(() => {
      if (flag("--say-yes")) {
        void userSays("yes");
      } else {
        const r: ClientEvent = flag("--decline")
          ? { type: "elicitation_response", id: ev.id, action: "decline" }
          : { type: "elicitation_response", id: ev.id, action: "accept", content: { confirm: true } };
        console.log(ts(), "SEND".padEnd(19), JSON.stringify(r));
        send(r);
      }
    }, 800);
  }
  if (type === "state" && ev.type === "state") {
    if (ev.state !== "idle") inTurn = true;
    else if (inTurn) onIdle?.();
  }
});

ws.on("open", async () => {
  for (const [i, line] of lines.entries()) {
    if (i && gapS) {
      console.log(ts(), `(waiting ${gapS}s)`);
      await new Promise((r) => setTimeout(r, gapS * 1000));
    }
    inTurn = false;
    audioBytes = 0;
    const done = new Promise<void>((r) => (onIdle = r));
    await userSays(line);
    const timeout = new Promise<string>((r) => setTimeout(() => r("timeout"), 120_000));
    if ((await Promise.race([done, timeout])) === "timeout") {
      console.log(ts(), "TIMEOUT waiting for state idle");
      process.exit(1);
    }
    console.log(ts(), `turn done; audio_out ${Math.round(audioBytes)} bytes (${(audioBytes / 48000).toFixed(1)} s)`);
  }
  ws.close();
  process.exit(0);
});
ws.on("error", (e) => {
  console.error(`cannot reach ${url}: ${e.message} (npm run sim:backend)`);
  process.exit(1);
});
