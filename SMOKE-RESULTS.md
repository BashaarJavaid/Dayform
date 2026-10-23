# Smoke Test Results

- **Gate G0 status:** OPEN
- **Rule:** each Wave 0 agent fills in its own section.
- **Status values:**
  - **PASS**
  - **FAIL**
  - **FALLBACK:** name the replacement and its result.

---

## T-00 · AWS access and tooling
- Status: REVIEW. Every check.sh line PASSes except the CDK bootstrap. The user approved it, but the Claude Code auto-mode classifier blocked the command, so it has to be run by hand.
- Account and region: 661550216013, us-east-1, profile `hirz-login` (root; user decision 2026-10-22). `hirz-operator` has no service permissions (FRICTION.md F-004).
- Reasoning model ID (D21, Nova): `us.amazon.nova-2-lite-v1:0`. Nova 2 Pro is not listed in us-east-1, so the first fallback is used. Availability: AUTHORIZED/AVAILABLE. 1-token Converse: stopReason max_tokens, 377 ms.
- Fallback reasoning model ID: `us.amazon.nova-pro-v1:0`. Availability: AUTHORIZED/AVAILABLE. 1-token Converse: 397 ms. Nova Premier is listed as a `us.` profile but returns "end of its life" on Converse.
- Voice model ID (Nova Sonic): `amazon.nova-2-5-sonic` (Nova 2.5 Sonic, ON_DEMAND). Fallback: `amazon.nova-2-sonic-v1:0`. Both AUTHORIZED/AVAILABLE in us-east-1. No stream test yet (T-02 does that).
- CDK bootstrap: the CDKToolkit stack does not exist yet ("Stack with id CDKToolkit does not exist"). Waiting for approval: `npx -y aws-cdk@latest bootstrap aws://661550216013/us-east-1`
- ARM64 build path (local buildx or CodeBuild): local, using native linux/arm64 (Apple Silicon, buildx v0.32.2). Building smoke/env/Dockerfile.arm64 with `docker buildx build --platform linux/arm64` took 5.4 s, and the container printed `aarch64`.
- Budget: `dayform-50` created 2026-10-22: USD 50 per month, alert by email at 80% of actual spend. Checked with describe-budget and describe-notifications-for-budget.
- Orchestrator (2026-10-22): CDKToolkit bootstrapped; check.sh 8/8 PASS. **Status: PASS.**

