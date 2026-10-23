# T-10 · Scaffold, contracts and mock server

| Field | Value |
|---|---|
| Wave | 1: Scaffold, data, seed |
| Demo importance | ENABLER (every other ticket waits on it) |
| Size | M |
| Depends on | Gate G0 |
| Owns | root `package.json`, `tsconfig.base.json`, `docker-compose.yml`, `packages/contracts/`, `mock/`, root scripts |
| Approval needed | No |
| Status | DONE |

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
- [x] `npm install && npm test` is green.
- [x] `npm run mock`, then MCP Inspector, shows protocol 2025-11-25 and 18 tools.
- [x] Every mock tool returns fixture data that validates against its contract.
- [x] `checkout_cart` on the mock sends an elicitation request.
- [x] Hybrid mode forwards a listed tool to a second server (tested with a stub server).
- [x] `docker compose up postgres mock` starts both services.

## Test scenario
1. Run `npm install && npm test`. Expect green.
2. Run `npm run mock`, then `npx @modelcontextprotocol/inspector`. Connect to `http://localhost:8100/mcp`.
3. Call `log_meal` with the S1 items. Expect the S1 fixture.
4. Call `checkout_cart`. Expect an elicitation prompt in the Inspector.
5. Start a stub server that implements `ping`. Run the mock with `REAL_TOOLS=ping`. Expect the stub's reply.

## Result
Verified 2026-10-23 (PKT). All 6 acceptance criteria pass; test scenario steps 1–5 run green (step 4 uses an SDK client with an elicitation handler, since the Inspector CLI cannot answer elicitation).

**Built**
- npm workspaces for every DESIGN §11 package; `packages/contracts` and `mock` are real, the other 10 are `package.json` stubs (`@dayform/<name>`, test = echo). Strict TS (`tsconfig.base.json`, per-package `tsconfig.json`), `.nvmrc` = 23, `engines.node >=22`, Prettier (`.prettierrc`), Vitest.
- `packages/contracts` (zod 4.6.7): `src/tools/<name>.ts` × 19 (`{name, description, input, output, card}`), `TOOLS` (18, DESIGN §4 order), `confirm_checkout` exported separately; `src/cards/*` (8 card schemas, `CARDS`, `CARD_URIS`, `CARD_MIME_TYPE`); `src/events.ts` (`ServerEvent`, `ClientEvent`, `SimEvent` unions on `type`); `src/admin.ts` (routes + request/response types); `ServerModeInput` for `UNDERSTANDING=server`. The SDK takes the zod objects directly (no JSON-schema export needed).
- Each tool's output **extends its card's schema**, so a card always finds its fields at the top of `structuredContent`.
- `mock/`: port 8100, `/mcp`, stateful sessions, 2025-11-25; fixtures validated against the contracts at startup (fail fast, checked); 8 placeholder cards `ui://cards/<name>` (MIME `text/html;profile=mcp-app`, tiny HTML that does the `ui/initialize` handshake and prints the tool result; not rendered in a browser); `checkout_cart` elicits with `relatedRequestId`; `CHECKOUT_CONFIRM=tool` adds `confirm_checkout`; hybrid mode (`MOCK_PASSTHROUGH_URL` + `REAL_TOOLS`) opens one upstream session per mock session and relays elicitation (with `relatedRequestId`) and progress.
- `docker-compose.yml` (project `dayform`): `postgres` (postgres:17, `container_name: dayform-pg`, 127.0.0.1:5433, db `dayform`, password read from `DATABASE_URL` in `.env.local`, pg_trgm created at init), `mock` (8100, built from `mock/Dockerfile`), `server` and `simulator` placeholders under profile `later`; `server` maps host **8001** (8000 is taken by `hirz-hirz-1`).
- Root scripts: `mock`, `dev` (placeholder, exits 1), `test`, `typecheck`, `demo` (placeholder), `format`.

**Verification output**
- `npm install && npm test`: contracts `Tests 4 passed (4)`; mock `Test Files 3 passed (3)`, `Tests 12 passed (12)` (fixtures 6, mock 4, hybrid 2). `npm run typecheck` clean.
- `npx @modelcontextprotocol/inspector@2.12.0 --cli http://localhost:8100/mcp --method tools/list`: 18 tools, 17 with `_meta.ui.resourceUri` (`log_bodyweight` has no card). "Schema portability: 0 errors, 17 warnings" — all are `type: ["x","null"]` in output schemas (nullable fields); inputs have none.
- `--method tools/call --tool-name log_meal` with the S1 items: 2 roti 240 kcal, 1 plate chicken karahi 418 kcal [assumed], 1 glass mango lassi 270 kcal; meal 928 kcal; equals the fixture.
- SDK client against the running mock: `protocol: 2025-11-25`; `ELICITATION: Add 14 items, about $63, to your Amazon cart?` → `checkout: confirmed items: 14 total: 63.41`. All 18 tools 1–4 ms per call.
- Hybrid (vitest, stub server with `ping` and an eliciting `ask`): ping returns the stub's `{pong:"stub"}`, fixtures still serve the rest; the stub's elicitation and progress reach the caller.
- `docker rm -f dayform-pg && docker compose up -d --build postgres mock`: both up, postgres healthy, log shows `CREATE EXTENSION` (pg_trgm); mock answered the probe on 8100. `npx tsx smoke/aurora/run.ts --target local` → `PASS: "rotee" -> "roti"`, p50 4 ms. Mock container stopped afterwards (frees 8100 for `npm run mock`); postgres left running.

**Fixture numbers** (placeholders until T-11/T-13 seed and catalog; tests check that they agree with each other): targets 2300 kcal / 160 P / 258 C / 70 F; S1 lunch 928 kcal, day 1438 eaten, 862 left; S2 one roti → lunch 808, day 1318; S3 bench 80 × 8 → e1RM 101.3 (Epley) vs 98.2, +3.2; swap overhead press → landmine press 25 × 10; S4 4-day plan 2340/165/247/72 per day (within ±5%), 14 cart items, 18 packs, $63.41; S5 −150 kcal → 2150, legs, squat 102.5 × 5; S6 bench e1RM 88.7 → 101.3 over 6 weeks.

**Deviations**
- Vitest 3.2.7, not 4/5: npm 10.9.2 crashes resolving vitest 4.x/5.x peers (FRICTION F-010). `npm audit` flags vitest 3.x (`@vitest/mocker`, `tinypool`; dev-only).
- TypeScript 5.9.3, not 7.x (latest on npm is the 7.0 native port; kept the stable compiler).
- Added a `text_input` client event (typed input, D12) and a `/health` route on the mock; not in the ticket list.
- `log_set` uses the `workout` card with an embedded `pr` field (a tool can link only one card); the workout card shows the PR burst.
- Cart fixture ASINs are placeholders (`B0DAYF0C01`…); the Add-to-Cart link will not fill a real cart.
- Also created `tsconfig.json` in contracts and mock, and `mock/Dockerfile` + `mock/Dockerfile.dockerignore` (inside Owns).

**Fallbacks used:** none.

**Orchestrator close-out (2026-10-22):** verified `npm test` (16 passed), typecheck clean, Inspector tools/list 18 tools / 17 cards, S1 log_meal fixture. Decisions: keep vitest 3.2.7; server host port 8001 recorded in DESIGN §9; the mock's `content` text is the JSON dump, acceptable for a mock (T-20 returns short facts). DONE.
