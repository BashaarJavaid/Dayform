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
