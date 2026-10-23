# T-27 · Overnight job and morning brief

| Field | Value |
|---|---|
| Wave | 2: MCP server tools |
| Demo importance | HERO (S5) |
| Size | M |
| Depends on | T-21 (check-in), T-24 (target rules), T-25 (plan generator), T-20 |
| Owns | `jobs/overnight/`, `server/src/tools/brief/` |
| Approval needed | Only for the Lambda and schedule deployment (that's in T-40) |
| Status | DONE |

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
**Status: REVIEW** (2026-10-22). Built:
- `server/src/tools/brief/overnight.ts`: `runOvernight(date)` (6 logged steps), `prepareDay(date, mode)`, `applyCached`, `dumpRows`, number check (`unknownNumbers`), guardrails (`enforceGuardrails`), insight candidates. Three small Nova 2 Lite calls (targets-change sentence, next-session review, brief text). Code fills every card number from the database; the model's numbers are compared to it; a mismatch regenerates once, then the field is dropped (number from the DB, text from code: `insightFallback`, `checkInFallback`, "Good morning, <name>.").
- `server/src/tools/brief/index.ts`: `get_morning_brief`, no LLM call, 6–33 ms.
- `server/src/core/admin.ts` advance-day (orchestrator-authorized): `prepareDay(next day, OVERNIGHT_MODE)`, clock to 07:00 next day in DEMO_TZ, returns `{ok, clock, overnight:{mode, ms}, date, steps[]}`.
- `jobs/overnight/`: `cli.ts` (`overnight`), `cache.ts` (`overnight:cache`), `lambda.ts` (+ `build` via esbuild; bundles to 2.4 MB and loads), `cache/overnight-cache.json`.
- Tests: `server/test/brief.test.ts` (8), manual probe `server/test/brief-s5.probe.ts`.

Verification (2026-10-22, local Postgres, Nova 2 Lite):
- `npm run db:reset && npm run overnight -w @dayform/jobs-overnight -- --live` on the bare seed: steps 1/6–6/6 in order, ends `step 6/6 brief saved`, **6987 ms** (meal plan generated: 3.4 s of it). `overnight:cache` live run on the bare seed: **9546 ms**.
- `npm test -w @dayform/server -- brief`: 8 passed (number check, guardrails, lying-model regenerate-then-drop, every card number vs DB, cached identical across two resets, advance-day < 1 s, tool < 500 ms, error when no brief).
- Probe on `PORT=8013 OVERNIGHT_MODE=cached`: advance-day 200 in 54–111 ms; `get_morning_brief` 24/6 ms with greeting, yesterday, insight "You average 163 g of protein on training days but only 103 g on rest days.", "Legs day, lead lift Barbell back squat 102.5 kg x 5", targets change −110 kcal (2360 → 2250) "You lost 0.3 kg this week instead of 0.4 kg, so I reduced 110 calories daily."; `plan_meal_prep` after it: ready in 8–10 ms. `OVERNIGHT_MODE=live` advance-day on 8014: 3357 ms, same brief.

Deviations:
- `greeting` is not in the BriefCard contract: stored in `briefs.brief` next to the card and spoken in the tool text; the card already says "Good morning".
- `get_morning_brief` re-reads `yesterday` (eaten, targets, workout, PRs) from the database at call time, so S5 shows what the take logged in S1–S3, not the bare seed the cache was made on.
- On a failed number check the targets-change reason falls back to a code sentence (not dropped), since the card needs it.
- `weight.change_kg_week` is T-21's EMA trend (−0.28), not the README's 7-day means (−0.23).

Fallbacks used: none (Nova 2 Lite answered every call first try).

**Orchestrator close-out (2026-10-22):** verified 8 brief tests, full server suite 89/89 (two stale test expectations fixed), cached advance-day 93 ms, get_morning_brief 36 ms with leg-day squat 102.5×5, protein insight and the −110 kcal reason; plan_meal_prep 10 ms after reset. Decision: reset loading the cached plan (S4 instant) is intended. S5 script line becomes "lost 0.3 kg, slower than the planned 0.4, so I trimmed 110 calories". DONE.
