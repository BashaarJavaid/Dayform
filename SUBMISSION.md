# Devpost submission: Dayform

Draft for the Build, Ship, Shape: Amazon Developer Hackathon. **Deadline: 2026-10-23 12:00 PT (2026-10-24 00:00 PKT).** Paste one section per Devpost field. Text inside each field section is paste-ready; lines in *italics* starting "Note:" are for the person pasting, not for Devpost.

## Before you paste (checklist)

- [ ] Replace `<REPO_URL>` (T-50) and `<VIDEO_URL>` (T-51) everywhere in this file. Open both signed out; both must load.
- [ ] T-40 status: the full server is deployed to AgentCore Runtime and the overnight job to Lambda + EventBridge Scheduler? If T-40 is not DONE, change the two sentences marked `[T-40]` to say the smoke deployment ran on AgentCore and the demo ran on the local container.
- [ ] Open Source mini challenge: tick it only if T-53 is DONE (it is CUT-FIRST). Otherwise delete that section.
- [ ] Add teammates on Devpost, if any.
- [ ] Every number below comes from `SMOKE-RESULTS.md`, ticket Result sections, `db/seed/README.md` or `DEMO-SCRIPT.md`. If the seed or catalog changes before recording, re-check the S1–S6 numbers in `DEMO-SCRIPT.md`.

---

## Project name

Dayform

## Elevator pitch (tagline, 200 characters max)

Talk to Alexa to log meals and lifts, run your gym session, plan meal prep and fill your Amazon cart. An Alexa+ add-on built as an MCP server with on-screen cards.

## About the project (description)

### Inspiration

Every fitness app makes you type. Logging lunch means searching a food database with greasy fingers; logging a set means unlocking your phone between reps. Most trackers also don't know what a roti or a chicken karahi is. We wanted the opposite: say what you ate or what you lifted, and let the assistant do the bookkeeping, the maths and the shopping.

### What it does

Dayform is an Alexa+ add-on. You talk to Alexa, and Alexa:

- **Logs meals in plain words**, desi food included. "I had two rotis, chicken karahi and a mango lassi for lunch" logs three items (904 kcal, 48.7 g protein), says what it assumed ("1 plate of chicken karahi = 250 g"), and tells you what's left today. "Actually, make that one roti" fixes it (904 → 785 kcal).
- **Runs your gym session.** "Start push day" gives today's first set (bench press 80 kg × 8); "done, eight reps" logs it, spots a new estimated-1RM PR (101.3 kg, +2.6 kg) and starts the rest timer; "my shoulder feels off, swap the overhead press" picks a shoulder-friendly alternative (landmine press 32.5 kg × 6).
- **Plans meal prep and fills your Amazon cart.** "Plan my meal prep for the next four days and add what I need to my cart" builds a 4-day plan from a real grocery catalog, checks every day against your targets, turns it into packs to buy, asks you to confirm ("Add 12 items, about $112, to your Amazon cart?"), then hands off a real Amazon Add-to-Cart link. Alexa never places the order; you check out on Amazon.
- **Adapts overnight.** A nightly job reviews the week. "Good morning" gives a brief: "You lost 0.3 kg this week instead of 0.4 kg, so I reduced 110 calories daily" (2,360 → 2,250 kcal), today's lead lift (squat 102.5 kg × 5), and one insight from your data (protein is 162 g on training days but 104 g on rest days).
- **Shows progress.** "How's my bench going?" draws a 6-week estimated-1RM line.

Every answer comes with a 768×480 MCP Apps card: rings, meal logged, live workout with rest countdown, PR celebration, progress chart, meal-prep carousel, cart with QR code, morning brief. Without a screen, Alexa just speaks.

### How we built it

**The add-on is a self-hosted MCP server**, exactly what an Alexa+ add-on is: MCP protocol 2025-11-25 over Streamable HTTP, stateful sessions, 18 tools (one per customer intent), 8 MCP Apps cards. TypeScript on Node with `@modelcontextprotocol/sdk` 1.32.1, zod contracts shared by the server, the mock, the cards and the simulator.

