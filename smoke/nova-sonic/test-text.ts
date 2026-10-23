// Typed-turn check for the relay: tool call, audio back, latency over 5 turns, reconnect keeps context.
// Usage: npm run smoke:sonic (in another shell), then: npx tsx test-text.ts [--voice tiffany] [--wait-auto]
import { WebSocket } from "ws";

const args = process.argv.slice(2);
const voice = args.includes("--voice") ? args[args.indexOf("--voice") + 1] : "tiffany";
const waitAuto = args.includes("--wait-auto"); // wait for the server's timed reconnect instead of forcing one
const ws = new WebSocket(`ws://localhost:${process.env.PORT ?? 8102}`);
const t0 = Date.now();
const ts = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`;

let waiters: ((m: any) => boolean)[] = [];
const next = (pred: (m: any) => boolean, ms = 30000) =>
  new Promise<any>((res, rej) => {
    const timer = setTimeout(() => rej(new Error("timeout")), ms);
    waiters.push((m) => (pred(m) ? (clearTimeout(timer), res(m), true) : false));
  });

let audioBytes = 0;
const tools: any[] = [];
const latencies: number[] = [];
let assistantText = "";
ws.on("message", (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.type === "audio") audioBytes += Buffer.from(m.data, "base64").length;
  else if (m.type === "tool") { tools.push(m); console.log(ts(), "TOOL", m.name, JSON.stringify(m.input), "->", JSON.stringify(m.result)); }
  else if (m.type === "latency") { latencies.push(m.ms); console.log(ts(), `LATENCY first audio byte ${m.ms} ms`); }
  else if (m.type === "text") { if (m.role === "ASSISTANT" && m.stage !== "SPECULATIVE") assistantText += m.text + " "; console.log(ts(), `TEXT ${m.role}${m.stage ? "/" + m.stage : ""}: ${m.text}`); }
  else if (m.type === "error") console.log(ts(), "ERROR", m.source, JSON.stringify(m.detail));
  else if (m.type === "reconnected") console.log(ts(), "RECONNECTED", m.why, "\n" + m.summary);
  else console.log(ts(), m.type.toUpperCase(), m.type === "ready" ? JSON.stringify(m) : "");
  waiters = waiters.filter((w) => !w(m));
});

async function turn(text: string) {
  assistantText = "";
  const before = audioBytes;
  console.log(ts(), "SEND", JSON.stringify(text));
  ws.send(JSON.stringify({ type: "text", text }));
  await next((m) => m.type === "turn_end" || m.type === "completion_end", 30000).catch(() => console.log(ts(), "no turn_end within 30s"));
  // Sonic streams audio faster than real time and treats new input during "playback" as barge-in,
  // so wait out the reply's play time (24 kHz 16-bit mono = 48 bytes/ms) before the next turn.
  await new Promise((r) => setTimeout(r, 1500));
  await new Promise((r) => setTimeout(r, Math.max(0, (audioBytes - before) / 48 - 1500 + 500)));
  console.log(ts(), `turn audio bytes=${audioBytes - before}`);
  return assistantText;
}

ws.on("open", async () => {
  ws.send(JSON.stringify({ type: "start", voice }));
  await next((m) => m.type === "ready");
  const phrases = ["I had two eggs", "I also had a banana", "and a glass of milk", "two rotis and chicken karahi", "a mango lassi"];
  for (const p of phrases) await turn(p);

  if (waitAuto) await next((m) => m.type === "reconnected", 90000);
  else ws.send(JSON.stringify({ type: "reconnect" })), await next((m) => m.type === "reconnected");
  await new Promise((r) => setTimeout(r, 1000));
  const after = await turn("What was the first thing I told you I ate?");

  const sorted = [...latencies].sort((a, b) => a - b);
  const p50 = sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : NaN;
  const eggTool = tools.find((t) => JSON.stringify(t.input).toLowerCase().includes("egg"));
  console.log("\n=== RESULT ===");
  console.log(`tool log_meal_stub with eggs: ${eggTool ? "yes " + JSON.stringify(eggTool.input) : "NO"}`);
  console.log(`audio bytes total: ${audioBytes}`);
  console.log(`text-turn latency to first audio byte (ms): [${latencies.join(", ")}] p50=${p50}`);
  console.log(`after reconnect, answer mentions egg: ${/egg/i.test(after) ? "yes" : "NO"} :: ${after.trim()}`);
  ws.close();
  process.exit(eggTool && audioBytes > 0 && /egg/i.test(after) ? 0 : 1);
});
