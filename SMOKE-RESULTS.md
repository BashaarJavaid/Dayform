# Smoke Test Results

- **Gate G0 status:** OPEN
- **Rule:** each Wave 0 agent fills in its own section.
- **Status values:**
  - **PASS**
  - **FAIL**
  - **FALLBACK:** name the replacement and its result.

---

## T-00 · AWS access and tooling
- Status: BLOCKED (hirz-operator has no Bedrock/CloudFormation/Budgets permissions)
- Account and region: 661550216013, us-east-1, profile `hirz-operator` (sts OK, 2026-10-22)
- Reasoning model ID (D21, Nova): provisional `us.amazon.nova-2-lite-v1:0` (exists, AccessDenied on InvokeModel). Nova 2 Pro: `amazon.nova-2-pro-v1:0` / `us.` prefix rejected as invalid ID; real ID unknown until ListFoundationModels is allowed.
- Fallback reasoning model ID: provisional `us.amazon.nova-pro-v1:0` (exists, AccessDenied). Nova Premier is end-of-life.
- Voice model ID (Nova Sonic): provisional `amazon.nova-2-sonic-v1:0` (not tested); Nova 2.5 Sonic ID unknown.
- CDK bootstrap: not run (awaiting approval, and hirz-operator cannot call CloudFormation). Command: `npx -y aws-cdk@latest bootstrap aws://661550216013/us-east-1`
- ARM64 build path (local buildx or CodeBuild): local, native linux/arm64 (Apple Silicon, buildx v0.32.2). `docker buildx build --platform linux/arm64` of smoke/env/Dockerfile.arm64 built in 5.4 s; container printed `aarch64`.
- Notes: see FRICTION.md F-004. Budget not created (no budgets permission, no contact email readable).

## T-01 · Claude on Bedrock
- Status:
- Model ID used:
- Tool-choice mode that works (`tool` or `auto` + validate):
- Latency p50 / max, test A (text):
- Latency p50 / max, test B (tool use):
- Stream time to first token / total (meal-plan JSON):
- Notes:

## T-02 · Nova Sonic voice
- Status:
- Model ID used:
- Voice chosen:
- End of speech → first audio, p50:
- Text input works (yes or no):
- Reconnect keeps context (yes or no):
- Food-word results: see `smoke/nova-sonic/food-words.md`
- Language used for the relay (Node or Python):
- Notes:

## T-03 · MCP on AgentCore
- Status: BLOCKED (local target PASS; AgentCore deploy waits for IAM permissions on the AWS profile and deploy approval)
- Negotiated protocol version: 2025-11-25 (local container)
- Elicitation round trip (local / AgentCore): accepted / not run
- Ping latency, warm p50 / cold: local Docker 4 ms (first ping 9 ms, initialize 59–167 ms) / AgentCore not run
- Invoke URL format: `https://bedrock-agentcore.us-east-1.amazonaws.com/runtimes/<URL-encoded runtime ARN>/invocations?qualifier=DEFAULT` (from the AgentCore docs; AWS accepted our SigV4 signature on this URL and answered 403 `not authorized to perform: bedrock-agentcore:InvokeAgentRuntime`, so not yet proven end to end)
- Deploy method (starter toolkit, CDK or CloudFormation): CloudFormation (`smoke/agentcore-mcp/template.yaml` + `deploy.sh`), prepared, not run
- Notes:
  - Local run: `docker run -p 18003:8000 dayform-smoke-mcp:local` (host port 8000 is taken by an unrelated container `hirz-hirz-1`); image linux/arm64, 89.6 MB, built natively in 38 s.
  - Client output: `PASS protocol=2025-11-25 tools=2 ping_p50=4ms elicitation=accepted init=99ms first_ping=9ms`.
  - MCP Inspector CLI (`npx @modelcontextprotocol/inspector --cli http://localhost:18003/mcp --method tools/list`) lists `ping` and `confirm_demo` with output schemas; `tools/call ping` returns `structuredContent.server_time`.
  - SigV4 needs `bedrock-agentcore:InvokeAgentRuntime` on the caller. Deploy needs CloudFormation, ECR, IAM (create role, PassRole) and bedrock-agentcore create permissions.
  - Stateful mode is a server choice (session ID generator), not a runtime property (FRICTION F-005).

## T-04 · Aurora + Data API
- Status: BLOCKED (local PASS; Aurora not created: needs AWS permissions for RDS/Secrets Manager and cluster approval)
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
