# T-23 · Workouts, PRs and progress

| Field | Value |
|---|---|
| Wave | 2: MCP server tools |
| Demo importance | VISIBLE (S6 chart; the PR logic powers the S3 PR card) |
| Size | M |
| Depends on | T-20, T-11 (exercise list and seed) |
| Owns | `server/src/tools/training-log/`, `server/src/domain/training/` |
| Approval needed | No |
| Status | TODO |

## Goal
Build the tools `log_workout` and `get_progress`, plus the exercise resolver and PR detection. T-24 reuses the resolver and PR detection.

## Why it matters for the demo
- S6 shows a 6-week bench press chart.
- S3 depends on correct PR detection for its celebration card.

## Read first
- [DESIGN.md D6](../DESIGN.md#1-agreed-decisions), [§4 MCP tools](../DESIGN.md#4-mcp-tools)
- `data/exercises/exercises.json` (T-11)

## Tasks
1. **Exercise resolver.**
   - Steps: normalize → exact alias → trigram match → no match.
   - On no match, return the 3 closest names, so Alexa can ask.
   - Send any missing aliases to the orchestrator. T-11 owns the data file.
2. **Estimated 1RM**, Epley formula: `weight × (1 + reps / 30)`. Use it for 1–12 reps. Above 12 reps, store the set, but leave e1RM out of PR checks.
3. **PR detection** (shared function `detectPRs(set)`). Two PR types:
   - best e1RM ever for the exercise
   - best weight ever at that rep count
4. **`log_workout`.**
   - **Input:** `exercise`, plus either `sets: [{reps, weight, unit?, rpe?}]` or `cardio: {duration_min, distance_km?}`.
   - It saves a completed session.
   - **Returns** PR flags for each set. If there's a PR, it attaches the `pr` card; if not, a short summary.
5. **`get_progress`.**
   - **Input:** `metric` (an exercise name, `bodyweight` or `calories`), and `range_weeks?` (default 6).
   - **Returns** the series and a summary (change, best, trend), with the `progress` card.
6. **Tests:** alias resolution, PR detection on the seed, the progress series.

## Acceptance criteria
- [ ] "bench", "flat bench" and "barbell bench" all resolve to barbell bench press.
- [ ] PR flags are correct on seed data (tests).
- [ ] `get_progress` for bench returns a rising 6-week e1RM series (S6).
- [ ] Both tools take under 500 ms.
- [ ] Outputs validate against the contracts.

## Test scenario
1. Run `npm test -w server -- training`. Expect green.
2. Run `npm run db:reset`. Call `get_progress {metric:"bench"}`. Expect 6 weekly points, rising.
3. Call `log_workout` with a set above the seed's best. Expect a PR flag and the `pr` card.

## Result
_The agent fills this in._