**Architecture**

```
You (voice or text)
  -> Simulator: React "Echo Show" screen  <-WebSocket->  simulator backend
       backend <-bidirectional stream-> Amazon Nova 2.5 Sonic on Bedrock (Alexa's voice and brain)
       backend --MCP 2025-11-25, Streamable HTTP, SigV4--> Dayform MCP server on Amazon Bedrock AgentCore Runtime
                     server -> Aurora PostgreSQL Serverless v2 (17.11) via the RDS Data API
                     server -> Amazon Nova 2 Lite on Bedrock (judgment calls only)
                     server -.Add-to-Cart link.-> amazon.com cart
  EventBridge Scheduler (03:00 Asia/Karachi) -> Lambda overnight job -> Aurora + Nova 2 Lite
```

- **Alexa side.** We don't have a way to run a private add-on on a real Alexa+ device, so a web simulator plays the Echo Show. Nova 2.5 Sonic is its voice and its brain: it hears you, picks the tool, fills the structured inputs, and speaks the reply from the facts the tool returns. Typed input works too. The simulator talks to our server through a real MCP client, so nothing in the server is simulator-specific.
- **Server side.** Each tool is a contract (zod input, zod output, card) plus a handler. A registry checks every output against its contract before it leaves the server, attaches `_meta.ui.resourceUri` for the card, and turns any throw into an MCP error.
- **The model judges, code checks.** Amazon Nova 2 Lite estimates foods the table can't match (labeled "estimated"), writes meal plans, reviews next-session targets and writes the morning brief. Code does every number: food search and nutrient maths, Mifflin-St Jeor targets, the adaptive weekly check-in with a ±250 kcal cap, double progression, Epley e1RM, PR detection, grocery packs and prices. Every model output passes a zod schema and a code check before it is stored: meal plans may use catalog ingredients only (a zod enum), code fits the grams so each day lands within ±5% of calories, and every number in the morning brief is compared with the database (a mismatch regenerates once, then falls back to a code sentence).
- **Under 500 ms.** The confident path makes no model call. Slow model work runs in the overnight job or in the background (`plan_meal_prep` with new constraints returns `{status: "preparing"}` and the plan is ready a few seconds later).
- **Food data.** 1,659 foods: 1,396 USDA FNDDS + 208 SR Legacy, plus 55 desi entries (from FNDDS codes or standard USDA-ingredient recipes). Search is exact alias, then pg_trgm trigram similarity, then portion resolution; vague portions log a standard portion and return the assumption.
- **Cart.** A 38-item grocery catalog with real ASINs and prices read from amazon.com on 2026-10-22. Checkout asks for confirmation through MCP elicitation, then returns an `https://www.amazon.com/associates/addtocart?AssociateTag=…&ASIN.n=…&Quantity.n=…` link. Links go through one `CartProvider` interface (Add-to-Cart link, search-link fallback).
- **Hosting.** [T-40] The server container (linux/arm64) runs on Amazon Bedrock AgentCore Runtime in stateful MCP mode with SigV4 inbound auth, deployed with CloudFormation; the overnight job is a Lambda function on an EventBridge Scheduler cron. The same container runs locally in Docker against local Postgres.

### Measured, not claimed

- Tool latency on the server (S1–S6 from the seed state): `log_meal` 13–91 ms, `correct_meal` 13–52 ms, live-workout tools ≤ 21 ms, the 4-tool meal-prep-to-checkout chain ≤ 60 ms per call (cached plan), `get_morning_brief` 11–16 ms, `get_progress` 3–5 ms.
- AgentCore Runtime (smoke deployment): warm MCP ping p50 118 ms from our laptop to us-east-1; elicitation round trip 230 ms.
- Nova 2.5 Sonic: end of speech to first audio p50 1.2 s on tool turns.
- Food search: 100/100 top-1 on our food-word test set, p50 about 10–12 ms per item on Postgres.
- Meal plans: 10/10 within tolerance on the bench (3.0–4.2 s each); with a 12-item grocery cap, 5/5 within tolerance and $94–108 carts.
- Aurora: Data API p50 81 ms from the laptop; a full demo reset in 2.4–3.0 s, giving byte-identical table hashes to local Postgres.
- Server test suite: 89/89 passing.

