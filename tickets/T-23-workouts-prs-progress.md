# T-23 · Workouts, PRs and progress

| Field | Value |
|---|---|
| Wave | 2: MCP server tools |
| Demo importance | VISIBLE (S6 chart; the PR logic powers the S3 PR card) |
| Size | M |
| Depends on | T-20, T-11 (exercise list and seed) |
| Owns | `server/src/tools/training-log/`, `server/src/domain/training/` |
| Approval needed | No |
| Status | DONE |

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
- [x] "bench", "flat bench" and "barbell bench" all resolve to barbell bench press.
- [x] PR flags are correct on seed data (tests).
- [x] `get_progress` for bench returns a rising 6-week e1RM series (S6).
- [x] Both tools take under 500 ms.
- [x] Outputs validate against the contracts.

## Test scenario
1. Run `npm test -w server -- training`. Expect green.
2. Run `npm run db:reset`. Call `get_progress {metric:"bench"}`. Expect 6 weekly points, rising.
3. Call `log_workout` with a set above the seed's best. Expect a PR flag and the `pr` card.

## Result
**DONE 2026-10-22.** All 5 acceptance criteria pass; the test scenario runs green.

- **Built:** `server/src/domain/training/index.ts` (`resolveExercise`, `detectPRs`, `prEntries`, `e1rm`, `E1RM_MAX_REPS`, `localDate`; exported for T-24); `server/src/tools/training-log/index.ts` (`log_workout`, `get_progress`); `server/test/training.test.ts` (16 tests).
- **Resolver:** normalize (lowercase, punctuation out) → exact name/alias/id, also with plural `s` stripped → in-memory pg_trgm-style trigram similarity (threshold 0.3, a tie counts as no match) → no match returns the 3 closest names, which `log_workout`/`get_progress` put in the error text so Alexa can ask. Exercises are cached in memory after the first call.
- **PR rules (same as the seed):** e1RM PR needs an earlier set of the exercise and a higher e1RM (sets over 12 reps are stored with their e1RM but never count); rep-best PR needs an earlier set at the same rep count and a heavier weight. `log_workout` checks and inserts set by set, so set 2 is compared with set 1.
- **get_progress:** one point per Monday-start week (the week's last dated value), window `today − 7×range_weeks` to today, last `range_weeks` points kept. e1rm: best e1RM of 1–12-rep sets; bodyweight: weekly mean; calories/protein: weekly mean of daily totals, today left out (partial day).
- **Verification:** `npm test -w server -- training`: `Tests 16 passed (16)`; full server suite `Tests 34 passed (34)`; `tsc --noEmit -p server` clean. After `npm run db:reset`, Inspector CLI `get_progress {metric:"e1rm", exercise:"bench"}` → series 88.7, 91.8, 92.5, 95, 98.2, 98.7 (2026-09-11 … 2026-10-16), summary +10 kg (11.3%), `ui://cards/progress`. `log_workout {exercise:"barbell bench", sets: 80×8, 80×8, 80×7}` → `prs`: e1rm 101.3 (prev 98.7, +2.6) and rep_best 80 kg × 8 (prev 77.5), both on set 1 only; `ui://cards/pr`; volume 1840 kg. Latency from the server log: log_workout 46 ms; get_progress 459 ms on the first call after start (pool connect + exercise cache), 20–30 ms warm. DB reset again afterwards.
- **Deviations:** the contract wins over the ticket text: `get_progress` takes `metric:"e1rm"` plus `exercise:"bench"` (`metric:"bench"` fails contract validation); the summary is start/end/change/change_pct (no best/trend fields); `log_workout` has no `unit` (kg only). The `pr` card URI is always attached (registry sets it per tool); empty `prs` means no PR, per the contract. A set that earns both kinds yields two `Pr` entries (`e1rm` and `rep_best`); `rep_best.previous_e1rm_kg` is the e1RM of the previous best weight at that rep count.
- **Fallbacks used:** none. Dev check ran on port 8011, because the `dayform-server-1` container holds 8001.

**Orchestrator close-out (2026-10-22):** verified 16 tests; get_progress e1rm/bench = 88.7→98.7 (6 weekly points, +11.3%); log_workout 80×8 → e1RM PR 101.3 (+2.6) and rep-best PR, pr card, 225 ms. DONE.
