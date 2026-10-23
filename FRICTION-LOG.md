# Dayform friction log

What blocked or surprised us while building Dayform for Build, Ship, Shape 2026 (Alexa+ track, AWS Builder and Open Source mini challenges). Every entry is a real event from the build on 2026-10-22 and 2026-10-23: the task, the steps, expected vs. actual, severity, the workaround we used, and a suggestion. The raw, unedited log with every entry is [FRICTION.md](FRICTION.md); the product feedback and feature requests are in [SUBMISSION.md](SUBMISSION.md).

*Note: built from `FRICTION.md`; entry IDs match that file. Fourteen entries, strongest first.*

### F-009 · MCP elicitation silently dropped on AgentCore Runtime
- **Tools:** `@modelcontextprotocol/sdk` 1.32.1 (`McpServer`, `StreamableHTTPServerTransport`) on Amazon Bedrock AgentCore Runtime (us-east-1).
- **Task:** confirm a checkout with an elicitation from a stateful MCP server on AgentCore.
- **Steps:** tool handler called `server.server.elicitInput({mode: "form", ...})`; ran the client against AgentCore with `DEBUG=1` to trace every HTTP exchange.
- **Expected:** the `elicitation/create` request reaches the client, as it did against the same container locally.
- **Actual:** `McpError: MCP error -32001: Request timed out`. The trace showed `GET /invocations -> 405` for the client's standalone SSE stream. In the SDK, a server request with no `relatedRequestId` goes to that GET stream and, when none is open, is dropped with no error. CloudWatch had no trace of it.
- **Severity:** major.
- **Workaround:** `server.server.elicitInput(params, { relatedRequestId: extra.requestId })`, so the request rides the tool call's own POST response stream. Elicitation then round-tripped on AgentCore in 230 ms.
- **Suggestion:** SDK: default server-to-client requests inside a tool handler to the current request's stream, or log a warning when one is dropped. AgentCore docs: state that the standalone GET stream returns 405 and that server-to-client requests must use the POST response stream.

### F-013 · Amazon Add-to-Cart link opens an empty cart when signed in
- **Tool:** amazon.com `/gp/aws/cart/add.html` (the legacy Add-to-Cart form from the PA-API docs).
- **Task:** put 3 real products into the user's cart with one link.
- **Steps:** opened `https://www.amazon.com/gp/aws/cart/add.html?ASIN.1=B089BWP51D&Quantity.1=1&ASIN.2=B08P6MF2D9&Quantity.2=2&ASIN.3=B00DX53P4M&Quantity.3=1` signed in (Chrome, 2026-10-22), and signed out; a signed-out curl showed a 302 to `/ap/signin` with `openid.return_to=https://www.amazon.com/associates/addtocart?...`.
- **Expected:** the cart shows the 3 items with quantities 1, 2 and 1.
- **Actual:** signed in, the link lands on the cart page with an empty cart and no message. Signed out, it asks for sign-in first.
- **Severity:** major.
- **Workaround:** use the redirect target directly: `https://www.amazon.com/associates/addtocart?AssociateTag=<tag>&ASIN.1=…&Quantity.1=…`. Verified to fill a signed-in cart with 3 and with 10 items, quantities correct.
- **Suggestion:** document the current Add-to-Cart form, and show an error when items are dropped instead of an empty cart.

### F-014 · Nova Sonic ends the whole session when a tool result is not JSON
- **Tool:** Amazon Bedrock `InvokeModelWithBidirectionalStream`, `amazon.nova-2-5-sonic` (us-east-1).
- **Task:** return an MCP tool result to Sonic as a `toolResult` event (`textInputConfiguration.mediaType: "text/plain"`).
- **Steps:** sent the MCP result's text content. JSON results worked; an error result was the plain string `Error: fetch failed`.
- **Expected:** a `text/plain` tool result accepts any text.
- **Actual:** `ValidationException: RequestId=3a2e4906-34b8-4359-93bf-d37bfd638073 : Tool Response parsing error`, which closes the bidirectional stream, so the session and its context are lost mid-turn.
- **Severity:** major.
- **Workaround:** always send JSON (`structuredContent`, or `{"result": text}` / `{"error": text}`); the backend renews the session with a summary if the stream dies.
- **Suggestion:** document that tool result content must be JSON despite `text/plain`, and reject a bad tool result with an error event instead of ending the session.

