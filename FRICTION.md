# Friction Log (raw)

Add an entry each time a tool, SDK or AWS service blocks you or surprises you. Write it when it happens, while the details are fresh. T-52 turns these entries into the Devpost friction log, which is worth up to a 10% judging bonus. Specific entries score best: name the tool, the exact step and the exact error.

## Entry template

```
### F-NNN · <short title>
- Tool / service:
- Ticket:
- Task attempted:
- Steps taken:
- Expected:
- Actual (exact error text if any):
- Severity: blocker | major | minor
- Workaround:
- Suggestion to the tool's team:
```

## Entries

### F-001 · ext-apps 2.x needs the split MCP SDK v2 packages, not `@modelcontextprotocol/sdk`
- Tool / service: `@modelcontextprotocol/ext-apps` 2.0.3 with `@modelcontextprotocol/sdk` 1.32.1
- Ticket: T-06
- Task attempted: Build an MCP Apps card server on the `@modelcontextprotocol/sdk` package (`npm view @modelcontextprotocol/sdk version` → 1.32.1, the latest) and use ext-apps for the card and host.
- Steps taken: `npm install @modelcontextprotocol/sdk@1.32.1 @modelcontextprotocol/ext-apps@2.0.3 zod`; read ext-apps `package.json` and README "Getting Started".
- Expected: ext-apps works with the current `@modelcontextprotocol/sdk`.
- Actual: ext-apps 2.0.3 declares `peerDependencies` `@modelcontextprotocol/client ^2.0.0`, `@modelcontextprotocol/core ^2.0.0`, `@modelcontextprotocol/server ^2.0.0` (optional), `zod ^4.2.0`. npm silently installed `client` 2.3.1 and `core` 2.3.1 next to `sdk` 1.32.1, so two SDK generations sit in one tree. `ext-apps/server` helpers are typed against the v2 `McpServer`; the README installs v2 packages only and never mentions `@modelcontextprotocol/sdk`. No install error was printed.
- Severity: minor
- Workaround: Server stays on sdk 1.32.1; `registerAppTool`/`registerAppResource` are thin wrappers over `registerTool`/`registerResource`, so they work at runtime when the v1 server is passed with an `as any` cast. Host uses `AppBridge(null, ...)` with `oncalltool` forwarding to a v1 `Client`. Wire protocol is the same.
- Suggestion to the tool's team: State in the README which SDK line ext-apps 2.x targets and whether v1 `McpServer` is supported; an npm warning on peer mismatch would help.

### F-002 · Smallest ext-apps View bundle is about 600 KB
- Tool / service: `@modelcontextprotocol/ext-apps` 2.0.3 (`App` from the package root), esbuild 0.28.2, bundled + minified
- Ticket: T-06
- Task attempted: Build a single-file HTML card (four SVG rings and one button) with the ext-apps app-side API.
- Steps taken: `import { App } from "@modelcontextprotocol/ext-apps"`; esbuild `bundle: true, minify: true`; inline into one HTML file.
- Expected: A small card (tens of KB).
- Actual: `dist/rings.html` is 602,981 bytes; the bundle pulls in zod v4, the MCP core protocol and JSON Schema validators (it contains `json-schema.org` draft IDs and a `github.com/cfworker` string; none are fetched).
- Severity: minor
- Workaround: None needed for the smoke; it rendered within the 3 s wait on localhost. Size not measured for Echo Show load time.
- Suggestion to the tool's team: Offer a lightweight View entry point without schema validation for simple cards.

