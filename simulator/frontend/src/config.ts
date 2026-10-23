// Frontend settings: CARDS_MODE and SIM_PORT from the shell/.env.local (vite.config.ts), overridable per URL.
declare const __CARDS_MODE__: string;
declare const __SIM_PORT__: string;

const q = new URLSearchParams(location.search);
const stored = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
export const store = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} };

export const SCALE = 1.5;
export const DEMO_TZ = "Asia/Karachi"; // DESIGN.md §9 DEMO_TZ
export const SIM_HTTP = q.get("sim") ?? `http://${location.hostname}:${__SIM_PORT__}`;
export const SIM_WS = SIM_HTTP.replace(/^http/, "ws");
export const CARDS_MODE = (q.get("cards") ?? stored("df.cards") ?? __CARDS_MODE__) === "native" ? "native" : "mcp-apps";
export const AUTO_OPEN_CART = (q.get("autoopen") ?? stored("df.autoopen") ?? "1") === "1";
