# T-20 · MCP server core

| Field | Value |
|---|---|
| Wave | 2: MCP server tools |
| Demo importance | ENABLER |
| Size | M |
| Depends on | T-10, T-03 (server pattern), T-04 (DB library), T-01 (tool-choice mode) |
| Owns | `server/` except `server/src/tools/<domain>/` and `server/src/domain/<domain>/` |
| Approval needed | No |
| Status | DONE |

## Goal
Build the MCP server shell that every tool plugs into:
- transport and sessions
- the tool registry
- card resources
- the LLM client
- database access
- the demo clock
- admin routes
- latency logging

## Why it matters for the demo
Every scene calls this server. It must start fast and answer fast, and it must never return an empty result.

## Read first
- [DESIGN.md §3 Alexa+ add-on rules](../DESIGN.md#3-alexa-add-on-rules), [§4 MCP tools](../DESIGN.md#4-mcp-tools), [§7 LLM and code](../DESIGN.md#7-llm-and-code), [§8 Demo controls](../DESIGN.md#8-demo-controls), [§9 Environment variables](../DESIGN.md#9-environment-variables)
- `smoke/agentcore-mcp/` (T-03) and [SMOKE-RESULTS.md](../SMOKE-RESULTS.md)

## Tasks
1. **Transport.** Start from the T-03 server. Use `McpServer` with `StreamableHTTPServerTransport`:
   - stateful sessions
   - `0.0.0.0:8000`, `POST /mcp`
   - protocol 2025-11-25
2. **Tool registry.** Auto-load every `server/src/tools/<domain>/index.ts`.
   - Each folder exports tool definitions: contract name, description, input schema, output schema, card URI and handler.
   - Domain tickets add their own folders, so they never need to edit core files.
3. **Understanding switch.** In `alexa` mode, register the contract input schemas. In `server` mode, call the adapter from T-28. Until T-28 lands, a stub returns a clear "not implemented" error.
4. **Result envelope.** Every handler returns:
   - `structuredContent` that matches the contract
   - a short `content` text of facts for Alexa to speak
   - `_meta.ui.resourceUri` when the tool has a card

   Errors return `isError: true` with a plain message. Every call returns either a result or an error.
5. **Card resources.** Serve `cards/dist/<name>.html` as `ui://cards/<name>` (T-32 builds them). Serve placeholders until then.
6. **Progress helper.** Long handlers can send MCP progress notifications and log messages. The simulator shows them in the "Under the hood" panel.
7. **LLM client** (`server/src/core/llm.ts`), used by T-22, T-25, T-27 and T-28:
   - Bedrock Converse with `REASONING_MODEL_ID`
   - structured output, using the tool-choice mode from T-01
   - zod validation, with one retry on invalid output
   - a timeout
   - token and latency logging
   - ConverseStream support for long outputs
8. **Database access** with the T-04 library. The driver is chosen by `DB_DRIVER` (`pg` or `data-api`).
9. **Demo clock.** `clock.now()` reads the `demo_clock` table when `DEMO_MODE=true`, and real time otherwise. All domain code uses `clock.now()`.
10. **Admin routes**, only when `DEMO_MODE=true`, protected by `ADMIN_TOKEN`:
    - `POST /admin/reset`: calls the T-11 reset.
    - `POST /admin/advance-day`: calls `runOvernight` from T-27, then sets the clock to 07:00 the next day. A stub until T-27.
    - `POST /admin/timer-speed`
    - `GET /admin/status`: clock, overnight mode, last reset time.
11. **Logging.** Log one line per tool call: name, ms, status. Add a `/health` route.
12. **Container.** An ARM64 Dockerfile, from T-03. It runs in `docker compose` and on AgentCore.

## Acceptance criteria
- [ ] MCP Inspector connects. The protocol is 2025-11-25.
- [ ] The registry loads a sample tool folder with no edit to core files.
- [ ] Envelope rules hold for success and for error (tests).
- [ ] The admin routes work with `DEMO_MODE=true`, and return 404 with `DEMO_MODE=false`.
- [ ] `clock.now()` follows the demo clock (test).
- [ ] The LLM client returns validated JSON from Opus, and retries once on invalid JSON (test with a mocked bad reply).
- [ ] The container runs locally through `docker compose up server`.

## Test scenario
1. Run `npm test -w server`. Expect green.
2. Run `docker compose up postgres server`, then connect MCP Inspector to `http://localhost:8000/mcp`. Expect protocol 2025-11-25 and the sample tool.
3. Run `curl -X POST -H "x-admin-token: $ADMIN_TOKEN" localhost:8000/admin/reset`. Expect `{"ok":true}` within 3 s.

## Result
Built (2026-10-22), all in `server/`:
- `src/app.ts` stateful Streamable HTTP on `POST /mcp` (T-03 pattern, adopts a platform session ID), `/health`, admin router only when `DEMO_MODE=true`. `src/main.ts` listens on `PORT` (default 8000); `npm run dev -w @dayform/server` uses 8001.
- `src/core/registry.ts`: auto-loads `src/tools/<domain>/index.ts` (`export const tools = [defineTool(contract, handler)]`), duplicate-name check, envelope (output zod-checked against the contract, `content` = handler's fact text, `_meta.ui.resourceUri` on tool and result when the contract has a card, any throw → `isError` with the plain message, one log line `tool=<name> ms=<n> status=ok|error|bad_output`). Handler ctx: `progress()`, `log()`, `elicit()`, all on the call's own POST stream (`extra.sendNotification` / `relatedRequestId`). `UNDERSTANDING=server` registers `ServerModeInput` (`{text}`) and calls `src/understanding/index.ts` `parseRequest(contract, text, ctx)` (T-28); missing → "UNDERSTANDING=server is not implemented yet (T-28)."
- `src/tools/_sample/` ping tool.
- `src/core/cards.ts`: 8 `ui://cards/<name>` resources from `cards/dist/<name>.html`, mock's placeholder until T-32, MIME `text/html;profile=mcp-app`.
- `src/core/llm.ts`: `structured({name, description, schema, prompt, system?, stream?, timeoutMs?, maxTokens?})` → forced tool `{tool:{name}}` with `z.toJSONSchema`, zod validation, one retry with the errors, `AbortSignal.timeout`, log line with model/ms/tokens/stopReason, ConverseStream option, fallback model on throttling/5xx only. `createLlm(call)` for mocks. `npm run llm:probe -w @dayform/server [-- --stream]` makes one real call.
- `src/core/db.ts`: `getDb()` (async) and `query(sql)` over T-11's `@dayform/db` `connect()` (DB_DRIVER), re-exports `schema`.
- `src/core/clock.ts`: T-11's `demo_clock` row (`demo_now + (real now − set_at)`, `rest_seconds`); real time when `DEMO_MODE` is not true.
- `src/core/admin.ts`: `x-admin-token` or `Authorization: Bearer` (contracts say Bearer); reset runs `npm run db:reset -w @dayform/db`; advance-day moves the clock to 07:00 next day (process time zone) with no overnight run yet (T-27); timer-speed; status (+ `last_reset`).
- `Dockerfile` (+ `.dockerignore`), compose `server` service (ARM64, 8001→8000, `.env.local`, `~/.aws` read-only, DATABASE_URL rewritten to `postgres:5432`).

Verification (2026-10-22):
- `npm test -w server`: `Test Files 5 passed (5)`, `Tests 18 passed (18)`. Tests use a separate `dayform_server_test` database migrated with T-11's migrations. The F-009 test disables the GET stream (405) and still gets the elicitation, 2 progress notifications and the log. With `relatedRequestId` removed, that test times out (checked, then restored).
- `npm run llm:probe` against Bedrock: `model=us.amazon.nova-2-lite-v1:0 attempt=1 ms=1254 in=1016 out=65 stop=tool_use status=ok`, items roti×2, chicken karahi, mango lassi, meal lunch; stream 1190 ms; from inside the container 978 ms.
- `initialize` on :8001 → `"protocolVersion":"2025-11-25"`; Inspector CLI `tools/list` → `ping`; `tools/call ping` → structuredContent `server_time`. Warm ping 2–12 ms locally (first call 117 ms, DB connect).
- `DEMO_MODE=false` → `/admin/reset` 404; no token → 401; `/admin/reset` → `{"ok":false,"error":"reset script not present yet (T-11: db/src/reset.ts)"}` in 0.56 s.
- `docker compose up -d --build postgres server`: `dayform-server-1` Up, image arch `arm64`, `127.0.0.1:8001->8000/tcp`, ping and admin status answer through it.

Deviations: no `demo_clock` creation (T-11's table already exists, with a ticking-clock shape that differs from the orchestrator's note); server-mode input is the contract's `{text}`, not T-28's `{request}`; admin accepts both header styles; `getDb()` is async because `@dayform/db` `connect()` is.

**Orchestrator close-out (2026-10-22):** verified 18 tests, live container on 8001 (protocol 2025-11-25, ping), admin 401/404 gating, reset reports T-11 pending. Decisions: T-11's demo_clock shape stands; server-mode input is `{text}` (T-28 ticket updated); `DEMO_TZ=Asia/Karachi` added to DESIGN §9, advance-day must compute 07:00 in that zone (T-27 wires runOvernight). DONE.