## T-01 · Reasoning model on Bedrock (Nova, D21)
- Status: PASS (2026-10-22, `npx tsx smoke/bedrock-claude/run.ts`)
- Model ID used: `us.amazon.nova-2-lite-v1:0` (primary; every test passed, so the full suite did not need the fallback). A probe confirmed the fallback `us.amazon.nova-pro-v1:0` also accepts forced tool and streaming.
- Tool-choice mode that works: `tool` (`toolChoice: {tool: {name}}`). `any` and `auto` also work. The Nova 2 guide lists all three: "Tool: The specified tool will be called once, ideal for structured output use cases" (https://docs.aws.amazon.com/nova/latest/nova2-userguide/using-tools.html). T-20 copies a forced tool plus zod as its structured-output path.
- Latency p50 / max, test A (text): 638 / 814 ms
- Latency p50 / max, test B (tool use, `auto`, 5/5 zod-valid): 704 / 725 ms
- Stream time to first token / total (meal-plan JSON, forced tool, 2,416 output tokens): 10,783 / 10,786 ms
- Notes:
  - Nova sends a forced tool's input as **one** stream delta at the end, so TTFT is about the same as the total (F-007). For comparison, plain text streams with a TTFT of 450 ms. Plan generation of about 11 s must run in the background or the overnight job.
  - JSON without tools (schema in the system prompt) parsed and validated, but the model wrapped it in ```` ``` ```` fences despite being told not to. Use a forced tool instead.
  - Even the plain-text path is about 600–700 ms, over the 500 ms tool budget, which confirms that confident paths must make no LLM call (§7).
  - Test D used maxTokens=10000 and the model stopped on its own (`stopReason=tool_use`).
- Orchestrator re-run (2026-10-22): A, B, C PASS twice; D PASS once and FAIL once on BOTH Nova 2 Lite and Nova Pro (plan returned fewer than 4 days). Treat the forced-tool JSON for long plans as unreliable in shape: T-25 must validate and retry (its 3-round loop), and the overnight job must not assume one-shot success.

## T-02 · Nova Sonic voice
- Status: BLOCKED (typed path PASS end to end; the voice round trip, voice choice and food-word test need the user's mic session, see `smoke/nova-sonic/README.md`)
- Model ID used: `amazon.nova-2-5-sonic` (ACTIVE and AUTHORIZED in us-east-1 via `get-foundation-model-availability`, profile `hirz-login`; ID from the AWS sample repo's Nova 2.5 migration guide). Fallback `amazon.nova-2-sonic-v1:0` also works (same test PASS).
- Voice chosen: not yet (user step; tiffany is the default; tiffany and matthew both work on the typed path)
- End of speech → first audio, p50: voice not measured (user step). Proxy, typed turn → first audio byte incl. one `log_meal_stub` round trip, 5 turns: Nova 2.5 p50 646 ms [1016, 575, 646, 732, 634] (second run 636 ms); Nova 2 p50 1232 ms [2144, 1552, 1165, 1232, 1215]. First turn per session is the slowest (cold).
- Text input works (yes or no): yes (cross-modal `contentStart` TEXT/USER `interactive: true` in the same session as the open audio stream)
- Reconnect keeps context (yes or no): yes on the typed path, both forced and the automatic 60 s restart: after a new session with a code-built summary in the system prompt, "What was the first thing I told you I ate?" → "The first thing you told me you ate was two eggs."
- Food-word results: see `smoke/nova-sonic/food-words.md` (template; user step). Typed food words came back as tool items `rotis`, `chicken karahi`, `mango lassi`.
- Language used for the relay (Node or Python): Node/TypeScript (`@aws-sdk/client-bedrock-runtime` + `NodeHttp2Handler`, `ws`), ported from the AWS websocket-nodejs sample.
- Notes:
  - `npx tsx test-text.ts` output: `tool log_meal_stub with eggs: yes {"items":[{"food":"eggs","quantity":2}]}`, `audio bytes total: 944640`.
  - The relay sends 32 ms silence frames when the mic is idle, so typed-only sessions keep the audio stream alive.
  - Next input inside the reply's play time counts as barge-in (FRICTION F-008).

## T-03 · MCP on AgentCore
- Status: BLOCKED (AgentCore deployed; protocol, session and ping PASS; elicitation failed on the first image, fix proven locally, waits for a user redeploy)
- Negotiated protocol version: 2025-11-25 (local and AgentCore)
- Elicitation round trip (local / AgentCore): accepted / timed out on image `t03` (`McpError -32001 Request timed out`, FRICTION F-009). Cause: server sent the elicitation on the standalone GET stream; AgentCore answers GET with 405. Fixed in server.ts (`relatedRequestId`), PASS locally with GET disabled; AgentCore rerun pending.
- Ping latency, warm p50 / cold: AgentCore from the laptop: warm p50 123 ms (second run 125 ms), first ping 137–142 ms, initialize 741–748 ms (new session, new microVM). Local Docker: 3–4 ms.
- Invoke URL format: `https://bedrock-agentcore.us-east-1.amazonaws.com/runtimes/<URL-encoded runtime ARN>/invocations?qualifier=DEFAULT`, SigV4 service `bedrock-agentcore`. Runtime ARN `arn:aws:bedrock-agentcore:us-east-1:661550216013:runtime/dayform_smoke_mcp-mfaMgSF843` (in .env.local as AGENTCORE_RUNTIME_ARN / MCP_URL_AGENTCORE).
- Deploy method (starter toolkit, CDK or CloudFormation): CloudFormation L1 `AWS::BedrockAgentCore::Runtime` via `smoke/agentcore-mcp/deploy.sh` + `template.yaml` (stack `dayform-smoke-agentcore-mcp`; two passes on first deploy: ECR repo + role, push linux/arm64 image, then runtime). Run by the user with profile `hirz-login`; runtime READY, protocol MCP, network PUBLIC.
- Notes:
  - Session: `mcp-session-id` equals `x-amzn-bedrock-agentcore-runtime-session-id` on every response; the server-minted ID round-trips and keeps the same microVM (tools/list and 10 pings in one session).
  - AgentCore returns `405` to the client's standalone `GET` SSE stream. Every server-to-client request must ride a POST response stream (applies to T-20/T-26 checkout elicitation).
  - CloudWatch `/aws/bedrock-agentcore/runtimes/dayform_smoke_mcp-mfaMgSF843-DEFAULT` holds only the startup line `MCP server: http://0.0.0.0:8000/mcp` (12 starts over the runs, one per session plus platform starts); the server logs no request lines, so the dropped elicitation left no trace there.
  - Fallback `CHECKOUT_CONFIRM=tool` not recorded: root cause found and fixed; decide after the redeploy rerun.
  - Local run: host port 18003 (8000 is taken by unrelated container `hirz-hirz-1`).
- Orchestrator (2026-10-22, after redeploy of tag t03b with the relatedRequestId fix): `PASS protocol=2025-11-25 tools=2 ping_p50=118ms elicitation=accepted init=790ms first_ping=126ms` against AgentCore. Elicitation round trip on AgentCore: 230 ms. **Status: PASS.** Console screenshot for S7 still to be taken by the user.

## T-04 · Aurora + Data API
- Status: BLOCKED (local PASS; cluster approved 2026-10-22, but the create call was refused by the agent permission classifier; not created)
- Engine version: local `postgres:17` = PostgreSQL 17.11. Aurora planned: aurora-postgresql 17.11 (newest version in the Data API support table; Aurora PG 18.6 exists but the table has no PG 18 column, FRICTION F-006).
- Data API p50 from the laptop: not measured (no cluster). Local node-postgres p50=4ms (min 3, max 9, n=20).
- Data API from an AWS role (yes or no): not tested.
- Trigram results ("rotee" → ?): local "roti" first (0.375), then missi roti, makki ki roti, tandoori roti. "chiken karahi" → chicken karahi (0.706). "biryani" → beef/egg biryani (0.667; the list has no plain "biryani").
- DB library chosen: Drizzle ORM 0.45.4, `drizzle-orm/node-postgres` (pg 8.23.1) for local, `drizzle-orm/aws-data-api/pg` (@aws-sdk/client-rds-data 3.1156.0) for Aurora; both drivers present in 0.45.4, same `sql` query code for both. Data API path written, not yet run.
- Notes:
  - Run: `npx tsx smoke/aurora/run.ts --target local|aurora`. Local container `dayform-pg` on 127.0.0.1:5433, `DATABASE_URL` in `.env.local`.
  - Cluster script: `smoke/aurora/create-cluster.sh check|create|wait|env|teardown` (min 0.5 / max 4 ACU, `--enable-http-endpoint`, `--manage-master-user-password`, one `db.serverless` instance, default VPC).
  - The ticket's `ORDER BY similarity(...)` query does not use the GIN index (seq scan); fine at 1,500 rows. Add `WHERE name % :q` if the index is needed.
  - Fallback not yet triggered; local Postgres (fallback 3) already works.

## T-05 · Amazon cart link
- Status: BLOCKED (waiting for the user's cart check, steps in `smoke/amazon-cart/README.md`)
- 3-item link fills the cart (yes or no): not yet run (`smoke/amazon-cart/link-3.txt`)
- 10-item link fills the cart (yes or no): not yet run (`smoke/amazon-cart/link-10.txt`)
- User clicks needed: not yet run
- Flow screenshots: `smoke/amazon-cart/screens/`
- Notes: 13 ASINs read 2026-10-22 from amazon.com product pages, all In Stock, shipped and sold by Amazon (table in `smoke/amazon-cart/README.md`). Link builder: `npx tsx smoke/amazon-cart/build-link.ts ASIN:QTY ...`. A signed-out curl of the add.html link returned HTTP 503 "Sorry! Something went wrong!" (bot response, not conclusive; browser test needed). No fallback used yet.

## T-06 · MCP Apps card
- Status: PASS
- Card renders at 768×480 with live data (yes or no): yes. Headless Chrome screenshot `smoke/mcp-apps/shots/1-rendered.png` shows the four rings with the `show_rings` values (1420/2300 kcal, 96/160 g, 150/250 g, 41/70 g); iframe box measured 768×480.
- Card-to-tool callback works (yes or no): yes. Card button → `app.callServerTool` → host `AppBridge.oncalltool` → MCP `tools/call log_water_stub {"ml":250}`; server log printed `[log_water_stub] called with ml=250`; card showed "Logged 250 ml" (`shots/2-after-water-click.png`).
- Notes:
  - Versions: `@modelcontextprotocol/sdk` 1.32.1 (server + host client), `@modelcontextprotocol/ext-apps` 2.0.3. Negotiated protocol 2025-11-25.
  - App resource MIME type (from `RESOURCE_MIME_TYPE`): `text/html;profile=mcp-app`. `registerAppTool` writes both `_meta.ui.resourceUri` and the legacy `_meta["ui/resourceUri"]`.
  - Card comes from `resources/read` (server reads `dist/rings.html` per request); single file, 602,981 bytes, no external requests.
  - `show_rings` tools/call took 4–5 ms from the browser host.
  - ext-apps 2.x peers on the split SDK v2 packages (FRICTION F-001); v1 server works with an `as any` cast on the helper calls. Decision for T-20/T-32: stay on sdk 1.32.1 or move to v2 `@modelcontextprotocol/server` 2.3.1.
  - Host uses a single `sandbox="allow-scripts"` iframe with `srcdoc`, not the double-iframe sandbox proxy from the ext-apps basic-host.
  - Fallback (native React cards) not needed.

## T-07 · Scheduler + Lambda
- Status:
- Manual invoke writes a row (yes or no):
- Scheduled invoke fires (yes or no):
- Notes:

---

## Gate G0 decision

The orchestrator fills this in.

- Date:
- User approval:
- Chosen services: copied into [DESIGN.md §10](DESIGN.md#10-services-and-fallbacks)
- Open risks:
