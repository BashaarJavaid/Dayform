# T-22 · Meal logging and daily summary

| Field | Value |
|---|---|
| Wave | 2: MCP server tools |
| Demo importance | HERO (S1, S2) |
| Size | M |
| Depends on | T-20, T-12, T-21 (reads targets) |
| Owns | `server/src/tools/nutrition/`, `server/src/domain/nutrition/` |
| Approval needed | No |
| Status | TODO |

## Goal
Build the tools `log_meal`, `correct_meal`, `log_water` and `get_daily_summary`. Spoken meals become accurate entries and a live view of the day's macros.

## Why it matters for the demo
S1 and S2 open the video. The judges see their first number here, so it must be right, fast and clearly explained ("assumed one plate").

## Read first
- [DESIGN.md D4, D5](../DESIGN.md#1-agreed-decisions), [§4 MCP tools](../DESIGN.md#4-mcp-tools), [§7 LLM and code](../DESIGN.md#7-llm-and-code)
- `packages/food-search/` (T-12)
- [DEMO-SCRIPT.md](../DEMO-SCRIPT.md) S1, S2

## Tasks
1. **`log_meal`.**
   - **Input:** `items: [{food, quantity?, unit?}]`, `meal?`, `time?`. Default meal: breakfast, lunch, dinner or snack, chosen from the demo clock.
   - **For each item:** call food search.
     - If the match is confident, use it.
     - If not, call the LLM client for an estimate (nutrients per portion), and set `estimated: true`.
   - **Save** the entry.
   - **Return:**
     - the items, with grams and nutrients
     - `assumptions` (for example "assumed 1 plate = 350 g")
     - the meal totals
     - the day totals and what's left against targets
     - the `meal-logged` card, with the rings data included
2. **Voice facts.** The `content` text gives short facts Alexa can say: meal calories, meal protein, protein and calories left today, and assumptions. Alexa writes the words; we give the facts.
3. **`correct_meal`.**
   - **Input:** `entry` (`"last"` by default, or an ID), and `changes: [{item, set_quantity?, set_unit?, replace_with?, remove?}]`.
   - Also accepts `add?: items`.
   - **Returns** the updated entry and totals.
4. **`log_water`.**
   - **Input:** `ml` or `glasses` (1 glass = 250 ml).
   - **Returns** water today, with the `rings` card.
5. **`get_daily_summary`.**
   - **Input:** `date`, defaulting to today on the demo clock.
   - **Returns:**
     - totals against targets for calories, macros, fiber, sodium and water
     - the list of meals
     - the `rings` card
6. **Duplicate guard.** Ignore an identical `log_meal` call within 10 s, because clients may retry.
7. **Speed.** The confident path makes no LLM call. Targets: p50 under 300 ms locally, under 500 ms on AgentCore.
8. **Tests:**
   - the S1 items
   - the S2 correction
   - an unknown dish
   - water
   - the duplicate guard

## Acceptance criteria
- [ ] The S1 input `[{food:"roti",quantity:2},{food:"chicken karahi"},{food:"mango lassi"}]` gives 3 confident matches.
- [ ] The S1 totals equal the food-table maths.
- [ ] The S1 assumptions name the karahi and lassi portions.
- [ ] The S2 correction ("one roti") updates the totals.
- [ ] An unknown dish ("grandma's special pulao") gives an estimate marked `estimated: true`. Its latency is recorded.
- [ ] The p50 latency targets are met on the confident path.
- [ ] Outputs validate against the contracts.

## Test scenario
1. Run `npm test -w server -- nutrition`. Expect green.
2. Connect MCP Inspector to the local server. Call `log_meal` with the S1 items. Expect 3 items, the assumptions and the totals.
3. Call `correct_meal` with `{changes:[{item:"roti", set_quantity:1}]}`. Expect the totals to drop by one roti.

## Result
_The agent fills this in._
