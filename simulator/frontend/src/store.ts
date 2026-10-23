// Screen state, driven by simulator WebSocket events (packages/contracts/src/events.ts).
import type { ServerEvent } from "@dayform/contracts";

export type LightState = "idle" | "listening" | "thinking" | "speaking";
export type Row =
  | { kind: "turn"; id: string; text: string; final: boolean }
  | { kind: "tool"; id: string; name: string; args: Record<string, unknown>; status: "running" | "ok" | "error"; latency?: number; summary?: string; progress: string[] }
  | { kind: "note"; id: string; text: string; error?: boolean };
export interface Layer { key: number; uri: string; html: string; data: unknown; leaving: boolean; at: number }
type CardIn = { uri: string; html: string; data: unknown };
export interface Day { eaten: Record<string, number>; targets: Record<string, number> }
export interface Elicit { id: string; message: string; schema: Record<string, any> }

export interface State {
  conn: boolean;
  backend: LightState;
  user: string;
  alexa: string[];
  alexaPartial: string;
  rows: Row[];
  layers: Layer[];
  day: Day | null;
  elicit: Elicit | null;
  lastTurn: string | null;
  lastCart: { url: string; confirmed: boolean; seq: number } | null;
  /** A card held back while the current one has its minimum time on screen. */
  queued: CardIn | null;
}

export const initial: State = { conn: false, backend: "idle", user: "", alexa: [], alexaPartial: "", rows: [], layers: [], day: null, elicit: null, lastTurn: null, lastCart: null, queued: null };

export type Action =
  | { type: "ev"; ev: ServerEvent }
  | { type: "conn"; on: boolean }
  | { type: "gc" }
  | { type: "home" }
  | { type: "clear" }
  | { type: "note"; text: string; error?: boolean }
  | { type: "elicit-done" }
  | { type: "flush" };

/** Minimum time on screen before a different card replaces this one (the S4 carousel must run before the cart). */
export const DWELL_MS: Record<string, number> = { "ui://cards/meal-prep": 8000 };
export const top = (s: State) => s.layers.filter((l) => !l.leaving).at(-1);

function showCard(s: State, c: CardIn): State {
  const t = top(s);
  // Same card again (correct_meal after log_meal, log_set after start_workout): update in place.
  if (t && t.uri === c.uri) return { ...s, layers: s.layers.map((l) => (l === t ? { ...l, data: c.data, html: c.html } : l)) };
  return { ...s, layers: [...s.layers.map((l) => ({ ...l, leaving: true })), { key: ++seq, ...c, leaving: false, at: Date.now() }] };
}
const flush = (s: State): State => (s.queued ? showCard({ ...s, queued: null }, s.queued) : s);

let seq = 0;
const MAX_ROWS = 40;
const push = (rows: Row[], r: Row) => [...rows, r].slice(-MAX_ROWS);

/** Today's totals from a tool result: log_meal / correct_meal carry `day`, get_daily_summary is the day itself. */
function dayOf(data: any): Day | null {
  const d = data?.day ?? data;
  return d?.eaten && d?.targets ? { eaten: d.eaten, targets: d.targets } : null;
}

export function reduce(s: State, a: Action): State {
  switch (a.type) {
    case "conn":
      return { ...s, conn: a.on, backend: a.on ? s.backend : "idle" };
    case "gc":
      return { ...s, layers: s.layers.filter((l) => !l.leaving) };
    case "home":
      return { ...s, queued: null, layers: s.layers.map((l) => ({ ...l, leaving: true })) };
    case "clear":
      return { ...initial, conn: s.conn, layers: s.layers.map((l) => ({ ...l, leaving: true })) };
    case "note":
      return { ...s, rows: push(s.rows, { kind: "note", id: `n${++seq}`, text: a.text, error: a.error }) };
    case "elicit-done":
      return flush({ ...s, elicit: null });
    case "flush":
      return flush(s);
  }
  const ev = a.ev;
  switch (ev.type) {
    case "state":
      // The backend moves to thinking when an elicitation is answered (click or voice): close the overlay.
      if (s.elicit && (ev.state === "thinking" || ev.state === "idle")) return flush({ ...s, backend: ev.state, elicit: null });
      return { ...s, backend: ev.state };
    case "user_transcript": {
      const last = s.rows[s.rows.length - 1];
      const rows = last?.kind === "turn" && !last.final
        ? [...s.rows.slice(0, -1), { ...last, text: ev.text, final: ev.final }]
        : push(s.rows, { kind: "turn", id: `t${++seq}`, text: ev.text, final: ev.final });
      return { ...s, user: ev.text, alexa: s.elicit ? s.alexa : [], alexaPartial: "", rows };
    }
    case "alexa_transcript": {
      if (!ev.text.trim()) return s;
      // A reply can arrive as several final segments; a partial is replaced by its final.
      return ev.final ? { ...s, alexa: [...s.alexa, ev.text.trim()].slice(-3), alexaPartial: "" } : { ...s, alexaPartial: ev.text.trim() };
    }
    case "tool_call_started":
      return { ...s, rows: push(s.rows, { kind: "tool", id: ev.call_id, name: ev.name, args: ev.args, status: "running", progress: [] }) };
    case "tool_call_finished":
      return {
        ...s,
        rows: s.rows.map((r) => (r.kind === "tool" && r.id === ev.call_id ? { ...r, status: ev.status, latency: ev.latency_ms, summary: ev.summary } : r)),
      };
    case "progress": {
      if (ev.text.startsWith("Turn:")) return { ...s, lastTurn: ev.text.slice(5).trim() };
      const hit = ev.call_id && s.rows.some((r) => r.kind === "tool" && r.id === ev.call_id);
      if (hit) return { ...s, rows: s.rows.map((r) => (r.kind === "tool" && r.id === ev.call_id ? { ...r, progress: [...r.progress, ev.text] } : r)) };
      return { ...s, rows: push(s.rows, { kind: "note", id: `n${++seq}`, text: ev.text }) };
    }
    case "card": {
      const day = dayOf(ev.data) ?? s.day;
      const d = ev.data as any;
      const lastCart = d?.add_to_cart_url ? { url: d.add_to_cart_url, confirmed: d.checkout?.status === "confirmed", seq: ++seq } : s.lastCart;
      const c: CardIn = { uri: ev.resource_uri, html: ev.html, data: ev.data };
      const t = top(s);
      const held = t && t.uri !== c.uri && Date.now() - t.at < (DWELL_MS[t.uri] ?? 0);
      if (held) return { ...s, day, lastCart, queued: c };
      return showCard(flush({ ...s, day, lastCart }), c);
    }
    case "elicitation_request":
      return { ...s, alexa: [], alexaPartial: "", elicit: { id: ev.id, message: ev.message, schema: ev.requested_schema as Record<string, any> } };
    case "error":
      return { ...s, rows: push(s.rows, { kind: "note", id: `n${++seq}`, text: ev.message, error: true }) };
    default:
      return s;
  }
}