### What's real and what's sample data

- **Real:** every AWS service call (Bedrock Nova 2 Lite and Nova 2.5 Sonic, AgentCore Runtime, Aurora with the Data API, Lambda, EventBridge Scheduler); USDA nutrient data; the 38 grocery ASINs and prices (read 2026-10-22); the Amazon Add-to-Cart link, which fills a real signed-in cart; every number in the demo, which comes from a real run.
- **Sample:** one demo user, "Ali", with 6 weeks of generated history (42 days, 24 workouts, 378 sets, daily weigh-ins) from a deterministic seed. The demo runs on a demo clock (demo day 2026-10-23, 13:00 Asia/Karachi), rest timers are shortened to 10 s, and the video uses cached overnight output so every take is identical (the live overnight run takes about 7 s and gives the same brief). A hidden demo panel resets the seed state and "skips to morning".
- **Simulated:** the device. The simulator stands in for an Echo Show; Dayform has not been certified or published as a real Alexa+ add-on.

### How it meets the Alexa+ add-on rules

- MCP **2025-11-25** over **Streamable HTTP** at an HTTPS endpoint (AgentCore Runtime).
- **One tool per customer intent**, no overlaps: 18 tools, each with a description that says when to call it, why, and what it returns.
- **Declare only parameters we honor**; output matches the declared schema (the registry rejects a non-matching output before it leaves the server).
- **Always a result or an error**: any failure becomes an MCP error with a plain message.
- **Facts, not scripts**: tools return `structuredContent` and short fact text; Alexa writes the spoken reply.
- **Visuals**: tools link their card with `_meta.ui.resourceUri`; cards are single-file MCP Apps at 768×480 (`text/html;profile=mcp-app`); voice-only still works.
- **Elicitation** confirms checkout, sent on the tool call's own response stream so it works on AgentCore.
- **Under 500 ms** on every confident path.
- **No purchases by voice**: Alexa builds and confirms the cart; the user checks out on Amazon.
- A second understanding mode (`UNDERSTANDING=server`) gives every tool one plain-text input that the server's own model parses, for clients without a strong language model (0.6–1.4 s per call by design).

### Challenges we ran into

- **Elicitation silently vanished on AgentCore.** The MCP SDK sent it on the standalone GET stream, which AgentCore answers with 405, and the SDK dropped it without an error. The fix is one option (`relatedRequestId`), but finding it took a trace of every HTTP exchange.
- **Nova Sonic called dependent tools in parallel** and repeated a pending checkout, so a second confirmation popped up mid-sentence. The simulator backend now runs a turn's tool calls in order and de-duplicates them.
- **A non-JSON tool result ended the whole Sonic session.**
- **The documented Add-to-Cart link opened an empty cart.** We found the endpoint Amazon redirects to and verified it fills a real cart.
- **Long structured output from Nova was flaky** (a 4-day plan sometimes came back with fewer days), so the planner asks for 1–2 day menus that alternate, fits grams in code, and sends misses back for up to 3 rounds.

### Accomplishments that we're proud of

- A real MCP server that follows the Alexa+ add-on rules, with 18 tools and 8 cards, running on AgentCore Runtime. [T-40]
- Desi food that just works: "two rotis, chicken karahi and a mango lassi" resolves to the right foods and portions.
- From "plan my meal prep" to a filled Amazon cart in one sentence and one "yes".
- A morning brief where every number is checked against the database before Alexa says it.

### What we learned

- Let the model judge and let code count. Every place we let code own the numbers got faster and more reliable.
- Stream-level details matter on managed runtimes: which HTTP stream a server-to-client request rides decides whether it arrives.
- Voice models need orchestration around them: ordering tool calls, waiting out playback, renewing sessions before the 8-minute cap.