### F-015 · Nova Sonic calls dependent tools in parallel and re-requests pending ones
- **Tool:** Amazon Bedrock `InvokeModelWithBidirectionalStream`, `amazon.nova-2-5-sonic` (us-east-1).
- **Task:** "Plan my meal prep for the next four days and add what I need to my cart" with 18 MCP tools; `checkout_cart` waits 2–3 s on a user confirmation (elicitation).
- **Steps:** system prompt names the order: get_daily_summary, plan_meal_prep, add_to_cart, checkout_cart; each result returned to Sonic as its MCP call finished.
- **Expected:** one tool at a time (each depends on the last), or at least no repeats.
- **Actual:** all four `toolUse` events arrived in the same millisecond, before any result. While `checkout_cart` waited for the user, Sonic issued `plan_meal_prep` and `checkout_cart` again (a second confirmation popped up) and started speaking "Please confirm the total…" over the question. A spoken "yes" during the pending tool started a new user turn that re-ran the tools.
- **Severity:** major.
- **Workaround:** the backend runs a turn's tool calls in order, reuses the result for an identical repeat call, holds results until the batch finishes, and routes mic audio to Amazon Transcribe instead of Sonic while a confirmation is pending.
- **Suggestion:** document the parallel tool-call behavior, offer a sequential tool-calling option, and don't re-issue a tool call whose result is pending.

### F-004 · IAM user with sign-in but no service permissions; Nova 2 Pro ID rejected
- **Tools:** AWS IAM, Amazon Bedrock (us-east-1), AWS CLI v2.37.0.
- **Task:** discover and test Nova models with an IAM user profile.
- **Steps:** `aws sts get-caller-identity` (OK); `aws bedrock list-foundation-models --by-provider amazon`; `aws bedrock-runtime converse --model-id <id> ... --inference-config '{"maxTokens":1}'` for several Nova IDs.
- **Expected:** a model list and a one-token reply.
- **Actual:** `AccessDeniedException ... is not authorized to perform: bedrock:ListFoundationModels because no identity-based policy allows the bedrock:ListFoundationModels action`, and the same for InvokeModel, CloudFormation, ECR, S3, Lambda, RDS, Scheduler and AgentCore. `amazon.nova-2-pro-v1:0` and `us.amazon.nova-2-pro-v1:0` returned `ValidationException: The provided model identifier is invalid.`; `us.amazon.nova-premier-v1:0` returned `ResourceNotFoundException: This model version has reached the end of its life.`
- **Severity:** blocker.
- **Workaround:** switched to a profile with permissions; ListFoundationModels then showed no Nova 2 Pro in us-east-1, so Nova 2 Lite became the primary model. Nova Premier is still listed as an inference profile although it is end-of-life.
- **Suggestion:** make "invalid identifier" say whether the model exists in another region or needs an inference profile; stop listing end-of-life profiles.

### F-001 · ext-apps 2.x silently installs a second MCP SDK generation
- **Tools:** `@modelcontextprotocol/ext-apps` 2.0.3 with `@modelcontextprotocol/sdk` 1.32.1 (the latest `sdk` on npm).
- **Task:** build an MCP Apps card server on `@modelcontextprotocol/sdk` and use ext-apps for the card and the host.
- **Steps:** `npm install @modelcontextprotocol/sdk@1.32.1 @modelcontextprotocol/ext-apps@2.0.3 zod`; read the ext-apps README "Getting Started".
- **Expected:** ext-apps works with the current `@modelcontextprotocol/sdk`.
- **Actual:** ext-apps peers on `@modelcontextprotocol/client ^2.0.0`, `core ^2.0.0`, `server ^2.0.0` (optional) and `zod ^4.2.0`. npm installed `client` and `core` 2.3.1 next to `sdk` 1.32.1 without a warning; the `ext-apps/server` helpers are typed against the v2 `McpServer`, and the README never mentions `@modelcontextprotocol/sdk`.
- **Severity:** minor.
- **Workaround:** keep the server on sdk 1.32.1 and pass the v1 server to `registerAppTool`/`registerAppResource` with an `as any` cast (they wrap `registerTool`/`registerResource`); the wire protocol is the same.
- **Suggestion:** state in the README which SDK line ext-apps 2.x targets and whether a v1 `McpServer` is supported.

