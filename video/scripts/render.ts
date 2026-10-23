// Renders the video stills (title card, architecture slide, lower thirds) to 1920x1080 PNGs with headless Chrome
// over CDP, the same approach as cards/scripts/screens.ts. Lower thirds have a transparent background.
// Usage: npx tsx video/scripts/render.ts
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = new URL("../assets/", import.meta.url).pathname;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The look of the simulator and cards: near-black navy, Alexa cyan, violet for protein.
const BASE = `*{box-sizing:border-box;margin:0}html,body{width:1920px;height:1080px;overflow:hidden}
body{font-family:"Amazon Ember",Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:#f2f6fc}
.mono{font-family:ui-monospace,"SF Mono",Menlo,monospace}`;
const BG = `body{background:radial-gradient(1200px 700px at 30% 20%,#0f1d33 0%,#090d15 60%,#06090f 100%)}`;

const title = `<style>${BASE}${BG}
.wrap{position:absolute;left:160px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center}
.bar{width:420px;height:10px;border-radius:5px;background:linear-gradient(90deg,#1f7cff,#19d3ff);box-shadow:0 0 40px #19d3ff88;margin-bottom:56px}
h1{font-size:180px;font-weight:700;letter-spacing:-4px;line-height:1}
.tag{font-size:58px;line-height:1.3;margin-top:48px;color:#c7d3e6;max-width:1500px}
.tag b{color:#19d3ff;font-weight:600}
.sub{margin-top:64px;font-size:34px;letter-spacing:6px;text-transform:uppercase;color:#8fdcff}</style>
<div class="wrap"><div class="bar"></div><h1>Dayform</h1>
<div class="tag">Every fitness app makes you type.<br><b>This one, you just talk to.</b></div>
<div class="sub">An Alexa+ add-on</div></div>`;

// Architecture: three columns (device, server, AWS data/AI), from docs/architecture.mmd.
type Box = { x: number; y: number; t: string; s: string; hi?: boolean };
const W = 420, H = 150;
const boxes: Box[] = [
  { x: 80, y: 220, t: "Nova 2.5 Sonic", s: "Alexa's voice · Bedrock", hi: true },
  { x: 80, y: 480, t: "Echo Show simulator", s: "React frontend + backend" },
  { x: 750, y: 220, t: "MCP Apps cards", s: "8 cards · 768×480", hi: true },
  { x: 750, y: 480, t: "AgentCore Runtime", s: "Dayform MCP server · 18 tools", hi: true },
  { x: 750, y: 760, t: "amazon.com cart", s: "you check out; Alexa never orders" },
  { x: 1420, y: 220, t: "Nova 2 Lite on Bedrock", s: "judgment calls, checked by code", hi: true },
  { x: 1420, y: 480, t: "Aurora Serverless v2", s: "PostgreSQL + Data API", hi: true },
  { x: 1420, y: 760, t: "EventBridge Scheduler + Lambda", s: "overnight job: check-in, brief", hi: true },
];
const box = (b: Box) => `<div class="box${b.hi ? " hi" : ""}" style="left:${b.x}px;top:${b.y}px"><div class="t">${b.t}</div><div class="s">${b.s}</div></div>`;
const label = (x: number, y: number, html: string, cls = "") => `<div class="lbl ${cls}" style="left:${x}px;top:${y}px">${html}</div>`;
const arch = `<style>${BASE}${BG}
h2{position:absolute;left:80px;top:70px;font-size:56px;font-weight:700;letter-spacing:-1px}
h2 span{color:#19d3ff}
.box{position:absolute;width:${W}px;height:${H}px;border-radius:22px;background:#121a28;border:2px solid #2a3953;padding:30px 32px;display:flex;flex-direction:column;justify-content:center}
.box.hi{border-color:#19d3ff99;box-shadow:0 0 36px #19d3ff22}
.t{font-size:34px;font-weight:700}.s{font-size:24px;color:#c7d3e6;margin-top:8px}
.lbl{position:absolute;font-size:24px;color:#8fdcff;background:#090d15;padding:4px 10px;border-radius:8px;transform:translate(-50%,-50%);white-space:nowrap;text-align:center;line-height:1.3}
.lbl.big{font-size:27px;color:#19d3ff;font-weight:600}
.foot{position:absolute;left:80px;bottom:56px;font-size:26px;color:#c7d3e6}.foot b{color:#19d3ff;font-weight:600}
svg{position:absolute;left:0;top:0}</style>
<h2>How it works <span>·</span> Dayform</h2>
<svg width="1920" height="1080"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#19d3ff"/></marker>
</defs><g stroke="#19d3ff" stroke-width="3" fill="none">
<path d="M290 372V478" marker-start="url(#a)" marker-end="url(#a)"/>
<path d="M502 555H748" marker-end="url(#a)" stroke-width="5"/>
<path d="M960 478V372" marker-end="url(#a)"/>
<path d="M750 295C600 295 600 450 502 520" stroke-dasharray="10 8" marker-end="url(#a)"/>
<path d="M1172 520L1418 330" marker-end="url(#a)"/>
<path d="M1172 575H1418" marker-end="url(#a)"/>
<path d="M960 632V758" stroke-dasharray="4 8" marker-end="url(#a)"/>
<path d="M1630 758V632" marker-end="url(#a)"/>
<path d="M1842 835C1905 835 1905 295 1842 295" marker-end="url(#a)"/>
</g></svg>
${boxes.map(box).join("")}
${label(290, 425, "bidirectional<br>audio stream")}
${label(625, 610, "MCP 2025-11-25<br>Streamable HTTP", "big")}
${label(960, 425, "ui:// resources")}
${label(590, 380, "_meta.ui<br>resourceUri")}
${label(1295, 425, "unknown foods, meal plans")}
${label(1295, 612, "Data API")}
${label(960, 695, "Add-to-Cart link")}
${label(1630, 695, "nightly")}
<div class="foot">Code does the arithmetic, storage and checks. <b>Every number is checked against the database.</b></div>`;