### What's next for Dayform

- Run on a real Alexa+ device once add-on publishing is open, with OAuth 2.1 (authorization code + PKCE) sign-in and multiple users.
- A program builder and more programs, beyond the one pre-set 4-day program.
- A pantry step for meal plans, and fresh groceries through Amazon Fresh where available.

## Built with

amazon-alexa, alexa-plus, model-context-protocol, mcp-apps, amazon-bedrock, amazon-nova, nova-sonic, nova-2-lite, amazon-bedrock-agentcore, amazon-aurora, aurora-serverless, rds-data-api, postgresql, pg-trgm, aws-lambda, amazon-eventbridge-scheduler, aws-cloudformation, amazon-ecr, aws-iam, aws-secrets-manager, amazon-cloudwatch, typescript, node.js, react, zod, drizzle-orm, vite, esbuild, vitest, docker, usda-fooddata-central

*Note: Devpost suggests tags as you type; pick the closest match for each.*

## "Try it out" links

- Code: `<REPO_URL>`
- Demo video: `<VIDEO_URL>`

## Video demo link

`<VIDEO_URL>`

## Tracks and mini challenges

- **Track: Alexa+.** Dayform is an Alexa+ add-on: a self-hosted MCP server (protocol 2025-11-25, Streamable HTTP) with 18 intent-shaped tools, MCP Apps cards at 768×480, elicitation for purchase confirmation, and an agentic workflow that orchestrates meal planning, a grocery catalog and the Amazon cart.
- **Mini challenge: AWS Builder.** See "AWS usage" below.
- **Mini challenge: Open Source (optional, only if T-53 is done).** *Note: delete this bullet if T-53 is CUT.* We published the Alexa+ simulator as a standalone MIT-licensed repo that any MCP developer can point at their own server to try it as an Alexa+ add-on, with Nova Sonic voice and MCP Apps cards. Repo: `<OSS_REPO_URL>`. GitHub username: `<GITHUB_USERNAME>`.

### AWS usage (for the AWS Builder mini challenge)

