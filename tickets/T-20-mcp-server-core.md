# T-20 · MCP server core

| Field | Value |
|---|---|
| Wave | 2: MCP server tools |
| Demo importance | ENABLER |
| Size | M |
| Depends on | T-10, T-03 (server pattern), T-04 (DB library), T-01 (tool-choice mode) |
| Owns | `server/` except `server/src/tools/<domain>/` and `server/src/domain/<domain>/` |
| Approval needed | No |
| Status | TODO |

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
_The agent fills this in._
