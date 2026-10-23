# T-07 · Smoke test: EventBridge Scheduler + Lambda

| Field | Value |
|---|---|
| Wave | 0: Setup and smoke tests |
| Demo importance | CUT-FIRST |
| Size | S |
| Depends on | T-00, T-04 |
| Owns | `smoke/scheduler-lambda/` |
| Approval needed | Yes: creates a Lambda function, an IAM role and an EventBridge schedule |
| Status | DONE |

## Goal
Prove that EventBridge Scheduler can run a Lambda function that calls Opus on Bedrock and writes a row to Aurora.

## Why it matters for the demo
In the real product, the overnight job runs every night. The demo uses the "skip to morning" button instead, so this ticket is low priority. It does add one more AWS service to the AWS Builder story.

## Read first
- [DESIGN.md D18](../DESIGN.md#1-agreed-decisions) and [§8 Demo controls](../DESIGN.md#8-demo-controls)

## Tasks
1. Write a Lambda handler on the newest Node.js runtime Lambda offers. It calls Opus with a one-line prompt, then inserts one row through the Data API (the T-04 cluster).
2. **Approval needed.** Deploy it with CDK or the console. The IAM role needs Bedrock invoke, `rds-data:ExecuteStatement` and `secretsmanager:GetSecretValue`.
3. Invoke it once by hand. Check that the row exists.
4. **Approval needed.** Create an EventBridge Scheduler schedule 5 minutes ahead, in time zone `Asia/Karachi`. Check that it fires once. Then disable the schedule.
5. Write the results to [SMOKE-RESULTS.md](../SMOKE-RESULTS.md) §T-07.

## Acceptance criteria
- [ ] A manual invocation writes a row.
- [ ] A scheduled invocation writes a row.
- [ ] The schedule is disabled after the test.

## Test scenario
1. Run `aws lambda invoke --function-name <name> out.json`.
2. Query the table. Expect one new row.
3. Wait for the schedule. Expect one more row.

## Fallbacks
- **In-process job:** run the overnight job inside the MCP server process, triggered only by `POST /admin/advance-day` (T-27). This is enough for the demo.

## Result
- Manual invoke writes a row: PASS. Scheduled invoke (Asia/Karachi `at(...)`, 5 min ahead) writes a row: PASS. Schedule disabled: PASS. Numbers in [SMOKE-RESULTS.md §T-07](../SMOKE-RESULTS.md).
- Files: `smoke/scheduler-lambda/{handler.ts,template.yaml,deploy.sh,query.sh,package.json}`. Build with `npm run build` (esbuild, CJS, `dist/lambda.zip`).
- Deviations: CloudFormation (plain template) instead of CDK, per orchestrator. Model is Nova 2 Lite (D21), not Opus. Runtime `nodejs24.x`. The Lambda creates `smoke_overnight` with `CREATE TABLE IF NOT EXISTS` on each run.
- Stack left in place with the schedule DISABLED; `deploy.sh destroy` removes it. Fallback not used.
