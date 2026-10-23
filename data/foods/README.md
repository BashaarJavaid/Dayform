# Food data (T-12)

| File | What |
|---|---|
| `download.sh` | Downloads USDA FoodData Central bulk CSVs (SR Legacy 2018-04, FNDDS Survey 2024-10-31) into `raw/` (git-ignored). |
| `desi.json` | Desi dish table (55 entries), hand-written spec; `build.ts` fills `nutrients` and `source` in place. |
| `usda-aliases.json` | Curated common foods, keyed by exact USDA description → spoken aliases. Always included, priority 8. |
| `build.ts` | Builds `foods.json` (desi + USDA subset) from `raw/`, `desi.json`, `usda-aliases.json`. |
| `foods.json` | The food table: 1,659 foods. Loaded into Postgres by `npm run load -w @dayform/food-search`. |
| `foods.sql` | DDL: `foods` and `food_terms` (trigram index on names and aliases). |
| `test-phrases.json` | 100 test phrases (30 desi, 20 Sonic mishearings / tool-call forms, 20 with units, 30 generic). |

Rebuild: `bash data/foods/download.sh && npx tsx data/foods/build.ts`.

## Food row

`id` (stable slug: desi `chicken-karahi`, USDA `usda-<fdc_id>`), `name`, `aliases`, `nutrients` per 100 g
(`kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, iron_mg, calcium_mg, potassium_mg, vitamin_d_mcg`),
`portions` (name → grams), `default_portion`, `source`, `priority` (desi 10, curated USDA 8, FNDDS 5, SR Legacy 3).

## Desi dishes

- An FNDDS entry is used where a good one exists (roti, paratha, naan, puri, chicken and mutton biryani, pulao, daal,
  daal chawal = "Lentil curry with rice", chicken curry, palak paneer, mixed sabzi, samosa, pakora, paneer); `source` is
  `FNDDS <food code> (<description>)`.
- Everything else is a standard home recipe of USDA ingredients (SR Legacy, raw weights) divided by an estimated cooked
  yield; `source` lists every ingredient and the yield. Whole spices are left out (negligible energy), except in garam masala.
- Plain basmati rice and dahi use SR Legacy cooked white rice / whole-milk yogurt.
- Portions are local units (plate, bowl, piece, glass, cup, roti, naan, kebab). Defaults: a roti 40 g (FNDDS medium),
  naan 120 g, plate of biryani 350 g, plate of karahi 250 g, bowl of daal 240 g, glass of lassi 300 g, cup of chai 200 g.
- Aliases include spelling variants (daal/dal/dhal, karahi/kadai/kadhai, roti/chapati/phulka) and every Sonic mishearing
  from `smoke/nova-sonic/food-words.md` (`karai`, `dal`). "tea" maps to chai (doodh patti), as a Pakistani user means it.

## USDA selection rules (1,604 foods)

1. **FNDDS** (foods as eaten, with FNDDS portion weights): every WWEIA category except baby foods, infant formula,
   human milk, plain water and "not in a category" (9xxx, 7702, 7704); descriptions with at most 3 comma parts; no
   "NS as to", reduced/low sodium, or regional/commodity variants. Within each category keep the 10 most generic foods
   (fewest comma parts, then NFS / raw / plain, then shortest name).
2. **SR Legacy** (raw ingredients for meal prep): dairy and egg, fruit, vegetables, nuts and seeds, legumes, grains;
   raw/cooked/plain items with at most 3 comma parts; 25 per category by the same genericness order.
3. **Always included:** every ingredient used in a desi recipe, every food in `usda-aliases.json` (common foods people
   say: eggs, chicken breast, coke, pizza, oats, whey ...), and every `usda-<fdc_id>` that `data/catalog/catalog.json` references.
4. Portions: FNDDS "Quantity not specified" becomes `serving` (the default); other portions keep their description
   ("cup", "medium", "medium or regular slice"); "yields" conversions and weight units are dropped; `100 g` is always added.
   SR Legacy default: serving, medium, piece, slice, large, cup, else 100 g.
5. Head alias: the first comma part ("Apple" of "Apple, raw") is an alias of the most generic food in that group, except
   vague heads (water, fish, cheese, rice, milk, ...), which only curated aliases may claim.
