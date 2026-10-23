// T-31: the Echo Show screen the camera watches. Layout at 1920x1080: device (768x480 screen at 1.5x) + captions,
// "Under the hood" panel 600 px on the right. Keys: hold Space = push to talk, / = type a line, H = panel,
// Ctrl+Shift+D = demo panel, Esc = home screen.
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { ClientEvent, ServerEvent } from "@dayform/contracts";
import { DWELL_MS, initial, reduce, top, type LightState } from "./store.ts";
import { CardLayer, ElicitOverlay, Idle, LightBar, Night, useClock } from "./Screen.tsx";
import { DemoPanel, UnderTheHood, type Health } from "./Panel.tsx";
import { Mic, Speaker } from "./audio.ts";
import { AUTO_OPEN_CART, CARDS_MODE, SIM_HTTP, SIM_WS, store } from "./config.ts";

const speaker = new Speaker();
const mic = new Mic();
const level = () => speaker.level();
const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");

function targetLabel(mcp: string | undefined) {
  if (!mcp) return "…";
  if (/agentcore|amazonaws/.test(mcp)) return "AgentCore";
  if (/:8100\b/.test(mcp)) return "Mock server";
  return "Local server";
}

export function App() {
  const [s, dispatch] = useReducer(reduce, initial);
  const ws = useRef<WebSocket | null>(null);
  const [hood, setHood] = useState(true);
  const [demo, setDemo] = useState(false);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const [talk, setTalk] = useState<"off" | "ptt" | "wake">("off");
  const [night, setNight] = useState<"off" | "run" | "out">("off");
  const [cardsMode, setCardsMode] = useState<"mcp-apps" | "native">(CARDS_MODE);
  const [autoOpen, setAutoOpen] = useState(AUTO_OPEN_CART);
  const [health, setHealth] = useState<Health | null>(null);
  const [status, setStatus] = useState<Record<string, any> | null>(null);
  const [clockBase, setClockBase] = useState<{ ms: number; at: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [stage, setStage] = useState(1);
  const clock = useClock(clockBase);

  const send = useCallback((ev: ClientEvent) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(ev));
  }, []);

  // WebSocket with reconnect.
  useEffect(() => {
    let closed = false, timer = 0;
    const open = () => {
      const w = new WebSocket(SIM_WS);
      ws.current = w;
      w.onopen = () => dispatch({ type: "conn", on: true });
      w.onclose = () => {
        dispatch({ type: "conn", on: false });
        if (!closed) timer = window.setTimeout(open, 1000);
      };
      w.onmessage = (m) => {
        const ev = JSON.parse(String(m.data)) as ServerEvent;
        if (ev.type === "audio_out") return speaker.play(ev.data);
        dispatch({ type: "ev", ev });
      };
    };
    open();
    return () => {
      closed = true;
      clearTimeout(timer);
      ws.current?.close();
    };
  }, []);

  // Backend health (engine, MCP target) and the demo clock.
  const refreshStatus = useCallback(async () => {
    try {
      setHealth(await (await fetch(`${SIM_HTTP}/health`)).json());
      const st = await (await fetch(`${SIM_HTTP}/admin/status`)).json();
      if (st?.clock) {
        setStatus(st);
        setClockBase({ ms: Date.parse(st.clock), at: Date.now() });
      }
    } catch {}
  }, []);
  useEffect(() => {
    void refreshStatus();
    const t = setInterval(refreshStatus, 30_000);
    return () => clearInterval(t);
  }, [refreshStatus, s.conn]);

  // Drop faded-out card layers.
  useEffect(() => {
    if (!s.layers.some((l) => l.leaving)) return;
    const t = setTimeout(() => dispatch({ type: "gc" }), 500);
    return () => clearTimeout(t);
  }, [s.layers]);

  // A held-back card shows once the current card's minimum time is up.
  useEffect(() => {
    if (!s.queued) return;
    const t0 = top(s);
    const left = t0 ? t0.at + (DWELL_MS[t0.uri] ?? 0) - Date.now() : 0;
    const t = setTimeout(() => dispatch({ type: "flush" }), Math.max(0, left));
    return () => clearTimeout(t);
  }, [s.queued]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fit the 1920x1080 stage into smaller windows (no effect at 1920x1080).
  useEffect(() => {
    const fit = () => setStage(Math.min(1, window.innerWidth / 1920, window.innerHeight / 1080));
    fit();
    addEventListener("resize", fit);
    return () => removeEventListener("resize", fit);
  }, []);

  // Cart hand-off: open the Amazon link in a new tab.
  const openLink = useCallback((url: string) => {
    const w = window.open(url, "_blank");
    if (w) w.opener = null;
    else dispatch({ type: "note", text: "Pop-up blocked: allow pop-ups for this page, or click “Open Amazon cart”.", error: true });
  }, []);
  const answeredYesAt = useRef(0);
  const opened = useRef(0);
  useEffect(() => {
    const c = s.lastCart;
    if (!autoOpen || !c?.confirmed || opened.current === c.seq) return;
    opened.current = c.seq;
    // Let the cart card land first; stay inside Chrome's 5 s user-activation window after the Yes click.
    const wait = Date.now() - answeredYesAt.current < 4000 ? 1200 : 1500;
    const t = setTimeout(() => openLink(c.url), wait);
    return () => clearTimeout(t);
  }, [s.lastCart, autoOpen, openLink]);

  // Microphone: push to talk (Space / mic button) or the Alexa wake button (ends after a pause).
  const talkRef = useRef(talk);
  talkRef.current = talk;
  const vad = useRef({ heard: 0, quietSince: 0, started: 0 });
  useEffect(() => {
    mic.onFrame = (b64, rms) => {
      const mode = talkRef.current;
      if (mode === "off") return;
      send({ type: "audio_in", data: b64 });
      if (mode !== "wake") return;
      const now = performance.now(), v = vad.current;
      if (rms > 0.02) { v.heard = now; v.quietSince = 0; } else if (!v.quietSince) v.quietSince = now;
      const ended = v.heard && v.quietSince && now - v.quietSince > 1200;
      if (ended || now - v.started > (v.heard ? 12000 : 5000)) setTalk("off");
    };
  }, [send]);
  const startTalk = useCallback(async (mode: "ptt" | "wake") => {
    speaker.unlock();
    speaker.stop(); // barge-in
    vad.current = { heard: 0, quietSince: 0, started: performance.now() };
    setTalk(mode);
    try {
      await mic.start();
    } catch (e) {
      setTalk("off");
      dispatch({ type: "note", text: `Microphone unavailable: ${(e as Error).message}. Press / to type.`, error: true });
    }
  }, []);
  const stopTalk = useCallback(() => setTalk("off"), []);

  const sendText = useCallback(() => {
    const t = text.trim();
    if (t) {
      speaker.stop();
      send({ type: "text_input", text: t });
      dispatch({ type: "ev", ev: { type: "state", state: "thinking" } }); // no dark gap before the backend's first state
    }
    setText("");
    setTyping(false);
  }, [text, send]);

  const answer = useCallback((yes: boolean) => {
    const e = s.elicit;
    if (!e) return;
    speaker.stop();
    if (yes) answeredYesAt.current = Date.now();
    const content: Record<string, unknown> = {};
    for (const [k, v] of Object.entries((e.schema.properties ?? {}) as Record<string, any>)) if (v?.type === "boolean") content[k] = true;
    send(yes ? { type: "elicitation_response", id: e.id, action: "accept", content } : { type: "elicitation_response", id: e.id, action: "decline" });
    dispatch({ type: "elicit-done" });
  }, [s.elicit, send]);

  const admin = useCallback(async (path: string, body?: unknown) => {
    const r = await fetch(`${SIM_HTTP}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error ?? `${path} → HTTP ${r.status}`);
    return j;
  }, []);

  const reset = useCallback(async () => {
    setBusy("Resetting the seed state…");
    try {
      await admin("/admin/reset");
      dispatch({ type: "clear" });
      await refreshStatus();
      setBusy(null);
    } catch (e) {
      setBusy(`Reset failed: ${(e as Error).message}`);
    }
  }, [admin, refreshStatus]);

  const morning = useCallback(async () => {
    setBusy("Running the overnight job…");
    setDemo(false);
    setNight("run");
    const minShow = new Promise((r) => setTimeout(r, 2600));
    try {
      const [j] = await Promise.all([admin("/admin/advance-day"), minShow]);
      dispatch({ type: "clear" });
      if (j.clock) setClockBase({ ms: Date.parse(j.clock), at: Date.now() });
      void refreshStatus();
      setBusy(null);
    } catch (e) {
      await minShow;
      setBusy(`Skip to morning failed: ${(e as Error).message}`);
      dispatch({ type: "note", text: `advance-day failed: ${(e as Error).message}`, error: true });
    }
    setNight("out");
    setTimeout(() => setNight("off"), 900);
  }, [admin, refreshStatus]);

  const timer = useCallback(async (sec: number) => {
    setBusy(`Setting rest timers to ${sec} s…`);
    try {
      await admin("/admin/timer-speed", { rest_seconds: sec });
      await refreshStatus();
      setBusy(null);
    } catch (e) {
      setBusy(`Timer speed failed: ${(e as Error).message}`);
    }
  }, [admin, refreshStatus]);

  // Keyboard shortcuts.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      speaker.unlock();
      if (e.ctrlKey && e.shiftKey && e.code === "KeyD") {
        e.preventDefault();
        return setDemo((d) => !d);
      }
      if (isTyping(e.target)) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (!e.repeat && talkRef.current === "off") void startTalk("ptt");
      } else if (e.key === "/") {
        e.preventDefault();
        setTyping(true);
      } else if ((e.key === "h" || e.key === "H") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setHood((h) => !h);
      } else if (e.key === "Escape") {
        if (demo) setDemo(false);
        else dispatch({ type: "home" });
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space" && talkRef.current === "ptt") stopTalk();
    };
    addEventListener("keydown", down);
    addEventListener("keyup", up);
    return () => {
      removeEventListener("keydown", down);
      removeEventListener("keyup", up);
    };
  }, [demo, startTalk, stopTalk]);

  const light: LightState = talk !== "off" ? "listening" : s.backend === "idle" && (typing || s.elicit) ? "listening" : s.backend;
  const showIdle = !s.layers.some((l) => !l.leaving);
  const alexaLine = [...s.alexa, s.alexaPartial].filter(Boolean).join(" ");

  return (
    <div className="viewport">
      <div className={`stage ${hood ? "" : "no-hood"}`} style={{ zoom: stage }} data-conn={s.conn ? "1" : "0"} data-light={light}>
        <main className="main">
          <div className="device">
            <div className="camera" />
            <div className="screen" data-cards={cardsMode}>
              <Idle show={showIdle} clock={clock} day={s.day} />
              {s.layers.map((l) => <CardLayer key={`${cardsMode}-${l.key}`} layer={l} mode={cardsMode} openLink={openLink} />)}
              <ElicitOverlay elicit={s.elicit} onAnswer={answer} />
              <Night phase={night} />
              <LightBar state={light} level={level} />
            </div>
          </div>
          <div className="captions">
            <button className={`mic-btn ${talk === "ptt" ? "on" : ""}`} aria-label="Hold to talk"
              onPointerDown={() => void startTalk("ptt")} onPointerUp={stopTalk} onPointerLeave={() => talk === "ptt" && stopTalk()}>
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
            </button>
            {typing ? (
              <form className="typebox" onSubmit={(e) => { e.preventDefault(); sendText(); }}>
                <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Type what you'd say to Alexa, then Enter"
                  onKeyDown={(e) => { if (e.key === "Escape") { setTyping(false); setText(""); } }} onBlur={() => !text && setTyping(false)} />
              </form>
            ) : (
              <div className="caption-lines">
                <div className="cap-user" key={`u${s.user}`}>{s.user ? `“${s.user}”` : " "}</div>
                <div className={`cap-alexa ${alexaLine.length > 120 ? "long" : ""}`} key={`a${s.alexa.length}`}>{alexaLine || " "}</div>
              </div>
            )}
            <button className={`wake-btn ${talk === "wake" ? "on" : ""}`} onClick={() => (talk === "wake" ? stopTalk() : void startTalk("wake"))}>Alexa</button>
          </div>
        </main>
        <UnderTheHood rows={s.rows} conn={s.conn} target={targetLabel(health?.mcp)} open={hood} />
        <DemoPanel open={demo} health={health} status={status} lastTurn={s.lastTurn} cardsMode={cardsMode} autoOpen={autoOpen} busy={busy}
          onReset={reset} onMorning={morning} onTimer={timer} onClose={() => setDemo(false)}
          onCardsMode={(m) => { setCardsMode(m); store("df.cards", m); }}
          onAutoOpen={(v) => { setAutoOpen(v); store("df.autoopen", v ? "1" : "0"); }} />
      </div>
    </div>
  );
}
