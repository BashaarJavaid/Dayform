# T-25 · Meal-prep planner

| Field | Value |
|---|---|
| Wave | 2: MCP server tools |
| Demo importance | HERO (S4) |
| Size | L |
| Depends on | T-20 (LLM client), T-12 (nutrients), T-13 (catalog), T-21 (targets) |
| Owns | `server/src/tools/meal-prep/`, `server/src/domain/meal-prep/` |
| Approval needed | No |
| Status | TODO |

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
_The agent fills this in._
