# T-21 · Goals and targets

| Field | Value |
|---|---|
| Wave | 2: MCP server tools |
| Demo importance | VISIBLE (S5 shows the calorie trim and its reason) |
| Size | M |
| Depends on | T-20, T-11 |
| Owns | `server/src/tools/goals/`, `server/src/domain/targets/` |
| Approval needed | No |
| Status | TODO |

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
_The agent fills this in._
