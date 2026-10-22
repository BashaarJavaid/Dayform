# T-12 · Food data and food search

| Field | Value |
|---|---|
| Wave | 1: Scaffold, data, seed |
| Demo importance | HERO (S1 is the first thing judges see) |
| Size | L |
| Depends on | T-10, T-02 (food-word transcripts) |
| Owns | `data/foods/`, `packages/food-search/` |
| Approval needed | No. The USDA download is a public government dataset. |
| Status | TODO |

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
_The agent fills this in._