### F-004 · Operator IAM user can sign in but has no service permissions; Nova 2 Pro ID rejected
- Tool / service: AWS IAM + Amazon Bedrock (us-east-1), AWS CLI v2.37.0
- Ticket: T-00
- Task attempted: discover and test Nova models with profile `hirz-operator` (IAM user, `aws login`).
- Steps taken: `aws sts get-caller-identity` (OK); `aws bedrock list-foundation-models --by-provider amazon --region us-east-1`; `aws bedrock-runtime converse --model-id <id> ... --inference-config '{"maxTokens":1}'` for several Nova IDs.
- Expected: model list and a one-token reply.
- Actual: `AccessDeniedException ... is not authorized to perform: bedrock:ListFoundationModels because no identity-based policy allows the bedrock:ListFoundationModels action`. Same AccessDenied for bedrock:ListInferenceProfiles, bedrock:InvokeModel (us.amazon.nova-2-lite-v1:0, amazon.nova-2-lite-v1:0, us.amazon.nova-pro-v1:0), cloudformation:DescribeStacks, budgets:ViewBudget, account:GetContactInformation, ecr, s3, lambda, rds, scheduler, codebuild, bedrock-agentcore, iam. `amazon.nova-2-pro-v1:0` and `us.amazon.nova-2-pro-v1:0` return `ValidationException: The provided model identifier is invalid.` `us.amazon.nova-premier-v1:0` returns `ResourceNotFoundException: This model version has reached the end of its life.`
- Severity: blocker
- Workaround: the user switched to the root profile `hirz-login` (2026-10-22). With it, ListFoundationModels shows no Nova 2 Pro in us-east-1 (Nova 2 Lite is the strongest), and Nova Premier is still listed as an inference profile even though it is end-of-life.
- Suggestion to the tool's team: the "invalid identifier" error could say whether the model exists in another region or needs an inference profile.

### F-003 · amazon.com search pages intermittently return a JS stub to scripted reads
- Tool / service: amazon.com (website, product research for the cart catalog)
- Ticket: T-05
- Task attempted: Find ASINs for shelf-stable grocery items by reading amazon.com search and product pages with curl (browser user agent), since PA-API 5 is retired and no public cart/catalog API is left.
- Steps taken: `curl -s --compressed -A "<Chrome UA>" "https://www.amazon.com/s?k=red+lentils&i=grocery&rh=p_6%3AATVPDKIKX0DER"`, several terms 1.5–6 s apart, without a cookie jar.
- Expected: The search results HTML (about 1.2 MB).
- Actual (exact error text if any): HTTP 200 with a 2,671-byte page holding only `ue_csm` bootstrap JavaScript and no results, on every retry. Separately, `curl` of `https://www.amazon.com/gp/aws/cart/add.html?ASIN.1=...` returned HTTP 503 with `<title>Sorry! Something went wrong!`.
- Severity: minor
- Workaround: Keep a cookie jar (`curl -c jar -b jar`); with it every search and product page returned full HTML. The Add-to-Cart link can only be verified in a real browser by the user.
- Suggestion to the tool's team: With PA-API 5 retired, offer a documented read-only way to look up a grocery ASIN's title, price and availability, and document whether the Add-to-Cart form link is still supported.

