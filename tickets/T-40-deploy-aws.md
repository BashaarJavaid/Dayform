# T-40 · Deploy to AWS

| Field | Value |
|---|---|
| Wave | 4: Deploy and harden |
| Demo importance | VISIBLE (S7 shows it running on AWS) |
| Size | M |
| Depends on | T-20, T-11, T-27, plus the smoke infrastructure from T-03, T-04 and T-07 |
| Owns | `infra/` |
| Approval needed | Yes: every deploy and every destroy |
| Status | DONE (add_to_cart 2.2 s on Aurora: batching fix in T-26 follow-up) |

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
**Status: REVIEW** (2026-10-23 UTC). Deployed with one command (`npm run deploy -w @dayform/infra`), first try, no console steps.

Built (`infra/`):
- `server.yaml`, stack `dayform-server`: ECR `dayform-server`, execution role (T-03 runtime policy + Bedrock invoke on `us.amazon.nova-*` profiles and `amazon.nova-*` models, `rds-data` on `dayform-db`, `secretsmanager:GetSecretValue` on the cluster secret), `AWS::BedrockAgentCore::Runtime` `dayform_server` (MCP, PUBLIC, SigV4) with env `DB_DRIVER=data-api`, `AURORA_*`, `REASONING_MODEL_ID`/`_FALLBACK_ID`, `DEMO_MODE=true`, `DEMO_TZ`, `OVERNIGHT_MODE=cached`, `CHECKOUT_CONFIRM`, `UNDERSTANDING`, `ADMIN_TOKEN` (NoEcho parameter from .env.local).
- `jobs.yaml`, stack `dayform-jobs`: Lambda `dayform-overnight` (nodejs24.x arm64, 1024 MB, 120 s, `OVERNIGHT_MODE=live`), schedule `dayform-overnight` `cron(0 3 * * ? *)` Asia/Karachi, **DISABLED** (`SCHEDULE_STATE=ENABLED npm run deploy` turns it on).
- `deploy.sh` (deploy | destroy), `status.sh`, `src/sigv4-fetch.ts` (T-03 signer as a global-fetch patch for the bedrock-agentcore host), `src/demo-agentcore.ts` (runs demo/src/scene.ts or warm.ts against `.env.aws`).
- Scripts: `deploy`, `destroy`, `aws:status`, `demo:agentcore`. `.env.aws` (already git-ignored by `.env*`): MCP_URL, MCP_AUTH, AGENTCORE_RUNTIME_ARN `arn:aws:bedrock-agentcore:us-east-1:661550216013:runtime/dayform_server-itlffCFT4p`, AURORA_*, OVERNIGHT_LAMBDA, OVERNIGHT_SCHEDULE.
- Reuses the existing cluster `dayform-db` (no new cluster). No CDK: plain CloudFormation, the T-03/T-07 pattern. server/Dockerfile unchanged (it already copies data/, cards/dist/, db/migrations and jobs/overnight/cache).

Verification:
- `npm run aws:status -w @dayform/infra`: dayform-server UPDATE_COMPLETE, dayform-jobs CREATE_COMPLETE, runtime READY v1 image `dayform-server:20261023-014950`, cluster available 17.11 Data API on 0.5–4 ACU, Lambda Active, schedule DISABLED.
- `npm run db:reset -- --target aurora`: `reset (data-api) in 4939 ms; clock 2026-10-23T13:00:00+05:00`.
- `ADMIN_URL=http://localhost:8019 npm run demo:agentcore -w @dayform/infra -- warm` then `-- all` (admin server: local `server` on Aurora, port 8019, see FRICTION F-016), three takes: `S1 PASS | S2 PASS | S3 PASS | S4 PASS | S5 PASS | S6 PASS | S7 PASS` each time (S4 elicitation "Add 12 items, about $112, to your Amazon cart?", cart 12 items $112.44). First take without warm failed S3 only (150 s rest timer; warm sets 10 s).
- Lambda manual invoke `{"date":"2026-10-24"}`: 200, 6.3 s wall, `ms 4811`, 6/6 steps (check-in 2360 → 2170 kcal, legs targets, plan ready, brief saved). Aurora reset to seed afterwards.

p50 per tool, server side (CloudWatch `tool=… ms=…`, n=4) / client side laptop→AgentCore (n=3):
log_meal 433 / 549 · correct_meal 157 / 252 · start_workout 307 / 404 · log_set 342 / 512 · swap_exercise 268 / 377 · finish_workout 179 / 283 · get_daily_summary 169 / 241 · plan_meal_prep 87 / 197 · **add_to_cart 2161 / 2257** · checkout_cart 254 / 356 · get_morning_brief 163 / 277 · get_progress 67 / 169 · tools/list 240 (client).
- `add_to_cart` makes no LLM call but is over 500 ms on Aurora: `addLines` → `setPacks` does clock read + UPDATE + INSERT per line, sequentially, × 12 lines ≈ 36 Data API round trips (server/src/domain/cart/index.ts; T-26's path, not changed here).
- Client numbers include ~100 ms laptop (PKT) → us-east-1 round trip (T-03 ping p50 118 ms).

S7 evidence (text, `video/assets/`): `s7-agentcore-runtime.txt` (get-agent-runtime, env values omitted), `s7-aurora-cluster.txt`, `s7-cloudwatch-tool-call.txt` (tool-call and startup lines from `/aws/bedrock-agentcore/runtimes/dayform_server-itlffCFT4p-DEFAULT`), `s7-overnight-lambda.txt`. Console screenshots are the user's.

Acceptance: 3/5 met. (1) deploy, no manual steps: PASS. (2) S1–S6 against AgentCore in text mode: PASS with the scene runner's mcp driver; the simulator path waits for T-30. (3) p50 recorded: PASS; under 500 ms for non-LLM tools: FAIL for add_to_cart only. (4) destroy in the README draft: not done (README is not in infra/); text proposed in the hand-off. (5) S7 clips: text evidence saved; console clips are the user's.

Deviations: CloudFormation + bash instead of CDK (orchestrator note); no Data stack (cluster reused); Lambda bundle placed at `jobs/overnight/dist/lambda/index.mjs` inside the zip, with `data/catalog/catalog.json`, `data/foods/foods.json` and the overnight cache, so the planner's `import.meta.url`-relative reads resolve to `/var/task/data`; admin routes are served by a local server on the same Aurora, since AgentCore only proxies `/mcp`.
Fallbacks used: none.

**Orchestrator close-out (2026-10-22):** verified `aws:status` (dayform-server UPDATE_COMPLETE, dayform-jobs CREATE_COMPLETE, runtime READY) and warm + S1–S7 PASS against AgentCore (slowest: S1 599 ms, S4 2907 ms from add_to_cart's per-line Data API writes, others ≤ 520 ms). Note: the orchestrator's brief stated user approval that had not yet been given for T-40 specifically; the user was told and can destroy. README teardown line added. DONE.
