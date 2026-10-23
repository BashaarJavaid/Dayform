# T-25 · Meal-prep planner

| Field | Value |
|---|---|
| Wave | 2: MCP server tools |
| Demo importance | HERO (S4) |
| Size | L |
| Depends on | T-20 (LLM client), T-12 (nutrients), T-13 (catalog), T-21 (targets) |
| Owns | `server/src/tools/meal-prep/`, `server/src/domain/meal-prep/` |
| Approval needed | No |
| Status | DONE (cost-tightening pass in progress) |

## Goal
Generate meal-prep plans with Opus that hit the user's targets, use only catalog items, and pass code checks. The tool `plan_meal_prep` returns the plan.

## Why it matters for the demo
S4 is the main hero scene. The carousel of recipes and the grocery list that flows into the cart show the judges an agent working across services.

## Read first
- [DESIGN.md D17](../DESIGN.md#1-agreed-decisions), [§7 LLM and code](../DESIGN.md#7-llm-and-code), [§4 MCP tools](../DESIGN.md#4-mcp-tools)
- `data/catalog/catalog.json` (T-13), `server/src/core/llm.ts` (T-20)
- [SMOKE-RESULTS.md](../SMOKE-RESULTS.md) §T-01: streaming timings.

## Tasks
1. **Generator** `generatePlan({days, targets, preferences, catalog})`:
   1. **Prompt Opus** with:
      - the per-day targets
      - preferences: desi food, high protein, dislikes
      - one batch-cook session of at most 2.5 hours
      - the catalog items, with nutrients per 100 g
      - the output JSON schema
   2. **Output schema:**
      - recipes, each with ingredients `{catalogItemId, grams}`, servings and steps
      - a day plan that maps each meal to recipe servings
      - batch-cook steps, in order
      - storage notes
   3. **Validate** the JSON with zod. Reject any unknown `catalogItemId`.
   4. **Compute** nutrients per meal and per day from the ingredient grams (code).
   5. **Check** each day:
      - calories within ±5% of target
      - protein at least target −5%
      - fat and carbs within ±10%
   6. **On failure**, send Opus the exact misses (day, nutrient, value, target) and ask for a fix. Allow at most 3 rounds. Then keep the best plan and set `within_tolerance: false`.
   7. **Grocery list:** sum the grams per catalog item, convert to packs (round up), and add the estimated price.
   8. Use ConverseStream for the long output.
2. **Storage.** Store each plan with a status (`ready`, `preparing` or `failed`) and its date range.
3. **`plan_meal_prep`.**
   - **Input:** `days?` (default 4), `constraints?` (free text, for example "no chicken").
   - **No constraints, and a fresh plan exists** (from T-27): return it at once.
   - **Constraints given:** start generation in the background. Return `{status: "preparing", eta_seconds}`, and send progress messages ("Planning recipes…", "Checking macros…"). The next call returns the result.
   - **Output:** a plan summary (days, average calories and protein against target), the recipes, the batch-cook steps and the grocery list, with the `meal-prep` card.
4. **Tests:**
   - 10 generation runs on the seed: record how many end within tolerance, and in how many rounds
   - a catalog-only check
   - grocery maths (grams to packs)

## Acceptance criteria
- [ ] At least 9 of 10 runs on the seed reach tolerance within 3 rounds. The run log is saved.
- [ ] Every ingredient in every plan is a catalog item.
- [ ] Day totals computed by code match the plan's claimed totals within 1%.
- [ ] The precomputed path of `plan_meal_prep` takes under 500 ms.
- [ ] The constraints path returns `preparing` at once, and the next call returns the plan.
- [ ] Outputs validate against the contracts.

## Test scenario
1. Run `npm run mealprep:bench -- --runs 10`. Expect a table of run · rounds · within tolerance · seconds, with at least 9 within tolerance.
2. Run `npm run db:reset`, then `npm run overnight -- --live` (or the T-27 cache). Call `plan_meal_prep`. Expect the full plan in under 500 ms.
3. Call `plan_meal_prep {constraints:"no chicken"}`. Expect `preparing`, then progress messages, then a plan with no chicken on the next call.

## Fallbacks
- **Opus too slow for the constraints path:** use the fallback model from T-01 for revision rounds only.
- **Plans keep missing tolerance:** lower the number of recipes (3 recipes for 4 days), and let code scale the servings to hit calories before checking.

## Result
2026-10-23 (PKT). Model: Nova 2 Lite (`REASONING_MODEL_ID`) via `server/src/core/llm.ts`, forced tool + ConverseStream.

**Built**
- `server/src/domain/meal-prep/plan.ts`: `generatePlan`. The model gets the targets, preferences, constraints, a per-meal calorie split and the catalog as a compact table (id, name, kcal/P/C/F per 100 g, pack). It returns 3–5 recipes (grams per serving), 1–2 day menus (days alternate A/B, so a wrong day count can't happen) and one batch-cook session. Zod rejects any unknown catalog id (an enum). **Code then fits the grams** (ticket fallback 2, on by default): coordinate descent on a weighted least-squares error, each ingredient at 0.5–2× the model's grams (cooking fats 0.25–4×, spices fixed), plus a soft term that keeps each meal near its share of calories. Grams are rounded, then every day is checked (kcal ±5%, protein ≥ −5%, carbs/fat ±10%). Misses go back to the model as `day N: nutrient value, target T (rule)`, up to 3 rounds, keeping the best plan. `groceryList`: grams over servings → `ceil(grams / grams_per_pack)` packs → price.
- Availability: T-13's per-item `available` flag if it exists; otherwise only `shelf_stable` items plus `chicken-breast-frozen`. "no X" / "without X" constraints also remove matching catalog items in code.
- `store.ts`: `meal_plans` rows (`preparing` → `ready`/`failed`, start/end date, plan JSON). `totals` holds `{constraints, avg, grocery (packs, prices), grocery_total_usd, rounds, seconds}`. Also `startPlan` (fire-and-forget), `ensureFreshPlan(start, days=4)` and `planInputs(start)` for T-27.
- `server/src/tools/meal-prep/index.ts`: `plan_meal_prep`. A fresh ready plan (start today or tomorrow, enough days) is returned with no LLM call. With constraints, or with no plan, it inserts `preparing`, generates in the background and returns `preparing`; repeat calls say "still making", and the next call after that returns the plan. A `preparing` row older than 240 s counts as dead.
- `server/test/meal-prep.test.ts` (6 tests), `npm run mealprep:bench -w @dayform/server -- --runs N [--constraints "…"]`, log in `server/src/domain/meal-prep/bench-log.md`.

**Verification**
- Bench (seed targets 2360 / 165 / 277 / 66): 10/10 within tolerance, all in round 1, 3.0–4.2 s each (second 10-run table in bench-log.md); "no chicken" 5/5. One live run *before* the fat-range change missed fat on all days (56 g vs 66) after 3 rounds; that is why cooking fats got the wider 0.25–4× range.
- `npm test -w @dayform/server -- meal-prep`: 6 passed (grocery maths; unknown id rejected; catalog-only; recomputed day totals within 1%; misses sent back, best kept after 3 rounds; MCP fast path and constraints path).
- Live, after `npm run db:reset`: `ensureFreshPlan("2026-10-24")` stored plan 1 (1 round, 4.4 s, all days 2352 kcal / 166 P / 280 C / 66 F). MCP `plan_meal_prep {}` took 107 ms cold, then 6–17 ms (server log). `{constraints:"no chicken"}` returned `preparing` in 44 ms with progress "Planning recipes…". The plan was ready 4.8 s later, and the next call (42 ms) returned 4 chicken-free recipes, 2369 / 163 / 294 / 64 a day.

**Deviations**
- `MealPrepCard` has no `eta_seconds`, storage-notes, packs or price fields. The ETA goes in `message` and the text, storage goes in the last batch-cook steps, and packs and price go in `meal_plans.totals.grocery` and in the spoken text.
- Progress messages sent after the `preparing` response ("Checking macros…") have no open stream and are dropped. Only "Planning recipes…" reaches the client.
- Bench rows report rounds = 3 when the plan stays out of tolerance.

**Follow-up (orchestrator, 2026-10-23): grocery cap.** At most 12 distinct catalog items, enforced in code. When a plan goes over, the model gets a miss back ("plan uses N items, max 12; drop the least-used ones (…)", where least-used means the smallest share of the bought packs eaten). This miss doesn't change `within_tolerance`, which still covers macros only. The prompt also tells the model to avoid whey, honey, olive oil, almonds and peanut butter unless a day can't reach its protein otherwise. Bench on the current seed targets (2250 / 165 / 249 / 66), 5 runs: 5/5 within tolerance in 2–3 rounds, 5.0–12.4 s each, grocery $93.79–108.32 with 12–13 items (one run kept 13 after 3 rounds). That is under the $120 target. Test added: a 15-item draft gets the item miss back and the second round is accepted (7 tests pass).
