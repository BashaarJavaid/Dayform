# T-30 · Simulator backend

| Field | Value |
|---|---|
| Wave | 3: Simulator and cards |
| Demo importance | HERO (every scene flows through it) |
| Size | L |
| Depends on | T-10 (contracts, mock), T-02 (Sonic relay), T-03 (SigV4 client) |
| Owns | `simulator/backend/` |
| Approval needed | No |
| Status | TODO |

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
_The agent fills this in._
