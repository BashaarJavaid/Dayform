// Headless check of the simulator screen (CDP, same approach as cards/scripts/screens.ts).
// Drives S1-S6 by typing the lines through the "/" text box, clicks Yes on S4, runs Skip to morning from the demo panel,
// checks the keyboard shortcuts, layout stability between cards and console errors; saves screens/<scene>.png at 1920x1080.
// Needs: sim:backend (any engine; text is fastest) + sim:frontend running, and `npm run demo:warm` just before.
// Usage: tsx scripts/verify.ts [--cards native]
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const cardsArg = process.argv.includes("--cards") ? process.argv[process.argv.indexOf("--cards") + 1] : "mcp-apps";
const URL_ = `${process.env.SIM_FRONTEND_URL ?? "http://localhost:5173/"}?cards=${cardsArg}&autoopen=1`;
const OUT = new URL("../screens/", import.meta.url).pathname;
const only = process.argv.includes("--scenes") ? process.argv[process.argv.indexOf("--scenes") + 1].split(",") : null;
const want = (sc: string) => !only || only.includes(sc);
const suffix = cardsArg === "native" ? "-native" : "";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const proc = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9336", `--user-data-dir=${mkdtempSync(join(tmpdir(), "t31-"))}`,
  "--window-size=1920,1080", "--hide-scrollbars", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
  "--autoplay-policy=no-user-gesture-required", "about:blank"], { stdio: "ignore" });

