# T-04 · Smoke test: Aurora PostgreSQL + Data API

| Field | Value |
|---|---|
| Wave | 0: Setup and smoke tests |
| Demo importance | ENABLER |
| Size | S |
| Depends on | T-00 |
| Owns | `smoke/aurora/` |
| Approval needed | Yes: creates an Aurora cluster and a Secrets Manager secret |
| Status | BLOCKED: local Postgres PASS; cluster approved, but `create-cluster.sh create` was refused by the Claude Code auto-mode permission classifier ("Production Deploy"); needs a permission rule or a manual run |

## Goal
Prove that Aurora PostgreSQL Serverless v2 works through the RDS Data API, with pg_trgm fuzzy search, from the laptop and from AWS compute. Choose the database library for the build.

## Why it matters for the demo
Food matching (S1), PRs and progress (S3, S6), the cart (S4) and the brief (S5) all read from this database. A slow or failing query shows on camera as dead air.

## Read first
- [DESIGN.md §6 Data model](../DESIGN.md#6-data-model) and [§12 Demo-first simplifications](../DESIGN.md#12-demo-first-simplifications)

## Tasks
1. **Approval needed.** Create an Aurora PostgreSQL Serverless v2 cluster in us-east-1:
   - Use the newest PostgreSQL version Aurora offers.
   - Turn on the Data API, and store the credentials in Secrets Manager.
   - Set capacity to min 0.5 ACU, max 4 ACU, while building and recording. Use min 0 only for long idle periods. At 0 the cluster pauses, and the first query waits for it to wake up.
2. Turn on `pg_trgm` (`CREATE EXTENSION pg_trgm;`).
3. Create the table `smoke_foods(name text)`. Insert 1,500 food names (any list), and add a GIN trigram index.
4. Run `SELECT name, similarity(name, :q) AS s FROM smoke_foods ORDER BY s DESC LIMIT 5` for `roti`, `rotee`, `chiken karahi` and `biryani`. Record the top results.
5. Measure the Data API latency from the laptop: p50 of 20 queries.
6. **Test from AWS.** Run the same query from an AWS runtime with an IAM role: the T-03 AgentCore runtime, or a test Lambda. The role needs `rds-data:ExecuteStatement` and `secretsmanager:GetSecretValue`.
7. Run local Postgres in Docker (`postgres:17`, which includes pg_trgm), with the same table.
8. **Choose the database library.** Suggestion: Drizzle ORM. It has a node-postgres driver (local) and an AWS Data API driver (Aurora), so the same query code runs both ways. Record the decision and any problems.
9. Write the results to [SMOKE-RESULTS.md](../SMOKE-RESULTS.md) §T-04.

## Acceptance criteria
- [ ] Data API queries work from the laptop and from an AWS role.
- [ ] Trigram search puts "roti" first for the query "rotee".
- [ ] Data API p50 from the laptop is recorded.
- [ ] Local Docker Postgres runs the same queries.
- [ ] The library is chosen, and it works with both drivers.

## Test scenario
1. Run `npx tsx smoke/aurora/run.ts --target local`.
2. Run `npx tsx smoke/aurora/run.ts --target aurora`.
3. Expect, for each run: the top-5 results for each query, and `p50=<n>ms`.

## Fallbacks
Use them in this order:
1. **Aurora with a direct Postgres connection inside a VPC**, using AgentCore VPC mode.
2. **Amazon RDS for PostgreSQL** on the smallest provisioned instance.
3. **Local Postgres for the demo.** Show Aurora only as deployed infrastructure.
4. **DynamoDB** for records, plus in-memory fuzzy search (Fuse.js) over the 1,500 foods inside the server. 1,500 items fit in memory easily.

## Result
Phase 1 (local) done 2026-10-22; Phase 2 (Aurora) prepared, not run. Details and numbers: [SMOKE-RESULTS.md §T-04](../SMOKE-RESULTS.md).

- Files: `smoke/aurora/run.ts` (`--target local|aurora`), `gen-foods.ts` → `foods.txt` (1,500 names), `create-cluster.sh`, `package.json` (own deps).
- Local: container `dayform-pg` (postgres:17 = 17.11), 127.0.0.1:5433, db `dayform`; `DATABASE_URL` in `.env.local`. "rotee" → "roti" first; p50=4ms.
- Library: Drizzle ORM 0.45.4, node-postgres driver (local) and aws-data-api/pg driver (Aurora). The Data API path is untested.
- Deviations: engine 17.11 instead of 18.x, because the Data API support table covers PG 17 only (FRICTION F-006). Test from an AWS role (task 6) not done.
- Acceptance: 2/5 (rotee→roti, local Docker). Open: Data API from the laptop and from a role, Data API p50, the library on the Data API driver.