### F-002 · The smallest MCP Apps card is about 600 KB
- **Tools:** `@modelcontextprotocol/ext-apps` 2.0.3 (`App`), esbuild 0.28.2 (bundled, minified).
- **Task:** build a single-file HTML card with four SVG rings and one button.
- **Steps:** `import { App } from "@modelcontextprotocol/ext-apps"`; esbuild `bundle: true, minify: true`; inlined into one HTML file.
- **Expected:** tens of KB.
- **Actual:** 602,981 bytes. The bundle pulls in zod v4, the MCP core protocol and JSON Schema validators. With React, our 8 cards are 735–758 KB each, and in headless tests a card parsing its bundle dropped animation frames in a neighboring card.
- **Severity:** minor.
- **Workaround:** none needed for the demo; cards load from a local resource.
- **Suggestion:** offer a lightweight view entry point without schema validation for simple cards.

### F-005 · AgentCore stateful MCP is documented only for Python
- **Tools:** Amazon Bedrock AgentCore Runtime docs (MCP), CloudFormation `AWS::BedrockAgentCore::Runtime`.
- **Task:** deploy a stateful TypeScript MCP server with elicitation via CloudFormation.
- **Steps:** read the runtime MCP protocol contract, the MCP stateful features page and the CloudFormation resource reference.
- **Expected:** a runtime property that marks the MCP runtime stateful, and a statement of who mints `Mcp-Session-Id` on `initialize`.
- **Actual:** stateful mode appears only as the FastMCP flag `stateless_http=False`; `ProtocolConfiguration` is a plain string (`MCP | HTTP | A2A | AGUI`). The contract says "Platform returns `Mcp-Session-Id` in the response" without saying whether the platform injects it into the container's `initialize`. All samples are Python.
- **Severity:** minor.
- **Workaround:** the server adopts an `Mcp-Session-Id` that arrives on `initialize` and otherwise mints its own. On AgentCore, the server-minted ID round-trips and keeps the same microVM.
- **Suggestion:** state the session-ID owner for stateful MCP and add a TypeScript SDK sample.

### F-006 · Aurora PostgreSQL 18 is released, but the Data API table stops at 17
- **Tools:** Amazon Aurora PostgreSQL release notes and the RDS Data API support table.
- **Task:** pick the newest PostgreSQL version for a Serverless v2 cluster with the Data API.
- **Steps:** read the release notes (newest 18.6.1 and 17.11.1, 2026-10-15) and the Data API region/version table.
- **Expected:** the table says whether Aurora PG 18 supports the Data API.
- **Actual:** the table covers PostgreSQL 17 ("Version 17.4 and higher") down to 13; PG 18 is not listed as supported or as "Not available".
- **Severity:** minor.
- **Workaround:** chose 17.11, the newest version the table covers (also matches local `postgres:17`).
- **Suggestion:** add a PG 18 column, or state Data API support in each version's release notes.

### F-007 · ConverseStream sends a forced tool's input as one delta at the end
- **Tools:** Amazon Bedrock ConverseStream, Nova 2 Lite and Nova Pro.
- **Task:** stream a ~2,400-token meal-plan JSON through a forced tool and measure time to first token.
- **Steps:** `ConverseStreamCommand` with one tool and `toolChoice.tool`; counted `contentBlockDelta.delta.toolUse.input` events; compared with the same prompt as plain text.
- **Expected:** many partial-JSON deltas, as the `ToolUseBlockDelta` shape implies.
- **Actual:** exactly one delta with the whole JSON. Nova 2 Lite: TTFT 6,436 ms, total 6,438 ms, 1 delta (4,043 chars); plain text TTFT 450 ms with 583 deltas. Nova Pro: 1 delta at 6,912 ms.
- **Severity:** minor.
- **Workaround:** treat forced-tool structured output as non-streaming; run it in the background or the overnight job and return `{status: "preparing"}`.
- **Suggestion:** document whether Nova streams tool input incrementally, or stream partial JSON.

