# T-12 · Food data and food search

| Field | Value |
|---|---|
| Wave | 1: Scaffold, data, seed |
| Demo importance | HERO (S1 is the first thing judges see) |
| Size | L |
| Depends on | T-10, T-02 (food-word transcripts) |
| Owns | `data/foods/`, `packages/food-search/` |
| Approval needed | No. The USDA download is a public government dataset. |
| Status | DONE |

## Goal
Build a curated food table and a fast, accurate search. For example, "two rotis" must resolve to the right food, portion and nutrients.

## Why it matters for the demo
S1 opens the video. A wrong match or a strange number on camera loses the judges' trust in the first 20 seconds.

## Read first
- [DESIGN.md D4, D5](../DESIGN.md#1-agreed-decisions), [§6 Data model (foods)](../DESIGN.md#6-data-model), [§12 Demo-first simplifications](../DESIGN.md#12-demo-first-simplifications)
- `smoke/nova-sonic/food-words.md` (from T-02)

## Tasks
1. **Download** the USDA FoodData Central bulk CSV files for **SR Legacy** and **FNDDS (Survey)** from https://fdc.nal.usda.gov/download-datasets.
   - Write a download script.
   - Keep the raw files out of git.
2. **Select about 1,500 common foods:** staples, proteins, dairy, fruit, vegetables, grains, common fast food, drinks. Write the selection rules in `data/foods/README.md`.
3. **For each food, store:**
   - `id`, `name`, `aliases`
   - nutrients per 100 g: calories, protein, carbs, fat, fiber, sugar, sodium, iron, calcium, potassium, vitamin D
   - `portions` (name → grams), using FNDDS portion weights where present
   - `default_portion`, `source`, `priority`
4. **Desi table, about 50 dishes:**
   - **Breads and rice:** roti/chapati, paratha (plain, aloo), naan, puri, plain basmati rice
   - **Rice dishes:** chicken biryani, mutton biryani, pulao
   - **Lentils and pulses:** daal (masoor, moong, chana), daal chawal, chana masala, chana chaat
   - **Meat curries:** chicken karahi, chicken handi, nihari, haleem, korma, qeema, aloo gosht
   - **Vegetables:** palak paneer
   - **Snacks:** samosa, pakora
   - **Grills:** chicken tikka, seekh kebab, shami kebab
   - **Sides:** raita
   - **Drinks:** lassi (sweet, salted, mango), chai (doodh patti)
   - **Desserts:** kheer, halwa, gulab jamun

   For each dish:
   - Use an FNDDS entry if a good one exists.
   - Otherwise, compute the values from a standard recipe made of USDA ingredients.
   - Store the FNDDS code, or the recipe, as `source`.
   - Give each dish default portions in local terms: plate, bowl, piece, cup.
5. **Aliases:** add spelling variants (daal/dal, karahi/kadai, roti/chapati/phulka). Add every misheard form from `food-words.md`.
6. **Search package `packages/food-search`:**
   - **Input:** `{food, quantity?, unit?}`.
   - **Output:** best match, confidence, resolved grams, nutrients, and an `assumptions` list (for example "assumed 1 plate = 350 g").
   - **Steps:**
     1. Normalize the text.
     2. Look for an exact alias.
     3. Run trigram search: pg_trgm in the database, or in memory as the fallback.
     4. Rank by similarity and `priority`.
     5. Resolve the unit and portion.
     6. If no quantity was given, use the default portion.
   - **Below the confidence threshold**, return `no_confident_match`. T-22 then asks Opus for an estimate.
7. **Test set**, `data/foods/test-phrases.json`, with 100 phrases, each with the expected food and grams:
   - 30 desi phrases
   - 20 with Sonic mishearings
   - 20 with units ("200 grams", "a cup", "half a plate")
   - 30 generic phrases
8. **Loader:** `npm run data:load-foods` puts the foods into the database.

## Acceptance criteria
- [ ] Top-1 accuracy is at least 95% on the 100-phrase test set.
- [ ] Every desi dish has a `source`.
- [ ] Every food has a default portion.
- [ ] Search p50 is under 30 ms on local Postgres.
- [ ] The S1 phrase "two rotis, chicken karahi and a mango lassi" resolves to 3 correct foods, with sensible grams.

## Test scenario
1. Run `npm test -w packages/food-search`.
2. Expect the accuracy line `top1=<n>/100`, at least 95, and a list of any failures.

## Fallbacks
- **USDA bulk download fails:** use the FoodData Central API with an api.data.gov key. Getting the key is a human step.
- **A dish can't be sourced:** compute it from a standard recipe, and write the recipe into `source`.
- **No match at runtime:** Opus estimates the food, and the entry is marked "estimated" (T-22).

## Result
2026-10-22. All 5 acceptance criteria pass on local Postgres (`dayform-pg`, port 5433).

- **Data:** `data/foods/foods.json`, 1,659 foods: 55 desi entries (52 dishes, plus `paneer`, `ginger-garlic-paste` and `garam-masala` for the T-13 catalog), 1,396 FNDDS and 208 SR Legacy. Every `food_id` in `data/catalog/catalog.json` resolves. Selection rules: `data/foods/README.md`.
- **Desi sources:** 15 come from FNDDS codes and 2 from SR Legacy foods (basmati rice, dahi). 38 are standard recipes of USDA ingredients divided by the cooked yield; each recipe is written into `source`.
- **Search:** `packages/food-search` exports `searchFood`, `searchItems`, `searchText`, `splitItems`, `parsePhrase`. Steps: exact alias, then trigram (pg_trgm on `food_terms` when `DATABASE_URL` is set; an in-memory port of the same similarity otherwise, with an automatic fallback). Ranking is similarity + 0.005 × priority. Then unit and portion resolution. With no amount, the standard portion plus an assumption string (D5). Below 0.55 similarity: `no_confident_match` with up to 3 candidates.
- **Verify:** `npm run load -w @dayform/food-search` (→ `loaded foods=1659 terms=2780`), then `npm test -w packages/food-search`:
  - `[memory] top1=100/100  p50=0.01 ms/item`
  - `[pg] top1=100/100  p50=10.12 ms/item  p95=17.83 ms/item`
  - `Tests 9 passed (9)`
- **S1:** "two rotis, chicken karahi and a mango lassi" → `roti 80g`, `chicken-karahi 250g` (assumption "Assumed 1 plate of chicken karahi = 250 g."), `mango-lassi 300g`. Same result on both backends.
- **Held-out probe** (30 phrases not in the test set, not tuned for): 27 sensible. Wrong ones: "vegetable soup" → frozen mixed vegetables (confidence 0.67); "green salad" → 18 g of salad greens; "kebab" alone → `no_confident_match`. These sit next to the 100/100 because I wrote the test set knowing the aliases.
- **Deviations:**
  - USDA FNDDS nutrients are keyed by `nutrient_nbr` (F-011).
  - Portions are stored as jsonb, which loses key order, so portion choice is made order-independent.
  - The output adds `status`, `said`, `quantity`, `unit`, `assumed` and all 11 nutrients beyond the brief. `kcal`/`protein_g`/`carbs_g`/`fat_g` match contracts `Macros`.
  - "a slice of pizza" uses the FNDDS generic piece (119 g).
- **Fallbacks used:** none. The bulk download took 3 s, so both SR Legacy and FNDDS are in.

**Orchestrator close-out (2026-10-22):** verified load (1,659 foods), `top1=100/100` memory and pg (p50 11.8 ms), S1 trio resolves with assumptions, compound dishes split, unknown dish → no_confident_match. DONE.
