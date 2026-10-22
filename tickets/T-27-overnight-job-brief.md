# T-27 · Overnight job and morning brief

| Field | Value |
|---|---|
| Wave | 2: MCP server tools |
| Demo importance | HERO (S5) |
| Size | M |
| Depends on | T-21 (check-in), T-24 (target rules), T-25 (plan generator), T-20 |
| Owns | `jobs/overnight/`, `server/src/tools/brief/` |
| Approval needed | Only for the Lambda and schedule deployment (that's in T-40) |
| Status | TODO |

## Goal
Build the overnight job, which prepares the next day while the user sleeps, and the tool `get_morning_brief`.

## Why it matters for the demo
S5 is the "it thought about me overnight" moment. It shows memory across sessions and real reasoning.

## Read first
- [DESIGN.md D18](../DESIGN.md#1-agreed-decisions), [§7 LLM and code](../DESIGN.md#7-llm-and-code), [§8 Demo controls](../DESIGN.md#8-demo-controls)
- [DEMO-SCRIPT.md](../DEMO-SCRIPT.md) S5

## Tasks
1. **Library `runOvernight(date)`.** Lambda, the admin route and the CLI all use it. Steps, in order:
   1. **Yesterday:** totals against targets, workouts, PRs.
   2. **Check-in day:** run `runWeeklyCheckIn` (T-21). Then Opus writes one or two sentences explaining the change, from the reason codes and numbers.
   3. **Next-session targets** for the next program day:
      - Compute them with the T-24 rule.
      - Opus reviews them inside guardrails: load change within ±5%, reps within the range.
      - Code enforces the guardrails. Store the targets in `next_targets`, with reasons.
   4. **Meal plan:** if no fresh plan covers the next 4 days, call `generatePlan` (T-25).
   5. **Morning brief:** Opus writes structured JSON:
      - `greeting`
      - `yesterday` (facts)
      - `insight`: one pattern from the last 14 days, for example "protein is low on rest days"
      - `today`: the workout and key targets
      - `targets_change`: the reason, or null

      Validate it with zod. Code checks that every number in the brief matches stored data. On a mismatch, regenerate once, then drop the wrong field.
   6. **Save** every output with `for_date`.
2. **Lambda handler** in `jobs/overnight/lambda.ts`. The schedule (03:00 Asia/Karachi) is deployed in T-40, only if T-07 passed.
3. **Admin route.** The T-20 route `advance-day` calls `runOvernight`, then moves the clock to 07:00. Send progress messages during the run; the simulator's night animation uses them.
4. **Cached mode** (`OVERNIGHT_MODE=cached`) for the demo:
   - `npm run overnight:cache` runs `runOvernight` live once, on the seed, and saves the output to `jobs/overnight/cache/overnight-cache.json`.
   - The T-11 reset loads that file.
   - In cached mode, `advance-day` moves the clock and serves the cached output.
   - S5 is then instant, and the same every take.
5. **`get_morning_brief`.** Returns the brief for today on the demo clock, with the `brief` card.
6. **CLI:** `npm run overnight -- --date <d> [--live]`.
7. **Tests:**
   - number checks in the brief
   - guardrail enforcement
   - cached mode gives identical output across resets

## Acceptance criteria
- [ ] A live run on the seed completes. The duration is recorded.
- [ ] Every number in the brief matches the database (test).
- [ ] The brief has the targets-change sentence on check-in day.
- [ ] `get_morning_brief` takes under 500 ms.
- [ ] Cached mode gives identical output after each reset.
- [ ] `plan_meal_prep` after `advance-day` returns the fresh plan instantly.

## Test scenario
1. Run `npm run db:reset && npm run overnight -- --live`. Expect the steps to log in order, ending with "brief saved".
2. Call `get_morning_brief`. Expect a greeting, yesterday's facts, one insight, today's legs workout with a squat target, and the targets-change reason.
3. Set `OVERNIGHT_MODE=cached`. Run `npm run db:reset`, then `curl -X POST …/admin/advance-day`. Expect it to finish in under 1 s, with the same brief as the cache.

## Fallbacks
- **Opus slow or failing during a live run:** use the fallback model from T-01. For the demo, use cached mode.

## Result
_The agent fills this in._
