# T-03 · Smoke test: MCP server on AgentCore Runtime

| Field | Value |
|---|---|
| Wave | 0: Setup and smoke tests |
| Demo importance | ENABLER (also gives the S7 proof clip) |
| Size | M |
| Depends on | T-00 |
| Owns | `smoke/agentcore-mcp/` |
| Approval needed | Yes: creates an AgentCore runtime, an ECR repository and an IAM role |
| Status | TODO |

## Goal
Prove three things about an MCP server on AgentCore Runtime:
- it speaks MCP 2025-11-25 over Streamable HTTP
- it keeps a stateful session
- it completes an elicitation round trip

Measure the latency.

## Why it matters for the demo
- The Alexa+ track requires a self-hosted MCP server.
- Elicitation is how the S4 cart confirmation works.
- S7 shows the server running on AgentCore.

## Read first
- [DESIGN.md §3 Alexa+ add-on rules](../DESIGN.md#3-alexa-add-on-rules) and [§10](../DESIGN.md#10-services-and-fallbacks)
- https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-mcp-protocol-contract.html
- https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-mcp.html
- https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/mcp-stateful-features.html
- https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-lifecycle-settings.html

## Facts from research (2026-10-23)
- **Container contract:** listen on `0.0.0.0:8000` and accept `POST /mcp`. The image must be **ARM64**.
- **Stateful mode:** each MCP session gets its own microVM. Idle timeout is 15 minutes; the maximum is 8 hours. An expired session returns 404.
- **Elicitation:** under protocol 2025-11-25 it needs stateful mode. AgentCore has supported it since 2026-04-09.
- **Inbound auth:** SigV4 or a custom JWT authorizer, one per runtime.
- **SDK:** `@modelcontextprotocol/sdk` 1.32.1 uses protocol 2025-11-25 as its latest.

## Tasks
1. Write `smoke/agentcore-mcp/server.ts`.
   - Use `McpServer` with two tools:
     - `ping`: returns the server time.
     - `confirm_demo`: sends an elicitation request ("Proceed?", schema `{confirm: boolean}`) and returns the answer.
   - Use `StreamableHTTPServerTransport` with a session ID generator, so sessions are stateful. Listen on `0.0.0.0:8000`, path `/mcp`.
2. Write a `Dockerfile` (Node LTS slim, ARM64). Build it with the path T-00 chose.
3. **Run it locally:** `docker run -p 8000:8000 …`. Test it with the client from step 5, and with MCP Inspector (`npx @modelcontextprotocol/inspector`).
4. **Approval needed.** Deploy to AgentCore Runtime in us-east-1, with stateful MCP sessions and SigV4 inbound auth.
   - Use either the AgentCore starter toolkit, or CloudFormation/CDK with `AWS::BedrockAgentCore::Runtime`.
   - Record which method works; T-40 reuses it.
5. Write `smoke/agentcore-mcp/client.ts`, using the MCP SDK `Client` with `StreamableHTTPClientTransport`.
   - Add a fetch wrapper that signs each request with SigV4 (service `bedrock-agentcore`), for example with `@smithy/signature-v4` or `aws4fetch`.
   - Steps:
     1. `initialize`, then check the negotiated `protocolVersion` is `2025-11-25`.
     2. `tools/list`.
     3. Call `ping` 10 times. Record cold and warm latency.
     4. Call `confirm_demo`. Answer the `elicitation/create` request with accept and `{confirm: true}`.
     5. Check the tool result says it was confirmed.
6. Confirm the runtime's invoke URL format and record it.
7. Write the results to [SMOKE-RESULTS.md](../SMOKE-RESULTS.md) §T-03. Save a screenshot of the runtime in the AgentCore console to `smoke/agentcore-mcp/screens/`, for S7.

## Acceptance criteria
- [ ] Local and AgentCore targets both pass every client step.
- [ ] The negotiated protocol is `2025-11-25`.
- [ ] The elicitation round trip works on AgentCore.
- [ ] Warm `ping` p50 is recorded (target: under 500 ms from the laptop). Cold start time is recorded.
- [ ] The deploy method and invoke URL format are recorded for T-40.

## Test scenario
1. Run `npx tsx smoke/agentcore-mcp/client.ts --target local`.
2. Run `npx tsx smoke/agentcore-mcp/client.ts --target agentcore`.
3. Expect, for each run: `PASS protocol=2025-11-25 tools=2 ping_p50=<n>ms elicitation=accepted`.

## Fallbacks
Use them in this order:
1. **ECS Fargate behind an Application Load Balancer**, with sticky sessions. Stateful MCP and elicitation work.
2. **Lambda with a Function URL** and response streaming.
   - Under 2025-11-25, elicitation isn't reliable there.
   - Set `CHECKOUT_CONFIRM=tool`. `checkout_cart` then returns a summary, and `confirm_checkout` completes it (T-26 supports both modes).
3. **Run the server locally for the demo.** Keep this ticket's AgentCore deployment and screenshot as the S7 proof.

**ARM64 builds:** if local builds are slow or fail, build in AWS CodeBuild. The starter toolkit does this by default.

## Result
_The agent fills this in._
