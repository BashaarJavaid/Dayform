# T-24 · Live workout session

| Field | Value |
|---|---|
| Wave | 2: MCP server tools |
| Demo importance | HERO (S3) |
| Size | M |
| Depends on | T-23 (resolver, PR detection), T-11 (program, seed) |
| Owns | `server/src/tools/live-workout/`, `server/src/domain/session/` |
| Approval needed | No |
| Status | TODO |

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
- [ ] The S3 sequence runs end to end: `start_workout` → `log_set` (PR) → `swap_exercise` (overhead press, shoulder) → `finish_workout`.
- [ ] Every call takes under 500 ms.
- [ ] The scripted set is flagged as a PR on the seed state.
- [ ] The session survives a simulator reconnect.
- [ ] Outputs validate against the contracts.

## Test scenario
1. Run `npm run db:reset`.
2. Call `start_workout`. Expect "Push", with bench press first and the agreed target.
3. Call `log_set {reps: 8}`. Expect `pr: true`, a rest of 10 s (demo mode), and the next target.
4. Call `swap_exercise {exercise:"overhead press", reason:"shoulder feels off"}`. Expect a shoulder-friendly alternative, with a target.
5. Open a new MCP session. Call `log_set {reps: 10}`. Expect it to apply to the open workout.
6. Call `finish_workout`. Expect the summary, with 1 PR.

## Result
_The agent fills this in._
