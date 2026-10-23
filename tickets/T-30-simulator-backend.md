# T-30 · Simulator backend

| Field | Value |
|---|---|
| Wave | 3: Simulator and cards |
| Demo importance | HERO (every scene flows through it) |
| Size | L |
| Depends on | T-10 (contracts, mock), T-02 (Sonic relay), T-03 (SigV4 client) |
| Owns | `simulator/backend/` |
| Approval needed | No |
| Status | DONE (live-mic Sonic run is the user's, with T-31) |

## Goal
Build the backend of the simulated Alexa+ device. It hears the user through Nova Sonic, calls tools through a real MCP client, and streams events to the screen.

## Why it matters for the demo
Every scene depends on this loop working fast: user speaks → Alexa chooses tools → cards appear → Alexa speaks. It also produces the tool-call trace that proves the agentic behavior in S4.

## Read first
- [DESIGN.md §2 Architecture](../DESIGN.md#2-architecture), D3, D12, [§9 Environment variables](../DESIGN.md#9-environment-variables), [§10 Services and fallbacks](../DESIGN.md#10-services-and-fallbacks)
- `packages/contracts/`: the simulator events.
- `smoke/nova-sonic/`, `smoke/agentcore-mcp/`, and [SMOKE-RESULTS.md](../SMOKE-RESULTS.md)

## Tasks
1. **WebSocket server** for the frontend. It uses only the contract events.
2. **MCP client:**
   - Streamable HTTP to `MCP_URL`, with auth set by `MCP_AUTH` (`none` or `sigv4`, using the T-03 signer).
   - Read `tools/list` at startup and after reconnect.
   - **Elicitation:** when the server sends `elicitation/create`:
     1. Emit `elicitation_request` to the frontend.
     2. Tell the voice engine to ask the question aloud.
     3. Resolve on whichever comes first: an `elicitation_response` click, or a spoken yes or no in the next user transcript.
   - **Progress:** turn progress notifications and log messages into `progress` events.
3. **Voice engine interface.** `VOICE_ENGINE` selects one of three engines:
   - **`sonic`** (default), from the T-02 code:
     - **System prompt:**
       - "You are Alexa."
       - "Use tools for every fitness fact."
       - "Say only numbers that come from tool results."
       - "Keep replies to 1–2 sentences."
       - "Say the assumptions a tool returns."
       - "When a request needs several tools, call them in order without asking."
     - Turn the MCP `tools/list` into Sonic tool specs.
     - When Sonic asks for a tool, call `tools/call` on the MCP server. Return the tool result to Sonic: the `content` text plus the key `structuredContent` fields.
     - Renew the session at about 7 minutes, carrying a short summary into the new one.
     - Accept typed input in the same session.
   - **`pipeline`:** Amazon Transcribe streaming → Claude (Converse with the same tools) → Amazon Polly.
   - **`text`:** typed input → Claude (Converse with tools) → Polly voice, or silence.
4. **Tool trace.** Emit `tool_call_started` and `tool_call_finished` with name, arguments, latency, status and a short result summary.
5. **Cards.** When a tool result has `_meta.ui.resourceUri`, read the resource (cache it by URI). Emit `card` with the HTML and the tool's `structuredContent`.
6. **Admin proxy.** Forward reset, advance-day and timer-speed from the frontend to the server admin routes, with `ADMIN_TOKEN`.
7. **Turn timing.** Log end of speech → first audio, tool time and total time for each turn. Send them to the frontend's demo panel.
8. **Mock first.** It must work with the mock (T-10) from the start. Switching to the real server is one env change (`MCP_URL`).

## Acceptance criteria
- [ ] With the mock, in text mode, each line from S1–S6 produces the expected tool calls and cards.
- [ ] Voice mode does the same for S1 and S3.
- [ ] Elicitation resolves from a click and from a spoken "yes".
- [ ] Session renewal keeps context: after a forced renewal, "make that one roti" still corrects the last meal.
- [ ] `VOICE_ENGINE=pipeline` and `VOICE_ENGINE=text` both run S1.
- [ ] Turn timings are logged.

## Test scenario
1. Run `npm run mock` and `npm run sim:backend` with `VOICE_ENGINE=text`.
2. Send the typed S1 line through a test WebSocket client (`npm run sim:probe -- "I had two rotis, chicken karahi and a mango lassi"`). Expect `tool_call_started log_meal`, `tool_call_finished`, a `card` event for `meal-logged`, and an `alexa_transcript`.
3. Send the S4 line. Expect, in order: `get_daily_summary`, `plan_meal_prep`, `add_to_cart`, `checkout_cart`. Then expect `elicitation_request`. Send `elicitation_response {confirm:true}`. Expect a cart card with a link.

## Fallbacks
- **Voice:** the engines in task 3, in the order sonic → pipeline → text. The fallback order for each service is in DESIGN.md §10.
- **AgentCore slow or down:** set `MCP_URL` to the local server.

## Result
**Built** (`simulator/backend/`, about 1,060 lines):
- `src/main.ts`: WebSocket on **port 8300** (`SIM_PORT`), contract events only, client events zod-checked; every connected client sees every event; the engine starts with the first client and stops with the last. Elicitation broker. HTTP admin proxy `/admin/{reset,advance-day,timer-speed,status}` → `ADMIN_URL` (default: the MCP_URL origin) with `Authorization: Bearer ADMIN_TOKEN`. `/health`.
- `src/mcp.ts`: SDK 1.32.1 Client + Streamable HTTP, `MCP_AUTH=sigv4` uses the T-03 signer; elicitation capability and handler; progress and log notifications → `progress`; `tools/list` at start and on reconnect (a session error reconnects once and retries); `tool_call_started`/`tool_call_finished` with a one-line summary; `card` with html (read once per URI) + structuredContent.
- `src/engines/sonic.ts` (default): the T-02 relay with the MCP tools. Session renews at `SONIC_RENEW_AFTER_S` (420) with a summary; renewals debounced (at most one every 2 s). Falls back to `VOICE_MODEL_FALLBACK_ID` only on a model-access error. Typed input waits until Alexa finishes talking (F-008). Sonic's tool calls run one after another; a repeated call in the same turn reuses the first result; results are held until the batch finishes (F-015). Tool results are always JSON (F-014). While an elicitation waits, mic audio goes to Transcribe for the yes or no. If a turn stalls for 8 s, the turn ends and the session renews.
- `src/engines/converse.ts`: `text` (Nova 2 Lite Converse with the MCP tools → Polly Joanna, or silence if Polly fails) and `pipeline` (the same, with Transcribe streaming in front).
- `src/probe.ts`: `npm run sim:probe -- [--audio] [--say-yes|--decline] [--gap s] "<line>" ...`. `--audio` speaks each line as 16 kHz `audio_in` (Polly) to test the mic path without a mic.
- System prompt: the six ticket lines, plus "Dayform is one word", the program day names, "two rotis = roti ×2", the S4 tool order with "say the link is on screen once confirmed", and "under 30 words, no lists or links".

**Verified 2026-10-22, against the mock (`npm run mock`):**
- `text`: S1, S2 (in the same session), S3 (4 lines), S4, S5 and S6 each made the expected tool call(s) and card. S4: get_daily_summary → plan_meal_prep → add_to_cart → checkout_cart → `elicitation_request` → click → cart card `checkout.status=confirmed` with link `https://www.amazon.com/associates/addtocart?AssociateTag=dayform-20&ASIN.1=…`. Typed "yes" resolves it too.
- `sonic`, typed: S1, S2, S3 (start, log_set, swap), S4 (click), S5 and S6 all right. Tool turns: 0.7–1.9 s to first audio.
- `sonic`, voice (Polly audio through `audio_in`): S1 and S3 right. S4 with a spoken "yes" (heard by Transcribe as "Yes,") resolved the elicitation; 4 tool calls; first audio 0.9 s; turn total 14.7 s.
- Renewal: `SONIC_RENEW_AFTER_S=20`, S1, wait 25 s (`[sonic] renewed (20s elapsed); summary lines=4`), then "Actually, make that one roti." → `correct_meal {set_quantity roti 1}`.
- `pipeline`, voice: S1 → Transcribe "I had two rotas, chicken karahi and a mango lossi" → `log_meal` + meal-logged card.
- Turn timing is in the log and in a `progress` event: `Turn: first audio 2794 ms · 1 tool call(s) 34 ms · total 19101 ms`.
- `MCP_URL=MCP_URL_AGENTCORE MCP_AUTH=sigv4`: connected, protocol 2025-11-25, 2 tools (the smoke runtime). `MCP_URL=http://localhost:8001/mcp`: 19 tools. Admin proxy → :8001 `/admin/status` 200 and `/admin/timer-speed {10}` ok.

**Deviations:**
- No contract event exists for turn timing, so it rides `progress` (`call_id: null`). Proposal: add a `turn_timing` event.
- In Sonic mode, Polly (Joanna) speaks the elicitation question, because Sonic is blocked waiting for the tool result.
- Tool specs come from `tools/list` `inputSchema` (the SDK's JSON Schema of the zod inputs) instead of calling `z.toJSONSchema` on the contracts, so forwarded and new tools work too.
- New env names not in DESIGN §9: `SIM_PORT`, `ADMIN_URL`, `SONIC_RENEW_AFTER_S`, `SONIC_DEBUG`, `SIM_URL` (probe).

**Fallbacks used:** none (Nova 2.5 Sonic worked).

**Orchestrator close-out (2026-10-22):** verified sim:probe in text mode against the real server: S1 → log_meal, meal-logged card, Alexa reply with 970 kcal left; S4 → plan_meal_prep → add_to_cart → checkout_cart, elicitation "Add 12 items, about $112" spoken and answered, cart card with the link. Nova sometimes skips get_daily_summary in S4 (3 tools instead of 4); acceptable. Env names added to DESIGN §9. DONE.
