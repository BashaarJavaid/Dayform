// Headless check of the preview page (approach from smoke/mcp-apps/verify-browser.ts): Chrome over CDP.
// For every preview entry: screenshot both modes into screens/, check nothing leaves its frame, check entrance
// animations are done by 1.25 s, measure frame rate during the entrance, collect console errors (iframes included).
// Needs `npm run cards:preview` running. Usage: tsx scripts/screens.ts [--scale 1.5]
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.PREVIEW_URL ?? "http://localhost:5180/";
const scale = Number(process.argv[process.argv.indexOf("--scale") + 1] || 1) || 1;
const IDS = ["rings", "meal-logged", "workout", "workout-pr", "pr", "pr-both-kinds", "pr-none", "progress", "meal-prep", "meal-prep-preparing", "cart", "cart-checkout", "brief", "brief-server", "workout-server", "meal-logged-utc"];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const OUT = new URL("../screens/", import.meta.url).pathname;

// Runs in each document: elements outside their nearest [data-clip] box, and text cut by an ellipsis.
const CHECK = `(() => {
  const out = [];
  for (const card of document.querySelectorAll('.df-card')) {
    for (const el of card.querySelectorAll('*')) {
      if (el.closest('[data-deco],[aria-hidden="true"]') || el.hasAttribute('data-track')) continue;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      const c = el.parentElement.closest('[data-clip]').getBoundingClientRect();
      if (r.left < c.left - 0.5 || r.right > c.right + 0.5 || r.top < c.top - 0.5 || r.bottom > c.bottom + 0.5)
        out.push('outside: <' + el.tagName.toLowerCase() + '> "' + (el.textContent || '').trim().slice(0, 40) + '"');
      if (getComputedStyle(el).textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1)
        out.push('truncated: "' + (el.textContent || '').trim().slice(0, 50) + '"');
    }
  }
  // Longest entrance: delay + duration of every finite animation on the card (CSS animations and transitions).
  const ends = document.getAnimations().filter((a) => a.effect.getTiming().iterations !== Infinity).map((a) => a.effect.getComputedTiming().endTime);
  return { issues: out, maxEnd: Math.round(Math.max(0, ...ends)), cards: document.querySelectorAll('.df-card').length };
})()`;
// Records frame times from document start.
// Records frame times for the 1.2 s after the load event (the entrance window).
const FPS = `window.__frames = []; addEventListener('load', () => { const t0 = performance.now(); requestAnimationFrame(function f(t) { window.__frames.push(t); if (t - t0 < 1200) requestAnimationFrame(f); }); });`;

const proc = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9334", `--user-data-dir=${mkdtempSync(join(tmpdir(), "t32-"))}`,
  "--window-size=1700,1000", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
