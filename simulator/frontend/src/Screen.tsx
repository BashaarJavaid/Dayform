// The 768x480 Echo Show screen at 1.5x: card layers (crossfade), idle home, light bar, elicitation and night overlays.
import { useEffect, useRef, useState } from "react";
import { CardByUri } from "@dayform/cards";
import { mountCardFrame, type CardFrame, type HostToolResult } from "@dayform/cards/host";
import type { Day, Elicit, Layer, LightState } from "./store.ts";
import { DEMO_TZ, SCALE } from "./config.ts";

const result = (data: unknown): HostToolResult => ({
  structuredContent: data as Record<string, unknown>,
  content: [{ type: "text", text: JSON.stringify(data) }],
});

/** One card. MCP Apps: sandboxed iframe + AppBridge, refreshed in place with update(). Native: the same React component. */
export function CardLayer({ layer, mode, openLink }: { layer: Layer; mode: "mcp-apps" | "native"; openLink: (url: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const frame = useRef<CardFrame | null>(null);
  const [shown, setShown] = useState(false);
  const linkRef = useRef(openLink);
  linkRef.current = openLink;

  useEffect(() => {
    if (mode !== "mcp-apps") {
      const r = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(r);
    }
    const f = mountCardFrame({ container: host.current!, html: layer.html, toolResult: result(layer.data), scale: SCALE, onOpenLink: (u) => linkRef.current(u) });
    frame.current = f;
    // Fade in once the card has its data, so the camera never sees an empty frame.
    let alive = true;
    void Promise.race([f.ready, new Promise((r) => setTimeout(r, 1500))]).then(() => alive && setShown(true));
    return () => {
      alive = false;
      f.destroy();
      frame.current = null;
    };
  }, [mode, layer.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const first = useRef(true);
  useEffect(() => {
    if (first.current) return void (first.current = false);
    if (mode === "mcp-apps") void frame.current?.update(result(layer.data));
  }, [layer.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const Card = CardByUri[layer.uri];
  return (
    <div className={`layer card-layer ${shown && !layer.leaving ? "in" : ""}`} data-uri={layer.uri} data-key={layer.key}>
      {mode === "mcp-apps" ? <div ref={host} className="frame-host" /> : Card ? <div style={{ zoom: SCALE }}><Card data={layer.data} openLink={openLink} /></div> : null}
    </div>
  );
}

/** Demo clock (DEMO_TZ) that keeps running from the last /admin/status reading. */
export function useClock(base: { ms: number; at: number } | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return base ? new Date(base.ms + (now - base.at)) : new Date(now);
}

const RINGS = [
  { key: "kcal", label: "Calories", unit: "", color: "#19d3ff" },
  { key: "protein_g", label: "Protein", unit: "g", color: "#a78bfa" },
  { key: "carbs_g", label: "Carbs", unit: "g", color: "#fbbf24" },
  { key: "fat_g", label: "Fat", unit: "g", color: "#fb7185" },
];

function MiniRing({ frac, color }: { frac: number; color: string }) {
  const r = 26, c = 2 * Math.PI * r;
  return (
    <svg width="64" height="64" viewBox="0 0 64 64">
      <circle cx="32" cy="32" r={r} fill="none" stroke="#1a2436" strokeWidth="7" />
      <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(Math.max(frac, 0), 1))} transform="rotate(-90 32 32)" style={{ transition: "stroke-dashoffset 900ms cubic-bezier(.22,1,.36,1)" }} />
    </svg>
  );
}

export function Idle({ show, clock, day }: { show: boolean; clock: Date; day: Day | null }) {
  const time = clock.toLocaleTimeString("en-US", { timeZone: DEMO_TZ, hour: "numeric", minute: "2-digit", hour12: true });
  const [hm, ampm] = time.split(" ");
  const date = clock.toLocaleDateString("en-GB", { timeZone: DEMO_TZ, weekday: "long", day: "numeric", month: "long" });
  const hour = Number(clock.toLocaleString("en-GB", { timeZone: DEMO_TZ, hour: "2-digit", hour12: false }));
  const hint = hour >= 5 && hour < 11 ? "Alexa, good morning" : "Alexa, start push day";
  return (
    <div className={`layer home ${show ? "in" : ""}`}>
      <div className="native" style={{ zoom: SCALE }}>
        <div className="idle-inner">
          <div className="idle-left">
            <div className="idle-time">{hm}<span>{ampm}</span></div>
            <div className="idle-date">{date}</div>
          </div>
          <div className="idle-today">
            <div className="idle-label">Today</div>
            <div className="idle-rings">
              {RINGS.map((r) => {
                const eaten = day?.eaten[r.key];
                const target = day?.targets[r.key];
                return (
                  <div className="idle-ring" key={r.key}>
                    <MiniRing frac={eaten != null && target ? eaten / target : 0} color={r.color} />
                    <div className="idle-ring-v">{eaten != null ? `${Math.round(eaten).toLocaleString("en-US")}${r.unit}` : "–"}</div>
                    <div className="idle-ring-l">{r.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="idle-hint">Try: <b>“{hint}”</b></div>
        </div>
      </div>
    </div>
  );
}

/** Thin cyan bar along the screen's bottom edge. Speaking follows the playback level (written straight to the DOM). */
export function LightBar({ state, level }: { state: LightState; level: () => number }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state !== "speaking") return void el.current?.style.removeProperty("--lvl");
    let raf = 0, smooth = 0;
    const tick = () => {
      smooth = smooth * 0.6 + level() * 0.4;
      el.current?.style.setProperty("--lvl", smooth.toFixed(3));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state, level]);
  return (
    <div ref={el} className={`lightbar ${state}`} data-state={state}>
      <div className="lb-glow" />
      <div className="lb-sweep" />
    </div>
  );
}

export function ElicitOverlay({ elicit, onAnswer }: { elicit: Elicit | null; onAnswer: (yes: boolean) => void }) {
  // Keep the last question while fading out.
  const last = useRef<Elicit | null>(null);
  if (elicit) last.current = elicit;
  const e = elicit ?? last.current;
  return (
    <div className={`layer overlay elicit ${elicit ? "in" : ""}`} aria-hidden={!elicit}>
      <div className="native" style={{ zoom: SCALE }}>
        <div className="elicit-box">
          <div className="elicit-kicker">Confirm</div>
          <div className="elicit-q">{e?.message}</div>
          <div className="elicit-buttons">
            <button className="btn-yes" onClick={() => onAnswer(true)} disabled={!elicit}>Yes</button>
            <button className="btn-no" onClick={() => onAnswer(false)} disabled={!elicit}>No</button>
          </div>
          <div className="elicit-hint">or say “yes”</div>
        </div>
      </div>
    </div>
  );
}

/** "Skip to morning": dim, moon, sunrise; stays up until the admin call is done (2-3 s). */
export function Night({ phase }: { phase: "off" | "run" | "out" }) {
  return (
    <div className={`layer night ${phase}`}>
      <div className="night-sky" />
      <div className="dawn-sky" />
      <div className="stars" />
      <div className="moon" />
      <div className="sun" />
    </div>
  );
}
