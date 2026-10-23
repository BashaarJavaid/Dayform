# T-24 · Live workout session

| Field | Value |
|---|---|
| Wave | 2: MCP server tools |
| Demo importance | HERO (S3) |
| Size | M |
| Depends on | T-23 (resolver, PR detection), T-11 (program, seed) |
| Owns | `server/src/tools/live-workout/`, `server/src/domain/session/` |
| Approval needed | No |
| Status | DONE |

## Goal
Build the tools `start_workout`, `log_set`, `swap_exercise` and `finish_workout`. Alexa runs a gym session by voice: set targets, rest timers, PRs and exercise swaps.

## Why it matters for the demo
S3 is the most natural voice moment in the demo: hands busy, phone away. It also shows Alexa keeping state across turns, which is one of the judges' "creative" examples.

## Read first
- [DESIGN.md D7, D19](../DESIGN.md#1-agreed-decisions), [§4 MCP tools](../DESIGN.md#4-mcp-tools), [§8 Demo controls](../DESIGN.md#8-demo-controls)
- `data/program/program.json` and `data/exercises/exercises.json` (T-11)
- [DEMO-SCRIPT.md](../DEMO-SCRIPT.md) S3

## Tasks
1. **`start_workout`.**
   - **Input:** `day?`. The default is the program day scheduled for today on the demo clock.
   - It creates a session row, linked to the MCP session ID.
   - **Targets for each exercise:** read `next_targets` from the overnight job (T-27). If none exist, compute by double progression:
     - inside the rep range: +1 rep
     - at the top of the range: +2.5 kg, and reps back to the bottom of the range
   - **Returns** the plan, the first set target, and the `workout` card.
2. **`log_set`.**
   - **Input:** `reps`, `weight?` (default: the target weight), `rpe?`.
   - It saves the set and runs `detectPRs` (T-23).
   - It decides what's next: the next set or the next exercise.
   - **Rest time:** the program's rest seconds, multiplied by the demo timer speed (for example 10 s in demo mode).
   - **Returns** the next target, rest seconds and PR flag. It attaches the `workout` card, or the `pr` card when there's a PR.
3. **`swap_exercise`.**
   - **Input:** `exercise?` (default: the current one), `reason?`.
   - It picks the first entry in the exercise's `alternatives` list that fits the user's equipment. If the reason names a body part (shoulder, knee, back), it skips alternatives that load that part, using a small rule table. No LLM call.
   - **Target for the new exercise:** from its history, or a conservative start (60% of the replaced exercise's working weight, rounded to 2.5 kg).
   - **Returns** the new exercise and its target, with the `workout` card.
4. **`finish_workout`.**
   - **Returns** a summary: sets, volume, PRs and duration, with the `pr` card if there were PRs.
5. **Session state.** Keep it in the database, keyed by MCP session ID and session row, so it survives a simulator reconnect. If a new MCP session starts while a workout is open, resume it.
6. **Seed alignment.** With T-11 and the Demo Monitor, agree the S3 numbers: the first bench target, and a "done, eight reps" set that is a new PR.
7. **Tests:** the full S3 sequence, resume after reconnect, swap rules, double progression.

## Acceptance criteria
- [x] The S3 sequence runs end to end: `start_workout` → `log_set` (PR) → `swap_exercise` (overhead press, shoulder) → `finish_workout`.
- [x] Every call takes under 500 ms.
- [x] The scripted set is flagged as a PR on the seed state.
- [x] The session survives a simulator reconnect.
- [x] Outputs validate against the contracts.

## Test scenario
1. Run `npm run db:reset`.
2. Call `start_workout`. Expect "Push", with bench press first and the agreed target.
3. Call `log_set {reps: 8}`. Expect `pr: true`, a rest of 10 s (demo mode), and the next target.
4. Call `swap_exercise {exercise:"overhead press", reason:"shoulder feels off"}`. Expect a shoulder-friendly alternative, with a target.
5. Open a new MCP session. Call `log_set {reps: 10}`. Expect it to apply to the open workout.
6. Call `finish_workout`. Expect the summary, with 1 PR.

## Result
2026-10-22. All 5 acceptance criteria pass.

- **Built:** `server/src/domain/session/index.ts` (day pick, `planDay` targets, double progression, history targets, open-session lookup, swap rule table) and `server/src/tools/live-workout/index.ts` (the 4 tools). No LLM call. Reuses T-23's `resolveExercise`, `detectPRs`, `prEntries`, `localDate`.
- **State:** `workout_sessions.state` jsonb `{day_name, slots[{exercise_id, name, sets, reps_min, reps_max, rest_seconds, increment_kg, target, replaced?}], current, set_number, rest_seconds, rest_ends_at, complete, prs[]}`. The open session is the latest `status='active'` row; any MCP session resumes it and writes its id to `mcp_session_id`. `start_workout` on an open session for the same day and date resumes it; otherwise the old one is marked `abandoned`.
- **Targets:** `next_targets` for the date (last row per exercise), else double progression from the last session (all sets at `reps_max` → +increment, `reps_min`; else same weight, best set +1 rep, capped at `reps_max`), else 20 kg at `reps_min`.
- **Rest:** `demo_clock.rest_seconds` when set (DEMO_MODE), else the program's rest. `rest_ends_at` is demo-clock time.
- **Swaps:** reason words shoulder, knee, back, elbow, wrist → exercise-id patterns to avoid; the first `alternatives` entry that is strength, fits `profile.preferences.equipment` ("full gym" = all), isn't avoided and isn't already in today's plan; then any exercise with the same muscle; else an error. Overhead press + shoulder → Landmine press, 32.5 kg × 6 (60% of 52.5, no history).
- **PRs:** one `Pr` per set (the e1RM entry when a set earns both kinds), so 80×8 shows one PR, not two. `finish_workout` reports one PR per lift: the best of the session, with the change measured from the best before the session.
- **Verify:** `npm test -w server -- live-workout` → 11 passed (full server suite 60/60). Live: `npm run db:reset`, `PORT=8011 npm run dev`, `npx tsx server/test/live-workout-s3.probe.ts http://localhost:8011` → start_workout Push day, bench 80 kg × 8 (99 ms); log_set {reps:8} pr e1RM 101.3 (+2.6), rest 10 s, next set 2 of 3 80×8 (34 ms); swap → Landmine press 32.5×6 (40 ms); new MCP session log_set {reps:10} → same session, set 2 (26 ms); finish_workout → 1 PR, bench 106.7 e1RM, +8.0 from 98.7, volume 1440 kg (15 ms). Server-side times; all under 500 ms.
- **Deviations:** swapping a non-current exercise does not move the current pointer (in S3 the user is still on bench); the swap card shows the new exercise. Step 5's `log_set {reps:10}` therefore logs bench set 2 (80×10, also an e1RM PR), and the summary still reads 1 PR because it counts lifts.
- **Fallbacks used:** none.

**Orchestrator close-out (2026-10-22):** verified 11 tests and the S3 probe on the dev server (start → 80×8 PR → shoulder swap to landmine press 32.5×6 → resume from a new MCP session → finish with 1 PR; all calls ≤ 99 ms). Note for T-32: count the rest timer down from rest_seconds, not from rest_ends_at vs wall clock. DONE.
