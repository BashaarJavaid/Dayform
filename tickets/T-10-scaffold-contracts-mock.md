# T-10 · Scaffold, contracts and mock server

| Field | Value |
|---|---|
| Wave | 1: Scaffold, data, seed |
| Demo importance | ENABLER (every other ticket waits on it) |
| Size | M |
| Depends on | Gate G0 |
| Owns | root `package.json`, `tsconfig.base.json`, `docker-compose.yml`, `packages/contracts/`, `mock/`, root scripts |
| Approval needed | No |
| Status | TODO |

## Goal
Create:
- the repo structure
- the shared contracts for all 18 tools, the 8 cards, the simulator events and the admin routes
- a mock MCP server that plays the whole demo from fixtures

After this ticket, every other agent can work in parallel.

## Why it matters for the demo
- The simulator, the cards and the Demo Monitor build against the mock from day one, so the demo is visible long before the real tools exist.
- Hybrid mode lets the Demo Monitor mix real and mock tools as tickets finish.

## Read first
- [DESIGN.md §4 MCP tools](../DESIGN.md#4-mcp-tools), [§5 Cards](../DESIGN.md#5-cards), [§9 Environment variables](../DESIGN.md#9-environment-variables), [§11 Repo layout](../DESIGN.md#11-repo-layout)
- [DEMO-SCRIPT.md](../DEMO-SCRIPT.md): the fixtures follow these scenes.
- [SMOKE-RESULTS.md](../SMOKE-RESULTS.md): the fallbacks chosen at Gate G0.

## Tasks
1. **npm workspaces** for every package in DESIGN.md §11:
   - TypeScript strict, one `tsconfig.base.json`
   - Vitest for tests, Prettier for formatting
   - Node version pinned in `.nvmrc`
2. **`packages/contracts`**, using zod:
   - **Tool contracts.** For each tool in DESIGN.md §4:
     - the input schema (alexa mode)
     - the `structuredContent` output schema
     - the card URI (if any)
     - the description
   - **Descriptions** follow the Alexa+ guidance: when to call the tool, why, and what it returns. Write them here once; the server uses them as they are.
   - **Card data types**, one per card in DESIGN.md §5.
   - **Simulator WebSocket events:**
     - `state` (idle, listening, thinking, speaking)
     - `user_transcript`, `alexa_transcript`
     - `audio_in`, `audio_out`
     - `tool_call_started`, `tool_call_finished` (name, args, latency ms, status, result summary)
     - `card` (resource URI, HTML, data)
     - `elicitation_request`, `elicitation_response`
     - `progress` (text)
     - `error`
   - **Admin route types:** reset, advance-day, timer-speed, status.
3. **Mock MCP server** in `mock/`:
   - Streamable HTTP, protocol 2025-11-25, stateful sessions.
   - Serves all 18 tools from fixtures that validate against the contracts.
   - The fixtures follow DEMO-SCRIPT.md S1–S7, so the mock plays the whole demo.
   - `checkout_cart` sends a real elicitation request.
   - Serves placeholder card resources (`ui://cards/<name>`) until T-32 delivers the real ones.
4. **Hybrid mode.** With `MOCK_PASSTHROUGH_URL` and `REAL_TOOLS=log_meal,start_workout,…` set:
   - the mock forwards the listed tools (including elicitation and progress messages) to the real server
   - it serves every other tool from fixtures
5. **`docker-compose.yml`** with these services:
   - `postgres` (with pg_trgm)
   - `mock`
   - `server` (placeholder)
   - `simulator` (placeholder)
6. **Root scripts:**
   - `npm run mock`
   - `npm run dev`
   - `npm test`
   - `npm run demo` (placeholder; the Demo Monitor fills it in)
7. **Contract tests:**
   - every fixture validates
   - `tools/list` returns 18 tools, each with a description
   - each tool's card URI points to a resource the mock serves

## Acceptance criteria
- [ ] `npm install && npm test` is green.
- [ ] `npm run mock`, then MCP Inspector, shows protocol 2025-11-25 and 18 tools.
- [ ] Every mock tool returns fixture data that validates against its contract.
- [ ] `checkout_cart` on the mock sends an elicitation request.
- [ ] Hybrid mode forwards a listed tool to a second server (tested with a stub server).
- [ ] `docker compose up postgres mock` starts both services.

## Test scenario
1. Run `npm install && npm test`. Expect green.
2. Run `npm run mock`, then `npx @modelcontextprotocol/inspector`. Connect to `http://localhost:8100/mcp`.
3. Call `log_meal` with the S1 items. Expect the S1 fixture.
4. Call `checkout_cart`. Expect an elicitation prompt in the Inspector.
5. Start a stub server that implements `ping`. Run the mock with `REAL_TOOLS=ping`. Expect the stub's reply.

## Result
_The agent fills this in._