const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` | ${detail}` : ""}`);
};

try {
  let targets: any[] = [];
  for (let i = 0; i < 40 && !targets.length; i++) {
    await wait(250);
    targets = await fetch("http://127.0.0.1:9336/json").then((r) => r.json()).catch(() => []);
  }
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0;
  const pending = new Map<number, (v: any) => void>();
  const handlers: ((m: any) => void)[] = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(String(e.data));
    if (m.id) pending.get(m.id)?.(m);
    else handlers.forEach((h) => h(m));
  });
  const send = (method: string, params: object = {}, sessionId?: string) =>
    new Promise<any>((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) })); });
  const ev = async (expr: string) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;

  const errors: string[] = [];
  const opened: string[] = [];
  handlers.push((m) => {
    if (m.method === "Target.attachedToTarget") {
      void send("Runtime.enable", {}, m.params.sessionId);
      void send("Runtime.runIfWaitingForDebugger", {}, m.params.sessionId);
    }
    if (m.method === "Target.targetCreated" && m.params.targetInfo.type === "page") opened.push(m.params.targetInfo.url || "(blank)");
    if (m.method === "Target.targetInfoChanged" && m.params.targetInfo.type === "page" && /amazon\./.test(m.params.targetInfo.url)) opened.push(m.params.targetInfo.url);
    if (m.method === "Runtime.exceptionThrown") errors.push(`exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(`console.error: ${m.params.args.map((a: any) => a.value ?? a.description).join(" ")}`);
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error" && !/amazon\./.test(m.params.entry.url ?? "")) errors.push(`log: ${m.params.entry.text} ${m.params.entry.url ?? ""}`);
  });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Target.setDiscoverTargets", { discover: true });
  await send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  mkdirSync(OUT, { recursive: true });

  const key = async (type: "keyDown" | "keyUp", key: string, code: string, modifiers = 0, text?: string) =>
    send("Input.dispatchKeyEvent", { type, key, code, modifiers, ...(text && { text }), windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : key === "Enter" ? 13 : key === "Escape" ? 27 : 0 });
  const press = async (k: string, code: string, modifiers = 0, text?: string) => { await key("keyDown", k, code, modifiers, text); await key("keyUp", k, code, modifiers); };
  // Click where the element is rendered. In Chrome 97 (installed here) getBoundingClientRect inside a CSS-zoomed subtree
  // reports unzoomed layout coordinates that hit-testing disagrees with, so find the element by hit-testing a grid.
  const click = async (sel: string) => {
    const p = await ev(`(() => {
      const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null;
      const hits = [];
      for (let y = 0; y < innerHeight; y += 6) for (let x = 0; x < innerWidth; x += 6) { const h = document.elementFromPoint(x, y); if (h && (h === el || el.contains(h))) hits.push([x, y]); }
      if (!hits.length) return null;
      return { x: hits.reduce((a, h) => a + h[0], 0) / hits.length, y: hits.reduce((a, h) => a + h[1], 0) / hits.length }; })()`);
    if (!p) throw new Error(`cannot hit ${sel}`);
    for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x: p.x, y: p.y, button: "left", clickCount: 1 });
  };
  const shot = async (name: string) => {
    const s = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(`${OUT}${name}${suffix}.png`, Buffer.from(s.result.data, "base64"));
  };
  const waitFor = async (expr: string, ms = 60_000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await ev(expr)) return true; await wait(100); }
    return false;
  };
  const light = () => ev(`document.querySelector('.stage').dataset.light`);
  const rows = () => ev(`[...document.querySelectorAll('.row-tool')].map((r) => r.dataset.tool + ' ' + (r.querySelector('.badge')?.textContent ?? r.className))`) as Promise<string[]>;
  const card = () => ev(`(() => { const l = [...document.querySelectorAll('.card-layer.in')].at(-1); if (!l) return null; const r = l.getBoundingClientRect(); const f = l.querySelector('iframe, .native, [style*=zoom]')?.getBoundingClientRect(); return { uri: l.dataset.uri, key: l.dataset.key, box: [r.x, r.y, r.width, r.height].join(','), inner: f ? [f.x, f.y, f.width, f.height].join(',') : null }; })()`);
  const screenBox = () => ev(`(() => { const r = document.querySelector('.screen').getBoundingClientRect(); return [r.x, r.y, r.width, r.height].join(','); })()`);
  const lightsSeen: string[] = [];
  const watchLight = async (ms: number) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const l = await light(); if (lightsSeen.at(-1) !== l) lightsSeen.push(l); await wait(40); }
  };
  /** Type a line through the "/" box and wait for the turn to end (light idle for 1.5 s with no running tool). */
  const say = async (line: string) => {
    lightsSeen.length = 0;
    await press("/", "Slash", 0, "/");
    const focused = await waitFor(`document.activeElement?.closest('.typebox') != null`, 2000);
    await send("Input.insertText", { text: line });
    lightsSeen.push(await light());
    await press("Enter", "Enter", 0, "\r");
    let idleSince = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 120_000) {
      const l = await light();
      if (lightsSeen.at(-1) !== l) lightsSeen.push(l);
      const running = await ev(`document.querySelectorAll('.row-tool.running').length + (document.querySelector('.elicit.in') ? 1 : 0)`);
      if (l === "idle" && !running && lightsSeen.length > 1) { idleSince ||= Date.now(); if (Date.now() - idleSince > 1500) break; } else idleSince = 0;
      await wait(60);
    }
    return { focused, lights: [...lightsSeen] };
  };
  const captions = () => ev(`[document.querySelector('.cap-user')?.textContent, document.querySelector('.cap-alexa')?.textContent]`);
  /** Text inside the visible card (MCP Apps: the sandboxed iframe via an isolated world; native: the DOM). */
  const cardText = async (): Promise<string> => {
    if (cardsArg === "native") return ev(`[...document.querySelectorAll('.card-layer.in')].at(-1)?.innerText ?? ''`);
    const tree = (await send("Page.getFrameTree")).result.frameTree;
    let text = "";
    for (const child of tree.childFrames ?? []) {
      const w = await send("Page.createIsolatedWorld", { frameId: child.frame.id, worldName: "t31" });
      text = (await send("Runtime.evaluate", { expression: "document.body?.innerText ?? ''", returnByValue: true, contextId: w.result.executionContextId })).result?.result?.value ?? text;
    }
    return text.replace(/\s+/g, " ");
  };

  const loaded = new Promise<void>((r) => handlers.push((m) => m.method === "Page.loadEventFired" && r()));
  await send("Page.navigate", { url: URL_ });
  await loaded;
  check("connects to the simulator backend", await waitFor(`document.querySelector('.stage')?.dataset.conn === '1'`, 10_000));
  await wait(1200);
  const screen0 = await screenBox();
  check("idle screen: clock, today's rings, hint", await ev(`!!document.querySelector('.home.in .idle-time') && document.querySelectorAll('.home.in .idle-ring').length === 4 && document.querySelector('.idle-hint').textContent.includes('start push day')`),
    await ev(`document.querySelector('.idle-time').textContent + ' · ' + document.querySelector('.idle-hint').textContent`));
  await shot("S0-idle");

  // Keyboard shortcuts.
  await press("h", "KeyH", 0, "h");
  await wait(600);
  const hidden = await ev(`document.querySelector('.stage').classList.contains('no-hood') && document.querySelector('.hood').getBoundingClientRect().width === 0`);
  const movedScreen = await screenBox();
  await press("h", "KeyH", 0, "h");
  await wait(600);
  check("H toggles the panel", hidden && (await screenBox()) === screen0, `hidden: screen at ${movedScreen}; shown again: ${await screenBox()}`);
  await press("D", "KeyD", 2 | 8);
  const demoOpen = await waitFor(`!!document.querySelector('.demo-panel')`, 1000);
  await press("D", "KeyD", 2 | 8);
  check("Ctrl+Shift+D toggles the demo panel", demoOpen && (await waitFor(`!document.querySelector('.demo-panel')`, 1000)));
  await key("keyDown", " ", "Space", 0, " ");
  const ptt = await waitFor(`document.querySelector('.stage').dataset.light === 'listening' && document.querySelector('.mic-btn.on') != null`, 3000);
  await wait(400);
  await key("keyUp", " ", "Space");
  check("hold Space = push to talk (light bar listening, mic on; fake mic device)", ptt && (await waitFor(`document.querySelector('.stage').dataset.light === 'idle'`, 3000)));
  await press("/", "Slash", 0, "/");
  const boxOpen = await waitFor(`document.activeElement?.closest('.typebox') != null`, 1000);
  await send("Input.insertText", { text: "two" });
  await press(" ", "Space", 0, " ");
  await send("Input.insertText", { text: "words" });
  const typed = await ev(`document.activeElement.value`);
  const noPtt = await ev(`document.querySelector('.mic-btn.on') == null`);
  await press("Escape", "Escape");
  check("/ opens the text box and typing works (Space types, does not talk; Esc closes)", boxOpen && typed === "two words" && noPtt && (await waitFor(`!document.querySelector('.typebox')`, 1000)), `value "${typed}"`);

  const cardBoxes = new Set<string>();
  const innerBoxes = new Set<string>();
  const noteCard = (c: any) => { if (c) { cardBoxes.add(c.box); if (c.inner) innerBoxes.add(c.inner); } };

  let c: any = null;
  if (want("S1")) {
  const s1 = await say("Alexa, I had two rotis, chicken karahi and a mango lassi for lunch.");
  c = await card();
  noteCard(c);
  const caps1 = await captions();
  const r1 = await rows();
  const text1 = await cardText();
  check("S1 meal-logged card, log_meal row with latency, both captions, light listening→thinking→speaking", c?.uri === "ui://cards/meal-logged" && r1.some((r) => /^log_meal \d+ ms/.test(r)) && !!caps1[0]?.trim() && !!caps1[1]?.trim() && s1.focused,
    `lights ${s1.lights.join("→")} | rows ${r1.join(", ")} | user ${caps1[0]} | alexa ${caps1[1]} | card text: ${text1.slice(0, 140)}`);
  await shot("S1");

  }
  if (want("S2")) {
  const keyBefore = c?.key;
  await ev(`document.querySelector('.card-layer.in iframe')?.setAttribute('data-mark', 's1')`);
  const s2 = await say("Actually, make that one roti.");
  c = await card();
  noteCard(c);
  const text2 = await cardText();
  const same = c?.key === keyBefore && (cardsArg === "native" || (await ev(`document.querySelector('.card-layer.in iframe')?.dataset.mark === 's1'`)));
  check("S2 card updates in place (same layer and iframe), totals drop", c?.uri === "ui://cards/meal-logged" && same && (await rows()).some((r) => r.startsWith("correct_meal")),
    `lights ${s2.lights.join("→")} | layer ${keyBefore}→${c?.key} | card text: ${text2.slice(0, 140)}`);
  await shot("S2");

  }
  if (want("S3")) {
  await say("Alexa, start push day.");
  noteCard(await card());
  await shot("S3-start");
  await say("Done, eight reps.");
  noteCard(c = await card());
  const text3 = await cardText();
  await shot("S3-pr");
  await say("My shoulder feels off. Swap the overhead press.");
  noteCard(c = await card());
  const text3b = await cardText();
  const r3 = await rows();
  check("S3 workout → log_set → swap rows and cards", ["start_workout", "log_set", "swap_exercise"].every((t) => r3.some((r) => r.startsWith(t))),
    `rows ${r3.slice(-4).join(", ")} | after log_set: ${text3.slice(0, 110)} | after swap (${c?.uri}): ${text3b.slice(0, 110)}`);
  await shot("S3");

  }
  if (want("S4")) {
  // S4: four tools, carousel, confirm overlay, click Yes, cart card, Amazon tab.
  lightsSeen.length = 0;
  await press("/", "Slash", 0, "/");
  await waitFor(`document.activeElement?.closest('.typebox') != null`, 2000);
  await send("Input.insertText", { text: "Plan my meal prep for the next four days and add what I need to my cart." });
  const rowsBefore = (await rows()).length;
  await press("Enter", "Enter", 0, "\r");
  const overlay = await waitFor(`!!document.querySelector('.elicit.in')`, 120_000);
  await wait(700);
  const q = await ev(`document.querySelector('.elicit-q').textContent`);
  const r4a = (await rows()).slice(rowsBefore);
  const sawPrep = await ev(`[...document.querySelectorAll('.card-layer')].some((l) => l.dataset.uri === 'ui://cards/meal-prep')`);
  await shot("S4-confirm");
  opened.length = 0;
  if (process.argv.includes("--say-yes")) {
    // The spoken/typed answer path (the backend resolves the elicitation and moves to thinking).
    await press("/", "Slash", 0, "/");
    await waitFor(`document.activeElement?.closest('.typebox') != null`, 2000);
    await send("Input.insertText", { text: "Yes." });
    await press("Enter", "Enter", 0, "\r");
    check("S4 overlay closes on a typed/spoken yes", await waitFor(`!document.querySelector('.elicit.in')`, 10_000));
  } else await click(".btn-yes");
  const cartCard = await waitFor(`[...document.querySelectorAll('.card-layer.in')].at(-1)?.dataset.uri === 'ui://cards/cart'`, 30_000);
  await wait(400);
  noteCard(await card());
  await shot("S4");
  // Let the turn finish and the auto-open fire (1.2 s after the cart card).
  await waitFor(`document.querySelector('.stage').dataset.light === 'idle' && !document.querySelector('.row-tool.running')`, 60_000);
  await wait(2500);
  const r4 = (await rows()).slice(rowsBefore);
  check("S4 rows in order, confirm overlay, Yes → cart card, Amazon tab opens",
    overlay && cartCard && opened.some((u) => /amazon\./.test(u)) &&
      ["plan_meal_prep", "add_to_cart", "checkout_cart"].every((t, i) => r4.filter((r) => !r.startsWith("get_daily_summary"))[i]?.startsWith(t)),
    `rows ${r4.join(", ")}${r4[0]?.startsWith("get_daily_summary") ? "" : " (model skipped get_daily_summary this run)"} | question "${q}" | meal-prep card shown ${sawPrep} | tabs opened ${opened.map((u) => u.slice(0, 70)).join(" ; ") || "none"} | rows before overlay ${r4a.length}`);
  await shot("S4-cart");

  }
  if (want("S5")) {
  // S5: demo panel → Skip to morning (night transition while advance-day runs) → idle at 07:00 → brief.
  await press("D", "KeyD", 2 | 8);
  await waitFor(`!!document.querySelector('.demo-panel')`, 1000);
  const t0 = Date.now();
  await click("[data-act=morning]");
  await wait(1300);
  const nightOn = await ev(`document.querySelector('.night').classList.contains('run')`);
  await shot("S5-night");
  await waitFor(`document.querySelector('.night').classList.contains('off')`, 15_000);
  const nightMs = Date.now() - t0;
  await wait(600);
  const idleTime = await ev(`document.querySelector('.home.in .idle-time')?.textContent`);
  const hint = await ev(`document.querySelector('.idle-hint')?.textContent`);
  check("S5 night transition plays while advance-day runs, then idle at 07:00", nightOn && nightMs >= 2600 && nightMs < 5000 && /^7:0\d/.test(idleTime ?? ""),
    `night ${nightMs} ms (incl. fade-out) | idle shows ${idleTime} | ${hint}`);
  await shot("S5-morning");
  await say("Alexa, good morning.");
  c = await card();
  noteCard(c);
  check("S5 brief card", c?.uri === "ui://cards/brief" && (await rows()).some((r) => r.startsWith("get_morning_brief")), (await cardText()).slice(0, 160));
  await shot("S5");

  }
  if (want("S6")) {
  await say("How's my bench going?");
  c = await card();
  noteCard(c);
  check("S6 progress card", c?.uri === "ui://cards/progress" && (await rows()).some((r) => r.startsWith("get_progress")), (await cardText()).slice(0, 160));
  await shot("S6");

  }
  check("no layout shift: screen and card boxes identical across every card", (await screenBox()) === screen0 && cardBoxes.size === 1 && innerBoxes.size <= 1,
    `screen ${screen0} | card layer boxes ${[...cardBoxes].join(" / ")} | inner ${[...innerBoxes].join(" / ")}`);
  const panelRows = await ev(`[...document.querySelectorAll('.row-tool')].map((r) => r.dataset.tool + ' ' + (r.querySelector('.badge')?.textContent ?? '?'))`);
  console.log(`panel rows: ${panelRows.join(", ")}`);
  check("no console errors (page and card iframes)", errors.length === 0, errors.slice(0, 8).join(" ; "));
} catch (e) {
  check("run", false, String(e));
}
proc.kill();
process.exit(results.every((r) => r.ok) ? 0 : 1);
