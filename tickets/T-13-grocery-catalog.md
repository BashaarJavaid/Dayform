# T-13 · Grocery catalog with verified ASINs

| Field | Value |
|---|---|
| Wave | 1: Scaffold, data, seed |
| Demo importance | VISIBLE (S4 cart) |
| Size | M |
| Depends on | T-10, T-12 (food IDs), T-05 (link format) |
| Owns | `data/catalog/` |
| Approval needed | Human step: the user opens the all-items link once, signed in. Agents only read product pages. |
| Status | REVIEW (waiting for the user to open the all-items link signed in) |

## Goal
Build a catalog of about 40 grocery items, each with a verified Amazon ASIN, pack size and nutrition link. The meal planner may use only these items.

## Why it matters for the demo
In S4, every grocery item must land in the real Amazon cart. A broken ASIN on camera shows up as a missing item, or as the wrong product.

## Read first
- [DESIGN.md D15, D17](../DESIGN.md#1-agreed-decisions), [§6 Data model (catalog_items)](../DESIGN.md#6-data-model)
- [SMOKE-RESULTS.md](../SMOKE-RESULTS.md) §T-05: the link flow.

## Tasks
1. **Write the ingredient list.** It should cover 8–10 high-protein meal-prep recipes, desi and generic. Suggested items:
   - **Proteins:** chicken breast, eggs, Greek yogurt, plain yogurt, paneer, canned tuna, lean ground beef or turkey, whey protein
   - **Grains and pulses:** basmati rice, whole-wheat atta, red lentils (masoor), yellow lentils (moong), chickpeas, oats, wraps
   - **Dairy:** milk
   - **Vegetables and fruit:** frozen spinach, onions, canned tomatoes, potatoes, bell peppers, frozen broccoli, frozen mixed vegetables, cucumbers, lemons, bananas
   - **Spices and pastes:** ginger-garlic paste, garam masala, cumin, turmeric, red chili powder, coriander powder
   - **Fats:** olive oil, ghee
   - **Snacks:** peanut butter, almonds, rice cakes
   - **Other:** honey

   Prefer shelf-stable items, or items sold through Amazon Fresh or Whole Foods on amazon.com. Record each item's availability.
2. **For each item, find a product on amazon.com** (reading pages only). Record:
   - `asin`, `title`
   - `pack_size` and `pack_unit` (g, ml or count)
   - `price_usd` and `price_date`
   - `category`
   - `food_id` (from T-12)
   - `url`

   Prefer products sold by Amazon, Amazon Fresh or Whole Foods, where "Add to Cart" is available.
3. **Verify each ASIN:** open its page and check that it matches the item. Record `verified_at`.
4. Write `data/catalog/catalog.json`, which must validate against the contracts. Add a loader: `npm run data:load-catalog`.
5. **All-items link.** Build one Add-to-Cart link with all items: `npm run catalog:link`.
6. **Human step.** The user opens the link once, signed in, and confirms the cart fills. Record the result.

## Acceptance criteria
- [ ] About 40 items, each with a verified ASIN and a `food_id`.
- [ ] `catalog.json` validates against the contracts.
- [ ] The all-items link fills the cart, confirmed by the user.
- [ ] Every item lists its pack size, in grams, ml or count, so T-25 can turn grams into packs.

## Test scenario
1. Run `npm test -w data`. Expect the catalog to validate.
2. Run `npm run catalog:link`, and open the link signed in. Expect every item in the Amazon cart.

## Fallbacks
- **No usable ASIN for an item:** set `asin: null`. The cart uses a search link (`https://www.amazon.com/s?k=<name>`) for that item.
- **Fresh produce not available:** replace it with a frozen or canned version, and update the food link.

## Result
- **Files:** `data/catalog/catalog.json` (38 items), `schema.ts` (zod, built from contracts `CartItem.asin`, `DateStr`, `DateTimeStr`), `catalog.test.ts`, `load.ts` (`npm run data:load-catalog -w data`), `link.ts` (`npm run catalog:link -w data`), `all-items-link.txt`.
- **Sourcing:** all 38 product pages read 2026-10-22 (curl + cookie jar, F-003 workaround): every item In Stock, sold by Amazon.com or Amazon, with an Add to Cart button. 13 ASINs reused from T-05 (re-read; garam masala price is now $5.35, was $8.91). No item needed `asin: null`.
- **Substitutions:** chicken breast is Tyson frozen 2.5 lb (the fresh Amazon Grocery pack is "weight varies" with no seller block); milk is Horizon shelf-stable 12 × 8 fl oz; red chili is Laxmi Kashmiri (the Amazon Grocery "chili powder" is a US blend). Fresh produce (onions, potatoes, peppers, cucumber, lemons, bananas) and refrigerated items (eggs, yogurts, paneer, turkey) are sold by Amazon.com on the regular page; whether they fill the cart outside a Fresh area is what the user check shows.
- **Fields beyond §6:** `category`, `storage`, `pack_label` (display string = `CartItem.pack_size`), `pack_size`+`pack_unit` (g|ml|count), `grams_per_pack` (count/ml items converted: egg 50 g, tortilla 45 g from the page, banana 118 g, milk 1.03 g/ml, olive oil 0.92 g/ml), `availability`, `sold_by`. The loader maps to the existing `catalog_items` columns only.
- **food_id:** 18 match `data/foods/foods.json` today; 20 are not in it yet: SR Legacy `usda-170894, usda-172850, usda-173709, usda-173180, usda-175206, usda-173904, usda-169287, usda-170051, usda-170027, usda-170108, usda-169968, usda-170471, usda-170923, usda-172231, usda-170932, usda-170922, usda-174266` and provisional slugs `paneer`, `ginger-garlic-paste`, `garam-masala`. The test lists them as a warning.
- **Verification:** `npm test -w data` → `Tests 4 passed (4)`. `npm run data:load-catalog -w data` → `catalog_items: 38 rows loaded`; local Postgres `select count(*) … → 38`. `npm run catalog:link -w data` → 38-item `/associates/addtocart?AssociateTag=dayform-20…` link (1,304 chars) in `all-items-link.txt`.
- **4-day cart estimate:** 14 lines, 19 packs, **$104.77** (chicken ×2, basmati, red lentils, eggs, Greek yogurt ×2, oats, atta, onions, tomatoes ×2, spinach ×2, broccoli ×2, ginger-garlic paste, garam masala, bananas). Whole packs of oats ($16.73) and ginger-garlic paste ($13.99) drive it; the demo's "$63" is not supported by these prices.
- **Pending (human):** open `data/catalog/all-items-link.txt` signed in; confirm 38/38 in the cart and note any missing or "not available" items.
