# T-06 · Smoke test: MCP Apps card rendering

| Field | Value |
|---|---|
| Wave | 0: Setup and smoke tests |
| Demo importance | ENABLER (it unlocks every card) |
| Size | S |
| Depends on | — |
| Owns | `smoke/mcp-apps/` |
| Approval needed | Only for optional step 5 (exposing a local server publicly) |
| Status | DONE |

## Goal
Prove that a card built with MCP Apps shows live tool data inside a 768×480 frame in our own host page. The card must come from a real `resources/read` on an MCP server.

## Why it matters for the demo
Cards are the visual "wow" of every scene. Alexa+ shows MCP Apps screens on Echo Show devices, and our simulator has to do the same.

## Read first
- [DESIGN.md §5 Cards](../DESIGN.md#5-cards) and [§3 Alexa+ add-on rules](../DESIGN.md#3-alexa-add-on-rules)

## Facts from research (2026-10-23)
- **Linking:** Alexa+ links a tool to its card with `_meta.ui.resourceUri`.
- **Without a card:** Alexa renders `structuredContent` itself, or replies by voice only.
- **Canvas:** 768×480.
- **SDK:** `@modelcontextprotocol/ext-apps` 2.0.3 (the MCP Apps SDK, for both apps and hosts).

## Tasks
1. Copy the T-03 server into `smoke/mcp-apps/server.ts`. Add a tool `show_rings`:
   - It returns `structuredContent`: `{calories, protein, carbs, fat}`, each with `eaten` and `target`.
   - It sets `_meta.ui.resourceUri: "ui://cards/rings"`.
2. Register the resource `ui://cards/rings`: a single-file HTML page built with the ext-apps app-side API. It draws four rings from the tool result. Use the MIME type the SDK sets for MCP Apps.
3. Write a host page. It:
   1. connects as an MCP client
   2. calls `show_rings`
   3. reads the resource
   4. renders it in a sandboxed iframe sized 768×480
   5. passes the tool result through the ext-apps host bridge
4. **Callback test.** Add a button in the card, "Add 250 ml water", that calls a tool `log_water_stub` through the host. Record whether the bridge supports this.
5. Optional, **approval needed**: expose the server through a tunnel, connect it to Claude as a custom connector, and check the card renders there too.
6. Write the results to [SMOKE-RESULTS.md](../SMOKE-RESULTS.md) §T-06.

## Acceptance criteria
- [ ] The card renders live tool data at 768×480 in the host page.
- [ ] The card comes from `resources/read`, not from a hard-coded file.
- [ ] The card-to-tool callback works, or is recorded as unsupported.
- [ ] The single-file HTML build works (one file, with no external requests).

## Test scenario
1. Run `npm run smoke:apps`, and open the host page on localhost.
2. Expect four rings showing the numbers returned by `show_rings`.
3. Click "Add 250 ml water". Expect `log_water_stub` to appear in the server log.

## Fallbacks
- **Native React cards:** render cards as native React components from `structuredContent` in the simulator.
  - Still declare the `ui://` resources, so the server stays compatible with Alexa+.
  - T-32 uses one set of React components for both paths, so switching is one env var (`CARDS_MODE=native`).

## Result
- **Outcome:** PASS, all 4 acceptance criteria verified in headless Google Chrome via CDP (claude-in-chrome extension was not connected). Details and numbers: [SMOKE-RESULTS.md §T-06](../SMOKE-RESULTS.md#t-06--mcp-apps-card).
- **Files:** `smoke/mcp-apps/server.ts` (stateful Streamable HTTP server on :8106, `/mcp`, also serves the host page), `card/rings.{ts,html}` (View, ext-apps `App`), `host/host.{ts,html}` (sdk `Client` + ext-apps `AppBridge` + `PostMessageTransport`), `build.ts` (esbuild single-file card), `verify-browser.ts` (headless screenshot + click), `shots/`.
- **Run:** `cd smoke/mcp-apps && npm install && npm run smoke:apps`, open http://localhost:8106/. Headless check in a second shell: `npm run smoke:apps:check`.
- **Callback:** supported. `App.callServerTool` → `AppBridge.oncalltool` → MCP `tools/call`.
- **Deviations:** no T-03 server existed, so `server.ts` is a fresh minimal server (orchestrator instruction). `show_rings` returns a fixed sample day (no DB yet). Optional task 5 (tunnel) skipped per orchestrator. Single sandboxed iframe instead of the double-iframe proxy.
- **Fallbacks used:** none.
- **For T-32 / orchestrator:** decide SDK line (sdk 1.32.1 v1 vs split v2 packages that ext-apps 2.x peers on, FRICTION F-001). Card bundle is ~600 KB (F-002).
