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
- Notes: see FRICTION.md F-001. Budget not created (no budgets permission, no contact email readable).

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
- Status:
- Negotiated protocol version:
- Elicitation round trip (local / AgentCore):
- Ping latency, warm p50 / cold:
- Invoke URL format:
- Deploy method (starter toolkit, CDK or CloudFormation):
- Notes:

## T-04 · Aurora + Data API
- Status:
- Engine version:
- Data API p50 from the laptop:
- Data API from an AWS role (yes or no):
- Trigram results ("rotee" → ?):
- DB library chosen:
- Notes:

## T-05 · Amazon cart link
- Status:
- 3-item link fills the cart (yes or no):
- 10-item link fills the cart (yes or no):
- User clicks needed:
- Flow screenshots: `smoke/amazon-cart/screens/`
- Notes:

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
