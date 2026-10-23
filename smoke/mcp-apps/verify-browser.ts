// Headless check: opens the host page in Chrome via CDP, screenshots the card,
// clicks "Add 250 ml water" inside the sandboxed iframe, screenshots again.
// Needs `npm run smoke:apps` running. Writes shots/*.png.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL_ = process.env.HOST_URL ?? "http://localhost:8106/";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const proc = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9333", `--user-data-dir=${mkdtempSync(join(tmpdir(), "t06-"))}`,
  "--window-size=900,800", "about:blank"], { stdio: "ignore" });
try {
  let targets: any[] = [];
  for (let i = 0; i < 40 && !targets.length; i++) {
    await wait(250);
    targets = await fetch("http://127.0.0.1:9333/json").then((r) => r.json()).catch(() => []);
  }
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0; const pending = new Map<number, (v: any) => void>();
  ws.addEventListener("message", (e) => { const m = JSON.parse(String(e.data)); pending.get(m.id)?.(m); });
  const send = (method: string, params: object = {}) =>
    new Promise<any>((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  const evalJs = async (expr: string) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true })).result?.result?.value;
  const shot = async (name: string) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(`shots/${name}.png`, Buffer.from(r.result.data, "base64"));
  };

  mkdirSync("shots", { recursive: true });
  await send("Page.enable"); await send("Runtime.enable");
  await send("Page.navigate", { url: URL_ });
  await wait(3000);
  const box = await evalJs(`(() => { const r = document.getElementById("card").getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; })()`);
  console.log("iframe box:", JSON.stringify(box));
  await shot("1-rendered");
  // "Add 250 ml water" button centre, measured from shot 1 (card-relative ~128,332).
  const x = box.x + 128, y = box.y + 332;
  for (const type of ["mousePressed", "mouseReleased"])
    await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
  await wait(1500);
  await shot("2-after-water-click");
  console.log("host log:\n" + (await evalJs(`document.getElementById("log").textContent`)));
  ws.close();
} finally {
  proc.kill();
}
