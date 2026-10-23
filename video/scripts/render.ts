// Renders the video stills to 1920x1080 PNGs with headless Chrome over CDP (approach from cards/scripts/screens.ts).
// Title card and architecture slide in two variants (A light, New York + SF Pro Text; B flat dark, Helvetica Neue),
// plus the lower thirds (transparent). Usage: npx tsx video/scripts/render.ts
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = new URL("../assets/", import.meta.url).pathname;
const S1 = new URL("../../simulator/frontend/screens/S1.png", import.meta.url).href;
const TMP = mkdtempSync(join(tmpdir(), "t51-"));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// System font files (not exposed to Chrome by family name), loaded with --allow-file-access-from-files.
const FACES = `@font-face{font-family:"NY";src:url(file:///System/Library/Fonts/NewYork.ttf)}
@font-face{font-family:"SFText";src:url(file:///System/Library/Fonts/SFNS.ttf)}
@font-face{font-family:"SFMono";src:url(file:///System/Library/Fonts/SFNSMono.ttf)}`;
const ACCENT = "#31C3F0";

type Theme = { bg: string; fg: string; muted: string; line: string; box: string; grid: string; head: string; body: string };
const A: Theme = { bg: "#F4F5F7", fg: "#111111", muted: "#5B616B", line: "#2B2F36", box: "#FFFFFF", grid: "#EDEFF2", head: `'NY',Georgia,serif`, body: `'SFText',Helvetica,sans-serif` };
const B: Theme = { bg: "#0B0F14", fg: "#EEF1F5", muted: "#8B95A3", line: "#AAB3BF", box: "#0B0F14", grid: "#0E141B", head: `'Helvetica Neue',Helvetica,sans-serif`, body: `'Helvetica Neue',Helvetica,sans-serif` };
const MONO = `"SFMono",Menlo,monospace`;

// 12-column grid: 144 px side margins, 24 px gutters -> 114 px columns, 138 px step.
const M = 144, STEP = 138;
const colX = (c: number) => M + (c - 1) * STEP;
const span = (n: number) => n * STEP - 24;
const grid = (t: Theme) => Array.from({ length: 12 }, (_, i) =>
  `<div style="position:absolute;left:${colX(i + 1)}px;top:0;width:${span(1)}px;height:1080px;background:${t.grid}"></div>`).join("");
const page = (t: Theme, body: string) => `<!doctype html><meta charset="utf-8"><style>${FACES}
*{box-sizing:border-box;margin:0}html,body{width:1920px;height:1080px;overflow:hidden;background:${t.bg};color:${t.fg};font-family:${t.body}}
.abs{position:absolute}.mono{font-family:${MONO}}</style>${grid(t)}${body}`;

// The Echo Show frame from S1.png (bezel at 58..1262 x 77..849), scaled to width w; the clip follows the bezel.
const device = (x: number, y: number, w: number) => {
  const s = w / 1204;
  return `<div class="abs" style="left:${x}px;top:${y}px;width:${w}px;height:${Math.round(772 * s)}px;overflow:hidden;clip-path:inset(0 round ${Math.round(46 * s)}px)">
<img src="${S1}" style="position:absolute;left:${-58 * s}px;top:${-77 * s}px;width:${1920 * s}px"></div>`;
};

const title = (t: Theme) => page(t, `
<div class="abs" style="left:${colX(1)}px;top:336px;width:96px;height:6px;background:${ACCENT}"></div>
<div class="abs" style="left:${colX(1)}px;top:372px;font-family:${t.head};font-size:${t === A ? 168 : 148}px;font-weight:${t === A ? 500 : 700};letter-spacing:-3px;line-height:1">Dayform</div>
<div class="abs" style="left:${colX(1)}px;top:590px;width:${span(5)}px;font-size:${t === A ? 46 : 40}px;line-height:1.25;font-weight:400;white-space:nowrap">Every fitness app makes you type.<br>This one, you just talk to.</div>
<div class="abs" style="left:${colX(1)}px;top:740px;font-size:26px;color:${t.muted}">An Alexa+ add-on</div>
<div class="abs mono" style="left:${colX(1)}px;top:984px;font-size:20px;color:${t.muted};letter-spacing:.5px">MCP 2025-11-25 · AgentCore Runtime · Nova 2.5 Sonic</div>
${device(colX(6), 230, span(7))}`);

