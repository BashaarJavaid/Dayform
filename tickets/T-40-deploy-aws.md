# T-40 · Deploy to AWS

| Field | Value |
|---|---|
| Wave | 4: Deploy and harden |
| Demo importance | VISIBLE (S7 shows it running on AWS) |
| Size | M |
| Depends on | T-20, T-11, T-27, plus the smoke infrastructure from T-03, T-04 and T-07 |
| Owns | `infra/` |
| Approval needed | Yes: every deploy and every destroy |
| Status | TODO |

## Goal
Deploy the server, the database and the overnight job to AWS in us-east-1 with one command, then point the simulator at the deployed server.

## Why it matters for the demo
- S7 proves the add-on runs on Amazon's stack: AgentCore, Aurora, Bedrock, EventBridge.
- It is also the evidence for the AWS Builder mini challenge.

## Read first
- [DESIGN.md §2 Architecture](../DESIGN.md#2-architecture), [§9 Environment variables](../DESIGN.md#9-environment-variables), [§10 Services and fallbacks](../DESIGN.md#10-services-and-fallbacks)
- [SMOKE-RESULTS.md](../SMOKE-RESULTS.md) §T-03, §T-04, §T-07: the deploy methods that worked.

## Tasks
1. **CDK app** (TypeScript) with these stacks:
   - **Data:**
     - Aurora PostgreSQL Serverless v2, with the Data API on
     - a Secrets Manager secret
     - min 0.5 ACU, max 4 ACU
   - **Server:**
     - an ECR repository and the ARM64 image
     - an AgentCore Runtime with stateful MCP sessions and SigV4 inbound auth
     - an IAM role with Bedrock invoke rights for the chosen models, `rds-data` and `secretsmanager`
     - environment variables from DESIGN.md §9
   - **Jobs**, only if T-07 passed:
     - the overnight Lambda (from T-27)
     - an EventBridge Scheduler schedule at 03:00 Asia/Karachi
2. **Runtime deploy method:** use the one that worked in T-03. If CDK has no construct, use the L1 resource or the AgentCore starter toolkit, called from a script.
3. **Database:** migrate and seed Aurora with `npm run db:reset -- --target aurora` (**approval needed**; it writes to AWS).
4. **Outputs:** write the stack outputs (`MCP_URL`, ARNs) to `.env.aws`, which git ignores.
5. **Scripts:**
   - `npm run deploy` (**approval needed**)
   - `npm run destroy` (**approval needed**; never run automatically)
   - `npm run aws:status`
6. **Check the deployed stack.** Run the Demo Monitor's scene runner against AgentCore, and record the p50 latency for each tool.
7. **S7 clips:**
   - the AgentCore console showing the runtime
   - CloudWatch logs for one tool call
   - the Aurora cluster page

   Save them to `video/assets/`.

## Acceptance criteria
- [ ] `npm run deploy` creates all stacks with no manual console steps (except approvals).
- [ ] The simulator runs S1–S6 against AgentCore in text mode.
- [ ] p50 latency for each tool is recorded. Tools without an LLM call are under 500 ms.
- [ ] `npm run destroy` is documented in the README draft, and not run.
- [ ] The S7 clips are saved.

## Test scenario
1. Run `npm run deploy` (after the user approves). Expect the stack outputs, and `.env.aws` written.
2. Run `npm run sim:backend` with `MCP_URL` from `.env.aws` and `MCP_AUTH=sigv4`, then `npm run demo:scene -- S1`. Expect a PASS, with latency lines.

## Fallbacks
- **AgentCore deploy fails:** run the demo against the local server. Show the T-03 AgentCore deployment as the S7 proof.
- **Aurora deploy fails:** use local Postgres for the demo, and the T-04 cluster as the proof.
- **CDK has no AgentCore construct:** use the starter toolkit for the runtime, and CDK for everything else.

## Result
_The agent fills this in._
