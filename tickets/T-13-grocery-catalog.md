# T-13 · Grocery catalog with verified ASINs

| Field | Value |
|---|---|
| Wave | 1: Scaffold, data, seed |
| Demo importance | VISIBLE (S4 cart) |
| Size | M |
| Depends on | T-10, T-12 (food IDs), T-05 (link format) |
| Owns | `data/catalog/` |
| Approval needed | Human step: the user opens the all-items link once, signed in. Agents only read product pages. |
| Status | TODO |

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
_The agent fills this in._