let failed = false;
try {
  let targets: any[] = [];
  for (let i = 0; i < 40 && !targets.length; i++) {
    await wait(250);
    targets = await fetch("http://127.0.0.1:9334/json").then((r) => r.json()).catch(() => []);
  }
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0;
  const pending = new Map<number, (v: any) => void>();
  const events: ((m: any) => void)[] = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(String(e.data));
    if (m.id) pending.get(m.id)?.(m);
    else events.forEach((h) => h(m));
  });
  const send = (method: string, params: object = {}, sessionId?: string) =>
    new Promise<any>((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) })); });
  const evalIn = async (expr: string, sessionId?: string) =>
    (await send("Runtime.evaluate", { expression: expr, returnByValue: true }, sessionId)).result?.result?.value;

  const errors: string[] = [];
  const sessions = new Set<string>();
  events.push((m) => {
    if (m.method === "Target.attachedToTarget") {
      sessions.add(m.params.sessionId);
      void send("Runtime.enable", {}, m.params.sessionId);
      void send("Runtime.runIfWaitingForDebugger", {}, m.params.sessionId);
    }
    if (m.method === "Target.detachedFromTarget") sessions.delete(m.params.sessionId);
    if (m.method === "Runtime.exceptionThrown") errors.push(`exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
    if (m.method === "Runtime.consoleAPICalled" && (m.params.type === "error" || m.params.type === "warning"))
      errors.push(`console.${m.params.type}: ${m.params.args.map((a: any) => a.value ?? a.description).join(" ")}`);
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error") errors.push(`log: ${m.params.entry.text}`);
  });

  mkdirSync(OUT, { recursive: true });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1700, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: FPS });

  const suffix = scale === 1 ? "" : `@${scale}x`;
  console.log(`scale ${scale} (${768 * scale}x${480 * scale})`);
  for (const entry of IDS) {
    const before = errors.length;
    const loaded = new Promise<void>((r) => { const h = (m: any) => { if (m.method === "Page.loadEventFired") { events.splice(events.indexOf(h), 1); r(); } }; events.push(h); });
    await send("Page.navigate", { url: `${BASE}?only=${entry}&scale=${scale}` });
    await loaded;
    await wait(600);
    const native = await evalIn(CHECK);
    const frames: number[] = await evalIn("window.__frames");
    let iframe: any = null;
    // The card iframe: an out-of-process frame (own CDP session) or an in-process child frame (isolated world).
    for (const s of sessions) { const v = await evalIn(CHECK, s).catch(() => null); if (v?.cards) iframe = v; }
    if (!iframe) {
      const tree = (await send("Page.getFrameTree")).result.frameTree;
      for (const child of tree.childFrames ?? []) {
        const world = await send("Page.createIsolatedWorld", { frameId: child.frame.id, worldName: "t32-check" });
        const v = (await send("Runtime.evaluate", { expression: CHECK, returnByValue: true, contextId: world.result.executionContextId })).result?.result?.value;
        if (v?.cards) iframe = v;
      }
    }
    await wait(1300);

    const boxes = await evalIn(`[...document.querySelectorAll('.frame')].map((f) => { const r = f.getBoundingClientRect(); return { mode: f.dataset.mode, x: r.x, y: r.y, w: r.width, h: r.height }; })`);
    for (const b of boxes) {
      const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: b.x, y: b.y, width: b.w, height: b.h, scale: 1 } });
      writeFileSync(`${OUT}${entry}${b.mode === "native" ? "-native" : ""}${suffix}.png`, Buffer.from(shot.result.data, "base64"));
    }
    const gaps = frames.slice(1).map((t, i) => t - frames[i]).filter((g) => g > 0);
    const fps = gaps.length ? 1000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0;
    const issues = [...(native?.issues ?? []).map((s: string) => `native ${s}`), ...(iframe?.issues ?? []).map((s: string) => `mcp ${s}`)];
    const errs = errors.slice(before);
    const sizes = boxes.map((b: any) => `${b.mode} ${b.w}x${b.h}`).join(", ");
    const ok = iframe?.cards === 1 && native?.cards === 1 && issues.length === 0 && errs.length === 0 && native.maxEnd <= 1200 && iframe.maxEnd <= 1200;
    if (!ok) failed = true;
    console.log(`${ok ? "PASS" : "FAIL"} ${entry.padEnd(14)} ${sizes} | rendered mcp=${iframe?.cards ?? 0} native=${native?.cards ?? 0} | entrance mcp=${iframe?.maxEnd} ms native=${native?.maxEnd} ms | ~${fps.toFixed(0)} fps, worst frame ${Math.max(0, ...gaps).toFixed(0)} ms`);
    for (const s of [...issues, ...errs]) console.log(`     ${s}`);
  }

  // Meal-prep: also capture the last carousel slide (batch cook) via its dot button.
  await send("Page.navigate", { url: `${BASE}?only=meal-prep&scale=${scale}` });
  await wait(1500);
  await evalIn(`(() => { const b = document.querySelectorAll('.frame[data-mode=native] button[aria-label^="Slide"]'); b[b.length - 1].click(); })()`);
  await wait(800);
  const b = (await evalIn(`(() => { const r = document.querySelector('.frame[data-mode=native]').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`));
  const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: b.x, y: b.y, width: b.w, height: b.h, scale: 1 } });
  writeFileSync(`${OUT}meal-prep-batch-native${suffix}.png`, Buffer.from(shot.result.data, "base64"));
  const batch = await evalIn(CHECK);
  console.log(`${batch.issues.length ? "FAIL" : "PASS"} meal-prep batch slide (native): ${batch.issues.join("; ") || "no overflow"}`);
  if (batch.issues.length) failed = true;
  // Card buttons in MCP Apps mode: click inside the sandboxed iframe, expect the host's onCallTool to log the call.
  for (const [entry, tool] of [["rings", "log_water"], ["meal-prep", "add_to_cart"], ["cart", "checkout_cart"]]) {
    await send("Page.navigate", { url: `${BASE}?only=${entry}&scale=${scale}` });
    await wait(1800);
    const tree = (await send("Page.getFrameTree")).result.frameTree;
    for (const child of tree.childFrames ?? []) {
      const world = await send("Page.createIsolatedWorld", { frameId: child.frame.id, worldName: "t32-click" });
      await send("Runtime.evaluate", { expression: `document.querySelector('button[data-tool="${tool}"]')?.click()`, contextId: world.result.executionContextId });
    }
    for (const sId of sessions) await evalIn(`document.querySelector('button[data-tool="${tool}"]')?.click()`, sId).catch(() => null);
    await wait(900);
    const logText: string = await evalIn(`document.getElementById("log").textContent`);
    const hit = logText.includes(`tools/call ${tool}`);
    let label = "";
    for (const child of tree.childFrames ?? []) {
      const world = await send("Page.createIsolatedWorld", { frameId: child.frame.id, worldName: "t32-read" });
      label = (await send("Runtime.evaluate", { expression: `document.querySelector('button[data-tool="${tool}"]')?.textContent ?? (document.querySelector('[aria-label^="QR"]') ? "QR shown" : "")`, returnByValue: true, contextId: world.result.executionContextId })).result?.result?.value ?? label;
    }
    if (!hit) failed = true;
    console.log(`${hit ? "PASS" : "FAIL"} mcp button ${entry} -> ${tool}: host log "${logText.trim().split("\n").pop()}", card now shows "${label}"`);
    if (entry === "cart") {
      const shot = await send("Page.captureScreenshot", { format: "png", clip: { ...(await evalIn(`(() => { const r = document.querySelector('.frame[data-mode=mcp]').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`)), scale: 1 } });
      writeFileSync(`${OUT}cart-after-checkout-click${suffix}.png`, Buffer.from(shot.result.data, "base64"));
    }
  }
  ws.close();
} finally {
  proc.kill();
}
process.exit(failed ? 1 : 0);
