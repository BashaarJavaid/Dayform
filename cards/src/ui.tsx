// Shared pieces for the 8 cards: props, count-up, ring, bar, tool button, confetti, formatting.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import "./styles.css";

export type ToolResult = { structuredContent?: Record<string, unknown>; isError?: boolean; content?: unknown[] };
/** Card -> tool call through the host (MCP Apps: app.callServerTool; native: the simulator's MCP client). */
export type CallTool = (name: string, args: Record<string, unknown>) => Promise<ToolResult>;

export interface CardProps<T> {
  data: T;
  /** Absent when the host cannot proxy tool calls: tool buttons are then hidden. */
  callTool?: CallTool;
  /** Absent when the host cannot open links: the cart card then shows the QR code only. */
  openLink?: (url: string) => void;
}

export const COLORS = { kcal: "var(--kcal)", protein: "var(--protein)", carbs: "var(--carbs)", fat: "var(--fat)", water: "var(--water)" };
export const MACROS = [
  { key: "kcal", label: "Calories", unit: "kcal", color: COLORS.kcal },
  { key: "protein_g", label: "Protein", unit: "g", color: COLORS.protein },
  { key: "carbs_g", label: "Carbs", unit: "g", color: COLORS.carbs },
  { key: "fat_g", label: "Fat", unit: "g", color: COLORS.fat },
] as const;

export const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** Animates a number from its previous value (0 on mount) to `value`. */
export function useCountUp(value: number, ms = 800, startDelay = 150): number {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = from.current;
    let raf = 0;
    const t0 = performance.now() + startDelay;
    const tick = (now: number) => {
      const t = Math.min(Math.max((now - t0) / ms, 0), 1);
      const v = start + (value - start) * easeOut(t);
      setShown(v);
      from.current = v;
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms, startDelay]);
  return shown;
}

/** A number that counts up; `digits` decimals. Fixed width via tabular numbers, so no layout shift. */
export function Count({ value, digits = 0, ms, startDelay }: { value: number; digits?: number; ms?: number; startDelay?: number }) {
  const v = useCountUp(value, ms, startDelay);
  return <>{fmt(v, digits)}</>;
}

export const fmt = (n: number, digits = 0) =>
  n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
/** 80 -> "80", 102.5 -> "102.5". */
export const fmtKg = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
export const signed = (n: number, digits = 1) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toFixed(digits).replace(/\.0+$/, "")}`;
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "2026-10-23" -> "Fri 23 Oct" (parsed as UTC so the browser time zone never shifts the day). */
export function fmtDate(date: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) {
  return new Date(`${date.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" }).replace("Sept", "Sep");
}
/** Clock time as written in the ISO string (demo clock), not converted to the browser zone. */
/** Demo time zone (server DEMO_TZ default). Cards run in the browser, so it is fixed here. */
export const DEMO_TZ = "Asia/Karachi";
/** Clock time of an ISO instant in the demo zone, whatever zone the browser or the string uses. */
export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: DEMO_TZ });
/** "Push" -> "Push day"; "Push day" stays as it is. */
export const dayLabel = (name: string) => (/\bday$/i.test(name.trim()) ? name.trim() : `${name.trim()} day`);

export function Ring({ size, stroke, frac, color, delayMs = 150, children }: {
  size: number; stroke: number; frac: number; color: string; delayMs?: number; children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.min(Math.max(frac, 0), 1);
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "none" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: "absolute", inset: 0 }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle className="df-ring-arc" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ strokeDashoffset: c * (1 - p), "--df-c": c, "--d": `${delayMs}ms` } as CSSProperties} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        {children}
      </div>
    </div>
  );
}

export function Bar({ frac, color, delayMs = 200, height = 14, marker }: { frac: number; color: string; delayMs?: number; height?: number; marker?: number }) {
  return (
    <div className="df-bar" style={{ height }}>
      <div className="df-bar-fill" style={{ width: `${Math.min(Math.max(frac, 0), 1) * 100}%`, background: color, ...delay(delayMs) }} />
      {marker !== undefined && (
        <div style={{ position: "absolute", top: 0, bottom: 0, left: `calc(${Math.min(marker, 1) * 100}% - 1px)`, width: 2, background: "var(--text)", opacity: 0.7 }} />
      )}
    </div>
  );
}

/** A button that calls a tool through the host. Hidden when the host cannot call tools. */
export function ToolButton({ callTool, name, args, label, doneLabel, onResult, ghost, repeat, style }: {
  callTool?: CallTool; name: string; args: Record<string, unknown>; label: string; doneLabel: string;
  onResult?: (r: ToolResult) => void; ghost?: boolean; /** Re-enable 1.5 s after success. */ repeat?: boolean; style?: CSSProperties;
}) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  if (!callTool) return null;
  const click = async () => {
    setState("busy");
    try {
      const r = await callTool(name, args);
      if (r.isError) return setState("error");
      setState("done");
      onResult?.(r);
      if (repeat) setTimeout(() => setState("idle"), 1500);
    } catch {
      setState("error");
    }
  };
  const text = state === "done" ? doneLabel : state === "error" ? "Try again" : label;
  return (
    <button className={`df-btn ${state === "done" ? "df-btn-done" : ghost ? "df-btn-ghost" : ""}`} style={style}
      disabled={state === "busy" || state === "done"} onClick={click} data-tool={name}>
      {text}
    </button>
  );
}

/** Deterministic confetti burst (decorative, ~1.1 s). */
export function Confetti({ count = 36, top = "42%", startDelay = 0 }: { count?: number; top?: string; startDelay?: number }) {
  const colors = ["var(--cyan)", "var(--gold)", "var(--fat)", "var(--protein)", "var(--good)"];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  return (
    <div data-deco aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + rnd() * 0.4;
        const dist = 170 + rnd() * 230;
        return (
          <span key={i} className="df-confetti" style={{
            top, background: colors[i % colors.length],
            "--dx": `${Math.cos(angle) * dist}px`, "--dy": `${Math.sin(angle) * dist * 0.7 + 60}px`,
            "--rot": `${Math.round(rnd() * 720 - 360)}deg`, "--d": `${startDelay + Math.round(rnd() * 100)}ms`,
          } as CSSProperties} />
        );
      })}
    </div>
  );
}

export function CardRoot({ name, children, style }: { name: string; children: ReactNode; style?: CSSProperties }) {
  return <div className={`df-card df-card-${name}`} data-card={name} data-clip style={style}>{children}</div>;
}