// Architecture: tier 1 laptop row, tier 2 AWS region; orthogonal 2 px connectors.
type Box = { c: number; n: number; y: number; h: number; t: string; s: string; thumb?: boolean };
const arch = (t: Theme) => {
  const box = (b: Box) => `<div class="abs" style="left:${colX(b.c)}px;top:${b.y}px;width:${span(b.n)}px;height:${b.h}px;background:${t.box};border:1px solid ${t.fg};padding:22px 24px">
<div style="font-size:28px;font-weight:600;line-height:1.15">${b.t}</div><div style="font-size:20px;color:${t.muted};margin-top:10px;line-height:1.4">${b.s}</div>
${b.thumb ? device(span(b.n) - 250, 17, 224).replace('class="abs"', 'class="abs" data-thumb') : ""}</div>`;
  const lbl = (x: number, y: number, s: string, color = t.fg) => `<div class="abs mono" style="left:${x}px;top:${y}px;font-size:17px;line-height:1.35;color:${color}">${s}</div>`;
  const p = (d: string, color = t.line, both = false) =>
    `<path d="${d}" stroke="${color}" stroke-width="2" fill="none" marker-end="url(#a${color === ACCENT ? "x" : ""})"${both ? ` marker-start="url(#a)"` : ""}/>`;
  const mk = (id: string, c: string) => `<marker id="${id}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${c}"/></marker>`;
  // Columns: 1 x144, 4 x558, 5 x696, 7 ends 1086, 10 x1386, 12 ends 1776.
  return page(t, `
<div class="abs" style="left:${colX(1)}px;top:64px;font-family:${t.head};font-size:56px;font-weight:${t === A ? 500 : 700};letter-spacing:-.5px">How Dayform works</div>
<div class="abs" style="left:120px;top:470px;width:1680px;height:484px;border:1px solid ${t.muted}"></div>
${lbl(140, 484, "AWS us-east-1", t.muted)}
${lbl(colX(1), 170, "LAPTOP", t.muted)}
${box({ c: 1, n: 2, y: 225, h: 130, t: "Your voice", s: "or typed text" })}
${box({ c: 4, n: 5, y: 200, h: 180, t: "Echo Show simulator", s: "web app on the laptop<br>React frontend + backend", thumb: true })}
${box({ c: 10, n: 3, y: 225, h: 130, t: "amazon.com cart", s: "you check out; Alexa never orders" })}
${box({ c: 1, n: 3, y: 560, h: 170, t: "Amazon Bedrock", s: "Nova 2.5 Sonic: voice<br>Nova 2 Lite: judgment" })}
${box({ c: 5, n: 3, y: 560, h: 170, t: "AgentCore Runtime", s: "Dayform MCP server<br>18 tools" })}
${box({ c: 10, n: 3, y: 560, h: 170, t: "Aurora Serverless v2", s: "PostgreSQL, Data API" })}
${box({ c: 10, n: 3, y: 780, h: 150, t: "EventBridge Scheduler + Lambda", s: "overnight job" })}
<svg class="abs" style="left:0;top:0" width="1920" height="1080"><defs>${mk("a", t.line)}${mk("ax", ACCENT)}</defs>
${p("M396 290H557")}
${p("M557 340H470V559", t.line, true)}
${p("M740 381V559", ACCENT)}
${p("M1060 559V381")}
${p("M695 645H535")}
${p("M1087 645H1385")}
${p("M1087 600H1250V290H1385")}
${p("M1581 779V731")}
${p("M1385 850H339V731")}
</svg>
${lbl(484, 400, "bidirectional<br>audio")}
${lbl(756, 420, "MCP 2025-11-25<br>Streamable HTTP", t.fg)}
${lbl(1074, 420, "ui:// cards")}
${lbl(560, 612, "judgment")}
${lbl(1102, 652, "Data API")}
${lbl(1264, 380, "Add-to-Cart<br>link")}
${lbl(820, 862, "nightly: check-in and brief (Nova 2 Lite)")}
<div class="abs" style="left:${colX(1)}px;top:990px;font-size:24px;color:${t.muted}">Code does the arithmetic, storage and checks; every number in the brief is checked against the database.</div>`);
};

// Lower thirds: a flat rectangle in the empty band above the Echo Show frame (top left), clear of the captions.
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
const lower = (t: string, s: string) => `<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box;margin:0}
html,body{width:1920px;height:1080px;overflow:hidden;background:transparent;font-family:"Helvetica Neue",Helvetica,sans-serif}</style>
<div style="position:absolute;left:60px;top:12px;height:58px;display:flex;align-items:center;gap:16px;padding:0 24px 0 0;background:#0B0F14;border:1px solid #2A323D">
<div style="width:6px;align-self:stretch;background:${ACCENT}"></div>
<div style="font-size:26px;font-weight:700;color:#EEF1F5">${t}</div><div style="font-size:22px;color:#AAB3BF">${s}</div></div>`;

const jobs: [string, string, boolean][] = [
  ["title-card-A.png", title(A), false],
  ["title-card-B.png", title(B), false],
  ["architecture-slide-A.png", arch(A), false],
  ["architecture-slide-B.png", arch(B), false],
  ...LT.map(([f, t, s]) => [`lower-thirds/${f}.png`, lower(t, s), true] as [string, string, boolean]),
];

const proc = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9335", `--user-data-dir=${join(TMP, "chrome")}`,
  "--allow-file-access-from-files", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
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
  const evaluate = async (expression: string) =>
    (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
  await send("Page.enable");
  await send("DOM.enable");
  await send("CSS.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  mkdirSync(`${OUT}lower-thirds`, { recursive: true });
  for (const [file, html, transparent] of jobs) {
    await send("Emulation.setDefaultBackgroundColorOverride", transparent ? { color: { r: 0, g: 0, b: 0, a: 0 } } : {});
    const src = join(TMP, file.replace("/", "-").replace(".png", ".html"));
    writeFileSync(src, html);
    await send("Page.navigate", { url: `file://${src}` });
    await evaluate("document.fonts.ready.then(() => Promise.all([...document.images].map((i) => i.decode()))).then(() => true)");
    await wait(200);
    // Report the fonts Chrome actually drew with, to check the typography rules.
    const doc = (await send("DOM.getDocument", { depth: -1 })).result.root;
    const used = new Set<string>();
    const walk = async (n: any) => {
      if (n.nodeName === "DIV") for (const f of (await send("CSS.getPlatformFontsForNode", { nodeId: n.nodeId })).result?.fonts ?? []) used.add(f.familyName);
      for (const c of n.children ?? []) await walk(c);
    };
    await walk(doc);
    const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 1 } });
    writeFileSync(OUT + file, Buffer.from(shot.result.data, "base64"));
    console.log("wrote", file, "| fonts:", [...used].join(", "));
  }
  ws.close();
} finally {
  proc.kill();
}