### F-008 · Nova Sonic counts typed input during playback time as barge-in
- **Tool:** Amazon Bedrock `InvokeModelWithBidirectionalStream`, `amazon.nova-2-5-sonic`.
- **Task:** send consecutive typed turns (cross-modal `contentStart` TEXT, role USER, `interactive: true`) in one session.
- **Steps:** sent the next `textInput` 1.5 s after the assistant's `contentEnd` with `stopReason: "END_TURN"`.
- **Expected:** `END_TURN` means the reply is finished.
- **Actual:** every next turn first produced `textOutput` `{ "interrupted" : true }`, and the reply's FINAL text arrived only after the next input. Sonic sends audio faster than real time but keeps the turn open for the audio's play length (232,320 bytes at 24 kHz = 4.8 s); a second `END_TURN` marks the real end.
- **Severity:** minor.
- **Workaround:** wait out the reply's play time (bytes / 48 per ms) before the next turn; the browser stops playback on `interrupted`.
- **Suggestion:** document that the speaking window follows play time, which `END_TURN` marks the true end, and that typed input inside it counts as barge-in.

### F-011 · USDA FNDDS CSV keys nutrients by the legacy number, not `nutrient.id`
- **Tool:** USDA FoodData Central bulk CSV, FNDDS 2024-10-31, compared with SR Legacy 2018-04.
- **Task:** read per-100 g nutrients for SR Legacy and FNDDS foods with one nutrient-id map.
- **Steps:** joined `food_nutrient.csv` to `nutrient.csv` on `nutrient_id = nutrient.id` (Energy 1008, Protein 1003), which works for SR Legacy.
- **Expected:** the same join works for FNDDS.
- **Actual:** every FNDDS food came out at 0 kcal; FNDDS rows carry `nutrient_id` values like `203`, `291`, `305` (the `nutrient_nbr` column), e.g. `"34287544","2707713","203","7.85",...` for roti.
- **Severity:** minor.
- **Workaround:** a second map keyed by `nutrient_nbr` (208 kcal, 203 protein, 205 carbs, 204 fat, ...) for FNDDS.
- **Suggestion:** use `nutrient.id` consistently across datasets, or document the difference in the download README.

### F-003 · amazon.com returns a JavaScript stub to scripted reads
- **Tool:** amazon.com search and product pages (catalog research; PA-API 5 is retired).
- **Task:** find ASINs, prices and stock for shelf-stable grocery items.
- **Steps:** `curl -s --compressed -A "<Chrome UA>" "https://www.amazon.com/s?k=red+lentils&i=grocery..."`, several terms 1.5–6 s apart, no cookie jar.
- **Expected:** the search results HTML (about 1.2 MB).
- **Actual:** HTTP 200 with a 2,671-byte page of `ue_csm` bootstrap JavaScript and no results, on every retry. A curl of the legacy add-to-cart URL returned HTTP 503 "Sorry! Something went wrong!".
- **Severity:** minor.
- **Workaround:** a cookie jar (`curl -c jar -b jar`) returned full pages; all 38 catalog items were read that way. The cart link can only be verified in a real signed-in browser.
- **Suggestion:** with PA-API 5 retired, offer a documented read-only lookup for an ASIN's title, price and availability.

### F-010 · npm 10.9.2 crashes resolving vitest 4.x/5.x peers
- **Tools:** npm 10.9.2 (with Node 23.11.0), vitest 5.0.5 and 4.1.12.
- **Task:** `npm install` a workspace root with vitest as a dev dependency.
- **Steps:** vitest ^5.0.5; clean retry; vitest ^4.1.12; a scratch folder with only vitest.
- **Expected:** vitest installs.
- **Actual:** `npm error Cannot read properties of null (reading 'edgesOut')` in `#loadPeerSet (@npmcli/arborist/lib/arborist/build-ideal-tree.js:1289:38)` after fetching `@vitest/ui`. `--legacy-peer-deps` works; vitest ^3.2.4 works.
- **Severity:** minor.
- **Workaround:** pinned vitest 3.2.7 (dev-only `npm audit` advisories remain).
- **Suggestion:** npm: fail with a message naming the peer set instead of a null dereference. Vitest: state the minimum npm version.

---
