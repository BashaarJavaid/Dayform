# T-21 · Goals and targets

| Field | Value |
|---|---|
| Wave | 2: MCP server tools |
| Demo importance | VISIBLE (S5 shows the calorie trim and its reason) |
| Size | M |
| Depends on | T-20, T-11 |
| Owns | `server/src/tools/goals/`, `server/src/domain/targets/` |
| Approval needed | No |
| Status | DONE |

## Goal
Build the tools `set_goals` and `log_bodyweight`, and the targets engine, which sets start targets and adapts them every week.

## Why it matters for the demo
The S5 brief says something like "you lost 0.2 kg this week, slower than planned, so I trimmed 150 calories". The numbers in that line come from this engine, so it must be correct.

## Read first
- [DESIGN.md D8](../DESIGN.md#1-agreed-decisions), [§4 MCP tools](../DESIGN.md#4-mcp-tools), [§7 LLM and code](../DESIGN.md#7-llm-and-code)
- `db/seed/` (T-11)

## Tasks
1. **Start targets:**
   - BMR by Mifflin-St Jeor, multiplied by the activity factor, gives TDEE.
   - Goal adjustment:
     - cut: −20% of TDEE, at most −750 kcal
     - maintain: 0
     - bulk: +10%
   - Protein: 2.0 g per kg on a cut, 1.8 g per kg otherwise.
   - Fat: at least 0.8 g per kg. Carbs take the rest.
   - Fiber: 14 g per 1,000 kcal. Sodium: under 2,300 mg. Water: 35 ml per kg.
2. **Weight trend:** an exponential moving average of daily weights (alpha 0.1).
3. **Weekly adaptive targets**, on the check-in weekday:
   - Expenditure = average intake over the last 14 days − (trend change over 14 days × 7,700 kcal per kg ÷ 14).
   - New calorie target = expenditure + the goal adjustment.
   - Limit the change to ±250 kcal a week.
   - Store reason codes and numbers, for example `{code: "LOSS_SLOWER_THAN_PLANNED", planned_kg: -0.4, actual_kg: -0.2, change_kcal: -150}`. T-27 asks Opus to turn them into one spoken sentence.
4. **`set_goals`:**
   - Input: `goal`, `rate_kg_per_week?`, `weight_kg?`, `activity?`.
   - It recalculates the targets.
   - Returns the new targets, with the `rings` card.
5. **`log_bodyweight`:**
   - Input: `kg`.
   - It saves the weight.
   - Returns the trend weight and the weekly change.
6. **Shared function:** `runWeeklyCheckIn(date)`, which T-27 calls.
7. **Tests:**
   - unit tests with fixed numbers for every formula
   - a seed test: the next check-in after demo day trims calories by 100–200 kcal (agree the seed numbers with T-11)

## Acceptance criteria
- [ ] Every formula has a unit test with fixed numbers.
- [ ] The seed test passes: a trim of 100–200 kcal, with reason codes.
- [ ] `set_goals` and `log_bodyweight` take under 500 ms.
- [ ] Outputs validate against the contracts.

## Test scenario
1. Run `npm test -w server -- targets`. Expect green.
2. Run `npm run db:reset`. Then call `runWeeklyCheckIn` for the day after demo day (test helper). Expect a trim of 100–200 kcal and the reason code `LOSS_SLOWER_THAN_PLANNED`.

## Result
**DONE 2026-10-22.** All 4 acceptance criteria pass.

- **Files:** `server/src/domain/targets/formulas.ts` (pure maths), `server/src/domain/targets/index.ts` (`runWeeklyCheckIn(date)`, `setGoals`, `logBodyweight`, `targetsOn`, `weightTrend`, `eatenOn`, `localDate` in `DEMO_TZ`), `server/src/tools/goals/index.ts` (the 2 tools), `server/test/targets.test.ts`.
- **Tests:** `npm test -w server -- targets`: `Tests 8 passed (8)`. The whole server suite: `Tests 49 passed (49)`.
- **Seed check-in** (the test runs `db/src/reset.ts` against the test database, then calls `runWeeklyCheckIn("2026-10-24")`): `previous_kcal 2360 -> kcal 2250, change_kcal -110, reason_codes ["LOSS_SLOWER_THAN_PLANNED"]`, reason `{planned_kg -0.4, actual_kg -0.28, avg_intake_kcal 2337, intake_days 13, trend_change_14d_kg -0.64, expenditure_kcal 2689, trend_kg 82.4}`. New targets: P165 C249 F66, fiber 32, water 2900. The stored `weekly` row is replaced if the check-in runs again.
- **MCP Inspector CLI** against `npm run dev` on port 8021 after `db:reset`: `set_goals {goal: lose, rate 0.4}` returns 2340 kcal (was 2360), the rings data and `_meta.ui.resourceUri ui://cards/rings`. `log_bodyweight {kg: 81.9}` returns trend 82.3 and -0.29 kg/week. Server latency: set_goals 239 ms cold, then 24 and 49 ms; log_bodyweight 9, 15 and 17 ms.
- **Deviations:**
  1. The goal adjustment uses the weekly rate when there is one: `rate x 7700 / 7`, with a loss capped at 750 kcal. This matches the seed's 2360 kcal and the `planned_kg` in the reason. The ticket's -20% (cut) and +10% (bulk) apply only when no rate is known.
     - With -20% (-560 kcal), the seed check-in would trim 231 kcal, outside the 100-200 target.
  2. Fat is `max(0.8 g/kg, 25% of kcal)`. The seed uses 25% only, so the seed's start fat of 66 g would be 67 g here.
  3. A day logged at under half the previous kcal target is treated as not fully logged and left out of the intake mean. On the seed, demo day has breakfast only (486 kcal). Counting it would make the trim 243 kcal.
  4. A weekly change under 50 kcal keeps calories as they are (`ON_TRACK`). The reason code comes from the goal and the direction of the change. Other codes: `WEEKLY_CAP` and `NOT_ENOUGH_DATA` (fewer than 7 fully logged days).
  5. `actual_kg` is the EMA change over the last 7 days (-0.28 kg), so S5's line reads "lost 0.3 kg, slower than the planned 0.4, trimmed 110", not "trimmed 150".
- **Contract wording:** `log_bodyweight.trend_kg` is described as a "7-day average", but the ticket's EMA (alpha 0.1) is what is returned. The description in contracts should say "EMA trend weight".
- **Fallbacks used:** none (no LLM, no external services).

**Orchestrator close-out (2026-10-22):** verified 8 tests; seed check-in 2026-10-24 → 2360→2250 kcal (−110, LOSS_SLOWER_THAN_PLANNED, actual −0.28 vs planned −0.4); set_goals 21 ms with rings card, log_bodyweight 30 ms. S5 line becomes "lost about 0.3 kg, slower than the planned 0.4, so I trimmed 110 calories" (Demo Monitor updates the script). DONE.