### F-006 · Aurora PostgreSQL 18 is released, but the Data API version table stops at 17
- Tool / service: Amazon Aurora PostgreSQL + RDS Data API docs (us-east-1)
- Ticket: T-04
- Task attempted: pick "the newest PostgreSQL version Aurora offers" for a Serverless v2 cluster with the Data API turned on.
- Steps taken: read the release notes (https://docs.aws.amazon.com/AmazonRDS/latest/AuroraPostgreSQLReleaseNotes/AuroraPostgreSQL.Updates.html: newest 18.6.1 and 17.11.1, 2026-10-15) and the Data API support table (https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Concepts.Aurora_Fea_Regions_DB-eng.Feature.Data_API.html). Tried `aws rds describe-db-engine-versions --engine aurora-postgresql` to check.
- Expected: the Data API table to say whether Aurora PG 18 supports the Data API.
- Actual: the table has columns for Aurora PostgreSQL 17 ("Version 17.4 and higher") down to 13 only; PG 18 is not mentioned, neither supported nor "Not available". The CLI check failed: `AccessDenied ... not authorized to perform: rds:DescribeDBEngineVersions` (see F-004, T-00 permissions).
- Severity: minor
- Workaround: chose 17.11, the newest version the Data API table covers (also matches local `postgres:17`). `ENGINE_VERSION` can be overridden in `smoke/aurora/create-cluster.sh`.
- Suggestion to the tool's team: add a PG 18 column to the Data API table, or list Data API support in each version's release notes.

### F-005 · AgentCore stateful MCP docs only cover Python `stateless_http=False`; no runtime-level stateful setting
- Tool / service: Amazon Bedrock AgentCore Runtime docs (MCP), CloudFormation `AWS::BedrockAgentCore::Runtime`
- Ticket: T-03
- Task attempted: Deploy a stateful TypeScript MCP server (`@modelcontextprotocol/sdk` 1.32.1) with elicitation on AgentCore via CloudFormation.
- Steps taken: read https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-mcp-protocol-contract.html, https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/mcp-stateful-features.html and https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-bedrockagentcore-runtime.html.
- Expected: a runtime property that marks the MCP runtime stateful, and a statement of whether the platform or the server mints `Mcp-Session-Id` on `initialize` in stateful mode.
- Actual: stateful mode is described only as the FastMCP flag `stateless_http=False`; `ProtocolConfiguration` is a plain string (`MCP | HTTP | A2A | AGUI`) with no stateful option. The contract says for stateful "Platform returns `Mcp-Session-Id` in the response" without saying whether the platform injects it into the container's `initialize` request. All samples are Python; none for the TypeScript SDK.
- Severity: minor
- Workaround: server.ts adopts an `Mcp-Session-Id` that arrives on `initialize` and otherwise mints its own, so it works either way. Unverified on AgentCore until deploy is approved.
- Suggestion to the tool's team: state the session-ID owner for stateful MCP explicitly and add a TypeScript SDK sample.

### F-007 · ConverseStream sends a forced tool's input as one delta at the end, so streaming gives no early tokens
- Tool / service: Amazon Bedrock ConverseStream, Nova 2 Lite (`us.amazon.nova-2-lite-v1:0`) and Nova Pro (`us.amazon.nova-pro-v1:0`)
- Ticket: T-01
- Task attempted: Stream a ~2,400-token 4-day meal-plan JSON through a forced tool (`toolChoice: {tool: {name}}`) and measure time to first token.
- Steps taken: `ConverseStreamCommand` with one tool and `toolChoice.tool`; counted `contentBlockDelta.delta.toolUse.input` events. Compared with the same prompt and no tools (text deltas).
- Expected: `toolUse.input` arrives as many partial-JSON deltas while the model generates, as the Converse docs' `ToolUseBlockDelta` shape implies (https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_ToolUseBlockDelta.html).
- Actual: no error, but exactly one `toolUse.input` delta carrying the whole JSON. Nova 2 Lite: forced tool TTFT 6,436 ms, total 6,438 ms, 1 delta (4,043 chars); plain text TTFT 450 ms, total 9,004 ms, 583 deltas. Nova Pro: forced tool 1 delta at 6,912 ms; text TTFT 746 ms, 356 deltas. In the T-01 meal-plan run, TTFT 10,783 ms against a total of 10,786 ms.
- Severity: minor
- Workaround: Treat forced-tool structured output as non-streaming: run it in the background or the overnight job with `{status: "preparing"}`. Use text streaming only where early tokens matter.
- Suggestion to the tool's team: Document whether Nova streams tool input incrementally, or stream partial JSON as other Bedrock models do.

### F-008 · Nova Sonic treats typed input during "playback time" as barge-in, though the audio was already fully sent
- Tool / service: Amazon Bedrock `InvokeModelWithBidirectionalStream`, `amazon.nova-2-5-sonic` (us-east-1)
- Ticket: T-02
- Task attempted: send consecutive typed turns (cross-modal `contentStart` type `TEXT`, role `USER`, `interactive: true`) in one session from a Node relay.
- Steps taken: sent the next `textInput` 1.5 s after the assistant's `contentEnd` with `stopReason: "END_TURN"`, per https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-input-events.html.
- Expected: `END_TURN` means the reply is finished, so the next turn starts cleanly.
- Actual: every next turn first produced `textOutput` with content `{ "interrupted" : true }`, and the reply's `FINAL` text arrived only after the next input. Sonic sends audio faster than real time but keeps the turn "open" for the audio's play length (232,320 bytes at 24 kHz = 4.8 s); a second `contentEnd` with `END_TURN` (after the `FINAL` text) arrives at that point.
- Severity: minor
- Workaround: the test client waits out the reply's play time (bytes / 48 per ms) before the next turn; the browser stops playback on `interrupted`.
- Suggestion to the tool's team: document that the speaking window follows play time, which `END_TURN` event marks the true end, and that typed input inside that window counts as barge-in.

### F-009 · Elicitation silently dropped on AgentCore: SDK sends it on the standalone GET stream, which AgentCore answers with 405
- Tool / service: `@modelcontextprotocol/sdk` 1.32.1 (`McpServer`, `StreamableHTTPServerTransport`) on Amazon Bedrock AgentCore Runtime (MCP, us-east-1)
- Ticket: T-03
- Task attempted: elicitation round trip (`confirm_demo`) through a stateful MCP server on AgentCore.
- Steps taken: tool handler called `server.server.elicitInput({mode: "form", ...})`; `npx tsx client.ts --target agentcore` with `DEBUG=1` tracing each HTTP exchange.
- Expected: the `elicitation/create` request reaches the client, as it did against the same container locally.
- Actual: `McpError: MCP error -32001: Request timed out`. Trace shows `GET /invocations -> 405` (the client's standalone SSE stream), while every POST returned `text/event-stream` with matching `mcp-session-id` and `x-amzn-bedrock-agentcore-runtime-session-id`. In sdk 1.32.1 `webStandardStreamableHttp.js` `send()`, a server request with no `relatedRequestId` goes to the standalone GET stream and, when none is open, is dropped with no error ("Stream is disconnected ... nothing more to do"). Locally it worked only because the client's GET stream was open. Reproduced locally by answering GET with 405 on the client side (`NO_GET=1`).
- Severity: major
- Workaround: `server.server.elicitInput(params, { relatedRequestId: extra.requestId })` so the request rides the tool call's POST SSE response. Local PASS with GET disabled; AgentCore rerun pending redeploy.
- Suggestion to the tool's team: SDK: default `elicitInput` inside a tool handler to the current request's stream, or warn when a request is dropped. AgentCore docs: state that the standalone GET stream is not supported (405) and that server-to-client requests must be on the POST response stream.

### F-010 · npm 10.9.2 crashes resolving vitest 4.x/5.x peer dependencies ("Cannot read properties of null (reading 'edgesOut')")
- Tool / service: npm 10.9.2 (bundled with Node 23.11.0, Homebrew), vitest 5.0.5 and 4.1.12
- Ticket: T-10
- Task attempted: `npm install` for the new workspace root with `vitest` as a devDependency.
- Steps taken: `npm install` with vitest ^5.0.5; clean retry (`rm -rf node_modules package-lock.json`); vitest ^4.1.12; then a scratch folder whose package.json has only `"vitest": "^4.1.12"`.
- Expected: vitest installs.
- Actual: every attempt fails with `npm error Cannot read properties of null (reading 'edgesOut')`; the debug log stack is `#loadPeerSet (@npmcli/arborist/lib/arborist/build-ideal-tree.js:1289:38)`, right after fetching the `@vitest/ui` packument (vitest's optional peers). Same failure in a scratch folder with vitest alone. `--legacy-peer-deps` installs fine; vitest ^3.2.4 installs fine.
- Severity: minor
- Workaround: pinned vitest ^3.2.4 (installed 3.2.7). `npm audit` then reports advisories for vitest 3.x's `@vitest/mocker` and `tinypool` (dev-only test runner; fixed in vitest ≥ 4.1.12, which this npm cannot install without `--legacy-peer-deps`).
- Suggestion to the tool's team: npm: fail with a message naming the peer set instead of a null dereference. Vitest: note the minimum npm version for its optional-peer set.

### F-011 · FNDDS 2024-10-31 CSV: `food_nutrient.nutrient_id` holds the legacy nutrient number, not `nutrient.id`
- Tool / service: USDA FoodData Central bulk CSV download, FNDDS (Survey) 2024-10-31 (https://fdc.nal.usda.gov/download-datasets), compared with SR Legacy 2018-04
- Ticket: T-12
- Task attempted: read per-100 g nutrients for SR Legacy and FNDDS foods with one nutrient-id map.
- Steps taken: joined `food_nutrient.csv` to `nutrient.csv` on `nutrient_id` = `nutrient.id` (Energy = 1008, Protein = 1003), which works for SR Legacy.
- Expected: the same join works for the FNDDS download, whose `nutrient.csv` lists `"1003","Protein","G","203"`.
- Actual: every FNDDS food came out with 0 kcal; `food_nutrient.csv` rows for roti (fdc 2707713) carry `nutrient_id` values like `203`, `291`, `305` (the `nutrient_nbr` column), e.g. `"34287544","2707713","203","7.85",...`.
- Severity: minor
- Workaround: a second map keyed by nutrient_nbr (208 kcal, 203 protein, 205 carbs, 204 fat, ...) for the FNDDS file (`data/foods/build.ts`).
- Suggestion to the tool's team: use `nutrient.id` consistently across datasets, or document in the download's README that FNDDS rows reference `nutrient_nbr`.

### F-013 · Amazon Add-to-Cart link opens an empty cart when signed in
- Tool / service: amazon.com `/gp/aws/cart/add.html` (the legacy Add-to-Cart form from the PA-API docs)
- Ticket: T-05
- Task attempted: Put 3 real products into the user's cart with one link: `https://www.amazon.com/gp/aws/cart/add.html?ASIN.1=B089BWP51D&Quantity.1=1&ASIN.2=B08P6MF2D9&Quantity.2=2&ASIN.3=B00DX53P4M&Quantity.3=1`.
- Steps taken: User opened the link signed in (Chrome, 2026-10-22). Also opened it signed out. A signed-out `curl` shows a 302 to `/ap/signin` with `openid.return_to=https://www.amazon.com/associates/addtocart?ASIN.1=...`.
- Expected: The cart shows the 3 items with quantities 1, 2 and 1.
- Actual: Signed in, the link lands on the cart page and the cart is empty. Signed out, it asks for sign-in first. No error message is shown.
- Severity: major
- Workaround: Found by testing variants: `https://www.amazon.com/associates/addtocart?AssociateTag=<tag>&ASIN.1=…&Quantity.1=…` fills the cart (signed in). The same endpoint without AssociateTag was not tested separately; the legacy add.html form without a tag does not. `build-link.ts` now emits the working form.
- Suggestion to the tool's team: Document the current status of the Add-to-Cart form and return a visible error when items are dropped, instead of an empty cart.

### F-014 · Nova Sonic ends the whole session when a tool result is not JSON ("Tool Response parsing error")
- Tool / service: Amazon Bedrock `InvokeModelWithBidirectionalStream`, `amazon.nova-2-5-sonic` (us-east-1)
- Ticket: T-30
- Task attempted: return an MCP tool's result to Sonic as a `toolResult` event (`toolResultInputConfiguration` type `TEXT`, `textInputConfiguration.mediaType: "text/plain"`), per https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-input-events.html.
- Steps taken: sent the MCP result's text content. Successful mock results happened to be JSON text and worked; an error result was the plain string `Error: fetch failed`.
- Expected: a `text/plain` tool result accepts any text.
- Actual: the stream failed with `ValidationException: RequestId=3a2e4906-34b8-4359-93bf-d37bfd638073 : Tool Response parsing error`, which closes the bidirectional stream, so the session (and its context) is lost mid-turn.
- Severity: major
- Workaround: always send JSON (`structuredContent`, or `{"result": text}` / `{"error": text}`); the backend also renews the session with a summary when the stream dies.
- Suggestion to the tool's team: document that tool result content must be a JSON document despite `text/plain`, and reject a bad tool result with an event instead of ending the session.

### F-015 · Nova Sonic calls dependent tools in parallel and re-requests tools whose results are still pending
- Tool / service: Amazon Bedrock `InvokeModelWithBidirectionalStream`, `amazon.nova-2-5-sonic` (us-east-1)
- Ticket: T-30
- Task attempted: S4 "Plan my meal prep for the next four days and add what I need to my cart" with 18 MCP tools; `checkout_cart` waits on an MCP elicitation (user confirmation, about 2–3 s).
- Steps taken: system prompt says to call get_daily_summary, plan_meal_prep, add_to_cart, checkout_cart in order; results returned to Sonic as each MCP call finished.
- Expected: one tool at a time (each depends on the previous one), or at least no repeats.
- Actual: Sonic emitted all four `toolUse` events at once (same millisecond), before any result. While `checkout_cart` was still waiting for the user, it emitted `toolUse` for `plan_meal_prep` and `checkout_cart` again (a second elicitation popped up), and started speaking "Please confirm the total…" over the confirmation question. A spoken "yes" sent into the session during the pending tool also started a new user turn that re-ran the tools.
- Severity: major
- Workaround: the backend runs Sonic's tool calls one after another in the order given, reuses the first result for an identical call in the same turn, holds all results until the batch finishes, and sends mic audio to Amazon Transcribe (not Sonic) while an elicitation waits for a yes or no.
- Suggestion to the tool's team: document Sonic's parallel tool-call behaviour and offer a sequential tool-calling option; don't re-issue a tool call whose result is pending.

### F-016 · AgentCore Runtime exposes only the MCP path, so a server's other HTTP routes are unreachable once deployed
- Tool / service: Amazon Bedrock AgentCore Runtime (MCP protocol, SigV4 inbound), us-east-1
- Ticket: T-40
- Task attempted: Run the demo scene runner against the deployed server, including S5's `POST /admin/advance-day` (an Express route next to `POST /mcp` in the same container).
- Steps taken: Deployed with `AWS::BedrockAgentCore::Runtime` (`ProtocolConfiguration: MCP`); the only client URL is `https://bedrock-agentcore.us-east-1.amazonaws.com/runtimes/<encoded ARN>/invocations?qualifier=DEFAULT`, which the platform forwards to the container's `/mcp`.
- Expected: Some way to reach a non-MCP route (health, admin) on the same runtime, or a documented note that there is none.
- Actual: No URL maps to any container path other than `/mcp`; the admin routes (and `/health`) cannot be called on the deployed runtime.
- Severity: minor
- Workaround: State lives in Aurora (the demo clock is a table), so a local server on the same cluster (`DB_DRIVER=data-api`, port 8019) serves the admin routes while tools go to AgentCore. All 7 scenes PASS that way.
- Suggestion to the tool's team: Say in the MCP-protocol runtime contract that only `/mcp` is proxied, and suggest a pattern for operator-only routes.

### F-017 · Chrome 97 hit-testing disagrees with getBoundingClientRect and CDP getBoxModel inside a CSS `zoom` subtree
- Tool / service: Google Chrome 97.0.4692.71 (the Chrome installed on the recording laptop), headless, driven over CDP
- Ticket: T-31
- Task attempted: Click the elicitation overlay's "Yes" button from the headless check (`simulator/frontend/scripts/verify.ts`) with `Input.dispatchMouseEvent` at the button's centre. The overlay is laid out at 768×480 inside a `zoom: 1.5` element, the same way the native cards scale.
- Steps taken: Took the centre from `getBoundingClientRect()`, then from CDP `DOM.getBoxModel`; checked each with `document.elementFromPoint`; then hit-tested a 20 px grid over the screen.
- Expected: The rect reports where the button is drawn, so a click at its centre lands on it.
- Actual: Both APIs returned the unzoomed layout box `{x: 232, y: 336.36, width: 200, height: 62}`, so the click centre was (332, 367). `elementFromPoint(332, 367)` returned `div.elicit-q` (the question text). The click never reached the button, and the server's `checkout_cart` failed after 60 s with `MCP error -32001: Request timed out`. The grid hit-test found the button drawn at x 384–604, y 513–593. A zoom-corrected centre (layout offset × 1.5 from the screen origin) also missed. Real mouse clicks are fine, because they hit what is drawn.
- Severity: minor
- Workaround: The test now finds the click point by hit-testing a 6 px grid with `elementFromPoint` and clicks the centroid of the hits.
- Suggestion to the tool's team: none for current Chrome (CSS `zoom` behaves differently in newer releases). For anyone writing tests: don't trust element rects under CSS `zoom` on older Chrome.