// Lower thirds: a pill in the empty band above the Echo Show frame (top left), so it never covers the
// burned-in captions at the bottom. Transparent background, full frame, so it drops in at 0,0.
const LT = [
  ["mcp", "MCP 2025-11-25", "Streamable HTTP · 18 tools"],
  ["nova-sonic", "Nova 2.5 Sonic", "Alexa's voice · Amazon Bedrock"],
  ["agentcore", "AgentCore Runtime", "the Dayform MCP server"],
  ["nova-lite", "Nova 2 Lite on Bedrock", "judgment calls, checked by code"],
  ["aurora", "Aurora Serverless v2", "PostgreSQL + Data API"],
  ["eventbridge-lambda", "EventBridge Scheduler + Lambda", "the overnight job"],
  ["mcp-apps-card", "MCP Apps card 768×480", "rendered on the Echo Show"],
  ["add-to-cart", "Add-to-Cart link", "you check out on Amazon; Alexa never orders"],
];
const lower = (t: string, s: string) => `<style>${BASE}body{background:transparent}
.pill{position:absolute;left:60px;top:14px;height:56px;display:flex;align-items:center;gap:18px;padding:0 28px 0 20px;border-radius:28px;background:#090d15e6;border:2px solid #19d3ff99;box-shadow:0 0 30px #19d3ff33}
.dot{width:14px;height:14px;border-radius:7px;background:#19d3ff;box-shadow:0 0 12px #19d3ff}
.t{font-size:28px;font-weight:700}.s{font-size:24px;color:#c7d3e6}</style>
<div class="pill"><div class="dot"></div><div class="t">${t}</div><div class="s">${s}</div></div>`;

const jobs: [string, string, boolean][] = [
  ["title-card.png", title, false],
  ["architecture-slide.png", arch, false],
  ...LT.map(([f, t, s]) => [`lower-thirds/${f}.png`, lower(t, s), true] as [string, string, boolean]),
];

const proc = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9335", `--user-data-dir=${mkdtempSync(join(tmpdir(), "t51-"))}`,
  "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
try {
  let targets: any[] = [];
  for (let i = 0; i < 40 && !targets.length; i++) {
    await wait(250);
    targets = await fetch("http://127.0.0.1:9335/json").then((r) => r.json()).catch(() => []);
  }
  const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0;
  const pending = new Map<number, (v: any) => void>();
  ws.addEventListener("message", (e) => { const m = JSON.parse(String(e.data)); if (m.id) pending.get(m.id)?.(m); });
  const send = (method: string, params: object = {}) =>
    new Promise<any>((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  mkdirSync(`${OUT}lower-thirds`, { recursive: true });
  for (const [file, html, transparent] of jobs) {
    await send("Emulation.setDefaultBackgroundColorOverride", transparent ? { color: { r: 0, g: 0, b: 0, a: 0 } } : {});
    const frame = (await send("Page.getFrameTree")).result.frameTree.frame.id;
    await send("Page.setDocumentContent", { frameId: frame, html: `<!doctype html><meta charset="utf-8">${html}` });
    await wait(300);
    const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 1 } });
    writeFileSync(OUT + file, Buffer.from(shot.result.data, "base64"));
    console.log("wrote", file);
  }
  ws.close();
} finally {
  proc.kill();
}
