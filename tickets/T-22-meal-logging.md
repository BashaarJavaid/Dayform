# T-22 · Meal logging and daily summary

| Field | Value |
|---|---|
| Wave | 2: MCP server tools |
| Demo importance | HERO (S1, S2) |
| Size | M |
| Depends on | T-20, T-12, T-21 (reads targets) |
| Owns | `server/src/tools/nutrition/`, `server/src/domain/nutrition/` |
| Approval needed | No |
| Status | DONE (AgentCore p50 measured in T-40) |

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
**Built (2026-10-22):** `server/src/domain/nutrition/index.ts` (matching via `searchItems`, Nova estimate with a zod + kcal/macro code check, storage, day totals vs the latest `targets` row, corrections, duplicate guard), `server/src/tools/nutrition/index.ts` (the 4 tools), `server/test/nutrition.test.ts`.

**Verified:**
- `npm test -w server -- nutrition`: `Tests 7 passed (7)`. Full suite `npm test -w server`: `Tests 49 passed (49)`.
- S1 (`log_meal`, seed state 13:00): lunch, Roti (chapati) 2 × 40 g = 239 kcal, Chicken karahi 250 g = 440 kcal (assumed), Mango lassi 300 g = 225 kcal (assumed). Meal 904 kcal, 48.7 g protein; totals equal per-100 g × grams from `data/foods/foods.json` (test computes them independently). Day 486 (seeded breakfast) + 904 = 1390 of 2360 kcal, 970 kcal and 96.2 g protein left. Content: "Logged lunch: 3 items, 904 kcal, 48.7 g protein. Today: 1390 of 2360 kcal, 68.8 of 165 g protein. Left: 970 kcal, 96.2 g protein. Assumed 1 plate of chicken karahi = 250 g. Assumed 1 glass of mango lassi = 300 g."
- S2 (`correct_meal` roti → 1): roti 239 → 120 kcal (in place, card order kept), meal 785 kcal, day 1271 kcal, 1089 left.
- Unknown dish "grandma's special pulao": Nova 2 Lite estimate, `estimated: true`, `food_id` NULL in `meal_items`; tool latency 967–1014 ms (model 951 ms), logged per call and sent as an MCP log message.
- Water: 2 glasses = 500 ml, then 330 ml → 830 ml; no amount → isError. Duplicate guard: identical `log_meal` within 10 s returns the same entry id, no new row (2 ms).
- Inspector CLI against a local dev server (`--transport http`, 5 rounds of S1 then S2, warm pg): `log_meal` ms = 314 (cold), 90, 109, 126, 107 → **p50 109 ms**; `correct_meal` ms = 22, 32, 65, 46, 22 → **p50 32 ms**. Server-side timings from the `tool=… ms=` log.

**Deviations:** `correct_meal` follows the contract (`entry_id`, `changes[{food, action: set_quantity|remove|add, quantity?, unit?}]`), not the ticket's `item/set_unit/replace_with` (replace = remove + add). `log_meal` has no `time` input (not in the contract); meal time is `clock.now()`. Default meal by DEMO_TZ hour: 04–11 breakfast, 11–16 lunch, 19–23 dinner, else snack. Estimates are stored as the meal item only (no `foods` row). Dev-server check used port 8022 and the `dayform_server_test` database, to avoid another agent's server on 8001 and the shared demo DB.

**Fallbacks used:** none.

**Orchestrator close-out (2026-10-22):** verified 7 tests and the live S1→S2→water→summary sequence on the dev server (904 kcal lunch with karahi/lassi assumptions; correction to 785; summary consistent). First call ~1 s cold (DB + food-search pool), then 16–55 ms: demo:warm must warm food search. DONE.
