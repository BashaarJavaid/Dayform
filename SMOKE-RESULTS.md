# Smoke Test Results

- **Gate G0 status:** OPEN
- **Rule:** each Wave 0 agent fills in its own section.
- **Status values:**
  - **PASS**
  - **FAIL**
  - **FALLBACK:** name the replacement and its result.

---

## T-00 · AWS access and tooling
- Status:
- Account and region:
- Reasoning model ID (Opus 5.5):
- Fallback reasoning model ID:
- Voice model ID (Nova Sonic):
- CDK bootstrap:
- ARM64 build path (local buildx or CodeBuild):
- Notes:

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
- Status:
- Card renders at 768×480 with live data (yes or no):
- Card-to-tool callback works (yes or no):
- Notes:

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