| AWS service | What Dayform uses it for |
|---|---|
| Amazon Bedrock: Amazon Nova 2 Lite (`us.amazon.nova-2-lite-v1:0`), fallback Nova Pro | Every judgment call: unknown-food estimates, meal-prep plans, next-session target review, the morning brief, plain-text parsing in server mode. Converse with a forced tool + zod for structured output. |
| Amazon Bedrock: Amazon Nova 2.5 Sonic (`amazon.nova-2-5-sonic`), fallback Nova 2 Sonic | The simulated Alexa's voice and brain: bidirectional speech stream, tool use (it picks our MCP tools), voice "tiffany". |
| Amazon Bedrock AgentCore Runtime | Hosts the MCP server container (linux/arm64) in stateful MCP mode with SigV4 inbound auth; sessions keep the same microVM. [T-40] |
| Amazon Aurora PostgreSQL Serverless v2 (17.11, 0.5–4 ACU) + RDS Data API | All app data (profile, targets, foods with pg_trgm search, meals, workouts, plans, cart, briefs, demo clock), through Drizzle ORM's Data API driver; no VPC plumbing for the server or the Lambda. |
| AWS Lambda (`nodejs24.x`) | The overnight job: weekly check-in, next-session targets, a ready meal plan and the morning brief. |
| Amazon EventBridge Scheduler | Runs the overnight Lambda nightly at 03:00 Asia/Karachi (`cron(0 3 * * ? *)` with a schedule time zone). |
| AWS CloudFormation | Every stack: AgentCore runtime + ECR + IAM (`AWS::BedrockAgentCore::Runtime`), Lambda + Scheduler. The CDK bootstrap stack is in place. |
| Amazon ECR, IAM, Secrets Manager, CloudWatch Logs, AWS Budgets | Container images; least-privilege roles (`bedrock:InvokeModel`, `rds-data:*` on one cluster, one secret); the Aurora master secret; runtime logs; a USD 50/month budget with an 80% alert. |
| Amazon Transcribe streaming | Simulator backend: mic audio goes to Transcribe while a checkout confirmation waits for "yes" or "no" (so the answer isn't treated as a new Sonic turn), and in the `VOICE_ENGINE=pipeline` fallback. |

---

## Product feedback

*Note: Devpost asks for feedback on the tools, APIs and SDKs used. Each entry answers the same five questions. Everything here comes from what we recorded while building (`FRICTION.md`, `SMOKE-RESULTS.md`, ticket results).*

### Amazon Bedrock: Amazon Nova 2 Lite (reasoning model)

*Note: the ticket named Claude Opus here; the project switched to Amazon Nova only (decision D21), so this entry covers Nova 2 Lite and its fallback Nova Pro.*

- **What we used it for:** every judgment call: estimating foods our table doesn't have, writing 4-day meal-prep plans from a fixed catalog, reviewing next-session lifting targets, writing the morning brief, and parsing plain text into tool calls in server mode. Converse API with a forced tool (`toolChoice: {tool: {name}}`) and zod validation.
- **What worked well:** forced tool use, `any` and `auto` all worked first time and returned schema-valid JSON (5/5 runs). Fast for small calls: a text reply p50 638 ms, a tool-use call p50 704 ms. With code fitting the grams, meal plans landed within tolerance 10/10 times in one round. Nova 2 Lite answered every overnight-job call on the first try.
- **What needs work:** (1) ConverseStream sends a forced tool's whole input as one delta at the end, so streaming gives no early tokens (time to first token 10,783 ms of a 10,786 ms total). (2) Long forced-tool JSON is unreliable in shape: a 4-day plan sometimes came back with fewer days, on both Nova 2 Lite and Nova Pro. (3) JSON without tools came back in code fences despite instructions. (4) Nova 2 Pro is not offered in us-east-1, and its ID returns "The provided model identifier is invalid." with no hint why; Nova Premier is still listed as an inference profile but returns "end of its life".
- **Onboarding (zero to hello world):** quick once permissions were right: one Converse call worked in minutes with the AWS SDK v3. The time went into IAM (an operator user with sign-in but no Bedrock permissions got AccessDenied on every call) and into finding which Nova IDs exist in the region.
- **Would we build with it again:** yes. It is cheap and fast enough for small judgment calls, and forced tool use plus zod is a solid structured-output path. We would design for non-streaming structured output from day one.

### Amazon Bedrock: Amazon Nova 2.5 Sonic

- **What we used it for:** the simulated Alexa's voice and brain. A Node relay holds one bidirectional stream per session, sends 16 kHz mic audio (or typed text in the same session), lets Sonic choose among 18 MCP tools, returns tool results, and plays 24 kHz audio.
- **What worked well:** natural voice (we chose "tiffany") and good tool choice from speech. End of speech to first audio p50 1.2 s on tool turns, 153–945 ms on short turns. Text and audio in one session (cross-modal input) works. Renewing the session with a summary in the system prompt keeps context ("The first thing you told me you ate was two eggs.").
- **What needs work:** (1) typed input inside the reply's play time counts as barge-in even after `END_TURN`, because the turn stays open for the audio's play length. (2) A tool result that isn't JSON ("text/plain" declared) fails with `ValidationException ... Tool Response parsing error` and ends the whole session. (3) Sonic emitted four dependent tool calls in the same millisecond and re-issued a pending `checkout_cart`, which popped a second confirmation. (4) The 8-minute session cap needs app-side renewal. (5) It mishears domain words: "push day" → "pushte", "reps" → "trips", "Dayform" → "day form".
- **Onboarding:** moderate. The event protocol (sessionStart, promptStart, contentStart/End per block) is long; we ported the AWS websocket-nodejs sample, and the typed path worked the same day. The docs cover event shapes but not the turn-timing rules above.
- **Would we build with it again:** yes. Nothing else gave us a natural speech-to-tool loop this quickly. We would want a sequential tool-calling option and clearer turn-end semantics.

### Amazon Bedrock AgentCore Runtime

- **What we used it for:** hosting the MCP server container (linux/arm64) as a stateful MCP runtime with SigV4 inbound auth, deployed with the CloudFormation resource `AWS::BedrockAgentCore::Runtime`.
- **What worked well:** a real managed MCP endpoint with very little infrastructure: no load balancer, no VPC. Warm ping p50 118 ms from our laptop; a new session's `initialize` about 750–790 ms. `Mcp-Session-Id` matches the runtime session header and keeps the same microVM. Native ARM64 images built locally in 5 s.
- **What needs work:** (1) The runtime answers the client's standalone GET stream with 405, which the docs don't say; with the TypeScript SDK this silently dropped our elicitation (see friction F-009). (2) Stateful mode is documented only as the Python FastMCP flag `stateless_http=False`; there is no runtime-level setting, and it's unclear whether the platform or the server mints `Mcp-Session-Id`. (3) No TypeScript samples. (4) The CloudFormation first deploy needs two passes (ECR repo and role first, push the image, then the runtime), and re-running pass 1 on an existing stack would delete the runtime. (5) CloudWatch showed only our startup line, so the dropped request left no trace.
- **Onboarding:** protocol, sessions and ping worked on the first deploy; the effort went into the two-pass CloudFormation deploy and tracing the missing elicitation (it needed a second image).
- **Would we build with it again:** yes, for MCP servers. It is the shortest path to a public, authenticated, stateful MCP endpoint on AWS. The docs need a TypeScript path and a clear "what the runtime proxies" section.

### Amazon Aurora PostgreSQL Serverless v2 with the RDS Data API

- **What we used it for:** all app data, including trigram food search (pg_trgm), through the Data API from the AgentCore server and the Lambda (no VPC connections). Drizzle ORM 0.45 with `drizzle-orm/aws-data-api/pg` on Aurora and `node-postgres` locally, same query code.
- **What worked well:** the Data API removes connection pooling and VPC setup for serverless callers. Data API p50 81 ms from the laptop. Our migrations and a full seed reset ran unchanged on Aurora (reset 2.4–3.0 s of DB work), and the table hashes were byte-identical to local Postgres 17.11. pg_trgm works as on stock Postgres.
- **What needs work:** (1) The Data API support table stops at PostgreSQL 17; Aurora PG 18 is released, but the table neither lists nor rules it out, so we chose 17.11. (2) Data API calls are about 20× slower than a local connection, so chatty code paths need batching. (3) Serverless v2 needs a minimum of 0.5 ACU to avoid wake-up delay during a demo, which is a cost to plan for.
- **Onboarding:** one script (`create-cluster` with `--enable-http-endpoint` and `--manage-master-user-password`) to a queryable cluster; the first query through the Data API worked once the cluster was available.
- **Would we build with it again:** yes. Postgres features with serverless-friendly access is the right fit for a Lambda plus a managed runtime.

### AWS Lambda

- **What we used it for:** the overnight job (`runOvernight()`), bundled with esbuild into one CommonJS file (about 2.4 MB) on `nodejs24.x`.
- **What worked well:** the same library runs in Lambda, behind the server's admin route and as a CLI, unchanged. A manual invoke (cold start + one Nova call + two Data API statements) took 2.0 s wall. IAM scoping to one cluster and one secret was straightforward.
- **What needs work:** nothing blocked us. We had to find the newest Node runtime CloudFormation accepted by trying it (`nodejs24.x`).
- **Onboarding:** one template (function, role, schedule) and an esbuild bundle; the first manual invoke wrote its row to Aurora.
- **Would we build with it again:** yes. For a nightly batch job it's the obvious choice.

### Amazon EventBridge Scheduler

- **What we used it for:** firing the overnight Lambda nightly at 03:00 in Asia/Karachi (`cron(0 3 * * ? *)` with `ScheduleExpressionTimezone`); in the smoke test, a one-off `at(...)` schedule.
- **What worked well:** native time zones (no UTC arithmetic) and one-off `at()` schedules. With the flexible window off, the one-off schedule fired about 3 s after its slot. Enabling and disabling a schedule is one property.
- **What needs work:** nothing blocked us. A "run now" action for a schedule would make testing easier than creating a new `at()` schedule a few minutes ahead.
- **Onboarding:** minutes: one CloudFormation resource and one role with `lambda:InvokeFunction`.
- **Would we build with it again:** yes.

### AWS CDK and AWS CloudFormation

*Note: the ticket asked about CDK. We bootstrapped CDK, then wrote the stacks as plain CloudFormation templates, so this entry covers both honestly.*

- **What we used it for:** CDK: `cdk bootstrap` for the account and region. CloudFormation: every stack (AgentCore runtime + ECR + IAM; Lambda + Scheduler + IAM), driven by small `deploy.sh` scripts.
- **What worked well:** `AWS::BedrockAgentCore::Runtime` exists as a CloudFormation resource, so a new service was deployable the same way as everything else. Plain templates were quick to write and read for 3–6 resources each.
- **What needs work:** we chose plain templates for speed and did not evaluate CDK constructs for AgentCore, so we can't judge CDK there. In CloudFormation, the runtime's image must exist before the runtime resource, which forces a two-pass first deploy, and `ProtocolConfiguration` is a plain string with no stateful option.
- **Onboarding:** CDK bootstrap was one command. CloudFormation for AgentCore took the resource reference plus one trial deploy.
- **Would we build with it again:** yes for CloudFormation at this size; for a larger app we would try CDK, ideally with an AgentCore construct.

### MCP TypeScript SDK (`@modelcontextprotocol/sdk` 1.32.1)

- **What we used it for:** the MCP server (`McpServer`, `StreamableHTTPServerTransport`, stateful sessions), the mock server, the simulator's client, and tests. Protocol 2025-11-25.
- **What worked well:** zod objects plug straight into tool definitions, so our shared contracts are the schemas. Streamable HTTP, sessions, progress notifications, logging and elicitation all work. The same server code ran locally and on AgentCore.
- **What needs work:** a server-to-client request without `relatedRequestId` goes to the standalone GET stream and, when that stream isn't open, is dropped with no error. Inside a tool handler, the SDK could default to the current request's stream, or at least warn. The v1/v2 package split (`@modelcontextprotocol/sdk` vs `@modelcontextprotocol/client|core|server` 2.x) is confusing when other packages peer on v2.
- **Onboarding:** the README examples were enough for a working stateful server and client; the only hard part was F-009.
- **Would we build with it again:** yes.

### MCP Apps SDK (`@modelcontextprotocol/ext-apps` 2.0.3)

- **What we used it for:** the 8 cards (React, built to single-file HTML with esbuild) using the app-side `App`, and the simulator's host with `AppBridge` + `PostMessageTransport` in a sandboxed iframe. Card buttons call server tools (`callServerTool`), for example "add to cart" from the meal-prep card.
- **What worked well:** the model is right: a tool links to `ui://cards/<name>`, the host renders it, and the card can call tools back. `registerAppTool` writes both `_meta.ui.resourceUri` and the legacy key. The card-to-tool round trip worked first time.
- **What needs work:** (1) ext-apps 2.x peers on the split SDK v2 packages; npm silently installed two SDK generations side by side, and the README never mentions `@modelcontextprotocol/sdk`. We needed an `as any` cast to use the helpers with a v1 server. (2) The smallest card bundle is about 600 KB (603 KB for four SVG rings and a button) because the app runtime pulls in zod v4, the MCP protocol core and JSON Schema validators; our React cards are 735–758 KB each. Parsing that in an iframe dropped animation frame rates in headless tests.
- **Onboarding:** a rendered card with a working tool callback in our first smoke test, following the basic-host example; the SDK-version question (F-001) was the main detour.
- **Would we build with it again:** yes; it is how Alexa+ add-ons show visuals. We would ask for a lightweight view entry point.

### MCP Inspector

- **What we used it for:** checking every tool by hand: `npx @modelcontextprotocol/inspector --cli <url> --method tools/list` and `tools/call`, against the mock, the local server and server mode.
- **What worked well:** the CLI mode is scriptable and fast; it listed all 18 tools and which have `_meta.ui.resourceUri`. Its "schema portability" report flagged 17 warnings for `type: ["x","null"]` in our output schemas, which was useful to know.
- **What needs work:** the CLI can't answer an elicitation, so we tested checkout with an SDK client instead. A flag to auto-accept or auto-decline elicitations would cover that.
- **Onboarding:** one `npx` command.
- **Would we build with it again:** yes.

### Amazon Add-to-Cart link (amazon.com)

- **What we used it for:** handing the confirmed cart to the user's Amazon cart: `https://www.amazon.com/associates/addtocart?AssociateTag=<tag>&ASIN.1=…&Quantity.1=…`, the whole confirmed cart in one link.
- **What worked well:** once in the right format, one link filled a real signed-in cart with all 10 test items and the right quantities.
- **What needs work:** the legacy form `/gp/aws/cart/add.html` (still in the old PA-API docs) lands on an empty cart with no error. With PA-API 5 retired there is no documented way to look up a grocery ASIN's title, price and availability, so we read product pages by hand; scripted reads without cookies get a JavaScript stub.
- **Onboarding:** building the link is trivial; finding the working endpoint took testing variants by hand, and only a signed-in browser can prove it.
- **Would we build with it again:** yes; it's the only purchase hand-off that keeps the user in control. It needs current docs.

---

## Friction log

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

## Feature requests

| # | Product | Request | Rating |
|---|---|---|---|
| 1 | MCP TypeScript SDK | Inside a tool handler, send server-to-client requests (elicitation, sampling) on the current request's stream by default, and warn when a request is dropped. | Critical |
| 2 | AgentCore Runtime docs | Say that the standalone GET stream returns 405 and that server-to-client requests must ride the POST response; add a TypeScript stateful-MCP sample and name the `Mcp-Session-Id` owner. | Critical |
| 3 | Nova 2.5 Sonic | A sequential tool-calling option, and never re-issue a tool call whose result is pending. | Critical |
| 4 | Nova 2.5 Sonic | Reject a malformed tool result with an error event instead of ending the session; document that tool results must be JSON. | Important |
| 5 | amazon.com | Current, documented Add-to-Cart link format, with a visible error when items are dropped. | Important |
| 6 | Amazon (retail) | A read-only product lookup (title, price, availability by ASIN) to replace PA-API 5 for builders. | Important |
| 7 | Alexa+ add-ons | A developer sandbox or simulator to try a private add-on on a real Alexa+ device or the Alexa app before publishing. | Important |
| 8 | Bedrock / Nova | Stream forced-tool input as partial JSON, or document that it arrives in one delta. | Important |
| 9 | Bedrock | "Invalid model identifier" errors that say whether the model exists in another region or needs an inference profile; hide end-of-life profiles. | Important |
| 10 | MCP Apps SDK | A lightweight view entry point (no schema validation) for small cards, and a README note on which MCP SDK line ext-apps 2.x supports. | Important |
| 11 | Nova 2.5 Sonic | Document turn timing: which `END_TURN` marks the true end, and that input during playback counts as barge-in. | Nice-to-have |
| 12 | AWS CDK | An L2 construct for an AgentCore MCP runtime that handles the image-before-runtime ordering. | Nice-to-have |
| 13 | RDS Data API docs | Add Aurora PostgreSQL 18 to the support table. | Nice-to-have |
| 14 | MCP Inspector | A CLI flag to auto-accept or auto-decline elicitations. | Nice-to-have |
| 15 | EventBridge Scheduler | A "run now" action for an existing schedule. | Nice-to-have |
