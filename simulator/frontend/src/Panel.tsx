// "Under the hood": live MCP tool calls, progress lines, the protocol/target label. And the hidden demo panel.
import { useEffect, useRef, useState } from "react";
import type { Row } from "./store.ts";

const CATEGORY: Record<string, string> = {
  log_meal: "meal", correct_meal: "meal", get_daily_summary: "rings", log_water: "rings", set_goals: "rings", log_bodyweight: "rings",
  start_workout: "lift", log_set: "lift", swap_exercise: "lift", finish_workout: "lift", log_workout: "lift", get_progress: "chart",
  plan_meal_prep: "plan", add_to_cart: "cart", view_cart: "cart", remove_from_cart: "cart", checkout_cart: "cart", confirm_checkout: "cart",
  get_morning_brief: "sun",
};
const ICONS: Record<string, string> = {
  meal: "M7 3v8a2 2 0 0 0 2 2v8M5 3v5M9 3v5M16 21V3c2.5 1 3.5 4 3.5 8H16",
  rings: "M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5",
  lift: "M3 9v6M6 6v12M18 6v12M21 9v6M6 12h12",
  chart: "M3 20h18M5 16l4-5 4 3 6-8",
  plan: "M4 6h16v14H4zM4 10h16M9 3v4M15 3v4",
  cart: "M3 4h2l2.4 11h10.2L20 7H6.2M9 20a1 1 0 1 0 0-.01M17 20a1 1 0 1 0 0-.01",
  sun: "M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
};

function Icon({ name }: { name: string }) {
  const cat = CATEGORY[name] ?? "rings";
  return (
    <div className={`tool-icon cat-${cat}`}>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[cat]} /></svg>
    </div>
  );
}

/** {"items":[{"food":"roti","quantity":2}],"meal":"lunch"} -> "items: roti ×2, … · meal: lunch". */
export function shortArgs(args: Record<string, unknown>): string {
  const val = (v: unknown): string => {
    if (Array.isArray(v)) return v.map(val).join(", ");
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const name = o.food ?? o.name ?? o.exercise ?? o.item ?? Object.values(o).find((x) => typeof x === "string");
      const qty = o.quantity ?? o.reps ?? o.packs;
      return name != null ? `${name}${typeof qty === "number" && qty !== 1 ? ` ×${qty}` : ""}` : JSON.stringify(o);
    }
    return String(v);
  };
  const s = Object.entries(args).map(([k, v]) => `${k}: ${val(v)}`).join(" · ");
  return s.length > 96 ? s.slice(0, 95) + "…" : s || "no arguments";
}

export function UnderTheHood({ rows, conn, target, open }: { rows: Row[]; conn: boolean; target: string; open: boolean }) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [rows]);
  return (
    <aside className={`hood ${open ? "open" : ""}`} aria-hidden={!open}>
      <div className="hood-inner">
        <header className="hood-head">
          <div className="hood-title">Under the hood <span className={`conn ${conn ? "on" : ""}`} title={conn ? "simulator connected" : "simulator offline"} /></div>
          <div className="hood-label">MCP 2025-11-25 · Streamable HTTP · <b>{target}</b></div>
        </header>
        <div className="hood-list" ref={list}>
          {!rows.length && <div className="hood-empty">Tool calls appear here as Alexa uses the Dayform add-on.</div>}
          {rows.map((r) =>
            r.kind === "turn" ? (
              <div key={r.id} className="row-turn">“{r.text}”</div>
            ) : r.kind === "note" ? (
              <div key={r.id} className={`row-note ${r.error ? "err" : ""}`}>{r.text}</div>
            ) : (
              <div key={r.id} className={`row-tool ${r.status}`} data-tool={r.name}>
                <Icon name={r.name} />
                <div className="tool-body">
                  <div className="tool-top">
                    <span className="tool-name">{r.name}</span>
                    {r.status === "running" ? <span className="spinner" /> : (
                      <span className={`badge ${r.status === "error" ? "bad" : r.latency! < 500 ? "fast" : "slow"}`}>{r.status === "error" ? "error · " : ""}{Math.round(r.latency!)} ms</span>
                    )}
                  </div>
                  <div className="tool-args">{shortArgs(r.args)}</div>
                  {r.progress.map((p, i) => <div key={i} className="tool-progress">{p}</div>)}
                  {r.summary && <div className="tool-summary">{r.summary}</div>}
                </div>
              </div>
            ),
          )}
        </div>
      </div>
    </aside>
  );
}

export interface Health { engine: string; mcp: string }
export interface DemoProps {
  open: boolean;
  health: Health | null;
  status: Record<string, unknown> | null;
  lastTurn: string | null;
  cardsMode: string;
  autoOpen: boolean;
  busy: string | null;
  onReset(): void;
  onMorning(): void;
  onTimer(s: number): void;
  onCardsMode(m: "mcp-apps" | "native"): void;
  onAutoOpen(v: boolean): void;
  onClose(): void;
}

export function DemoPanel(p: DemoProps) {
  const [rest, setRest] = useState("10");
  if (!p.open) return null;
  return (
    <div className="demo-panel" role="dialog" aria-label="Demo panel">
      <div className="demo-head">Demo panel <button className="x" onClick={p.onClose} aria-label="Close">×</button></div>
      <div className="demo-row">
        <button data-act="reset" onClick={p.onReset} disabled={!!p.busy}>Reset seed state</button>
        <button data-act="morning" onClick={p.onMorning} disabled={!!p.busy}>Skip to morning</button>
      </div>
      <div className="demo-row">
        <label>Rest timer <input value={rest} onChange={(e) => setRest(e.target.value)} size={3} /> s</label>
        <button data-act="timer" onClick={() => p.onTimer(Number(rest))} disabled={!!p.busy || !(Number(rest) > 0)}>Set</button>
      </div>
      <div className="demo-row">
        <label>Cards
          <select value={p.cardsMode} onChange={(e) => p.onCardsMode(e.target.value as "mcp-apps" | "native")}>
            <option value="mcp-apps">MCP Apps (iframe)</option>
            <option value="native">Native</option>
          </select>
        </label>
        <label><input type="checkbox" checked={p.autoOpen} onChange={(e) => p.onAutoOpen(e.target.checked)} /> Open Amazon after confirm</label>
      </div>
      <dl className="demo-facts">
        <dt>Voice engine</dt><dd>{p.health?.engine ?? "–"}</dd>
        <dt>MCP target</dt><dd>{p.health?.mcp ?? "–"}</dd>
        <dt>Demo clock</dt><dd>{String(p.status?.clock ?? "–")}</dd>
        <dt>Rest timer</dt><dd>{p.status?.rest_seconds != null ? `${p.status.rest_seconds} s` : "program values"}</dd>
        <dt>Overnight</dt><dd>{String(p.status?.overnight_mode ?? "–")}</dd>
        <dt>Last turn</dt><dd>{p.lastTurn ?? "–"}</dd>
      </dl>
      <div className="demo-note">{p.busy ?? "Engine and target are backend settings: VOICE_ENGINE / MCP_URL, then restart sim:backend."}</div>
    </div>
  );
}
