# T-05 · Smoke test: Amazon Add-to-Cart link

| Field | Value |
|---|---|
| Wave | 0: Setup and smoke tests |
| Demo importance | ENABLER (it unlocks the S4 finish) |
| Size | S |
| Depends on | — |
| Owns | `smoke/amazon-cart/` |
| Approval needed | Human step: the user signs in to amazon.com. Agents only read product pages. |
| Status | BLOCKED (waiting for the user's signed-in cart check; steps in `smoke/amazon-cart/README.md`) |

## Goal
Prove that one Amazon Add-to-Cart link puts several real products, with the right quantities, into the user's real Amazon cart. Record the exact flow.

## Why it matters for the demo
S4 ends with the groceries landing in a real Amazon cart. That moment carries the judges' "purchasing capabilities" example.

## Read first
- [DESIGN.md D9, D15](../DESIGN.md#1-agreed-decisions)
- https://webservices.amazon.com/paapi5/documentation/add-to-cart-form.html

## Facts from research (2026-10-23)
- **PA-API 5** is retired; calls return 403.
- **Creators API** has no cart operations, and needs 10 qualifying sales in 30 days.
- **No public API** for Amazon Fresh or Whole Foods.
- **Alexa+ checkout** sells only the developer's own products.
- **The Add-to-Cart link still works**, but now redirects to sign-in first. Format:
  `https://www.amazon.com/gp/aws/cart/add.html?ASIN.1=<asin>&Quantity.1=<n>&ASIN.2=<asin>&Quantity.2=<n>`

## Tasks
1. Pick 3 grocery products on amazon.com, reading the product pages only. Record each ASIN, title and pack size.
2. Build the link with quantities 1, 2 and 1. Save it to `smoke/amazon-cart/link-3.txt`.
3. **Human step.** The user opens the link in their own browser and signs in if asked.
4. Record every page in the flow with screenshots: sign-in, any confirmation page, the final cart. Note each click the user must make.
5. Pick 10 more products. Build a 10-item link (`link-10.txt`) and repeat.
6. Repeat with the user already signed in. Record any steps it skips.
7. Note any shipping or region message. The cart may still fill.
8. Save the screenshots to `smoke/amazon-cart/screens/`; they're useful for the video. Write the results to [SMOKE-RESULTS.md](../SMOKE-RESULTS.md) §T-05.

## Acceptance criteria
- [ ] The 3-item link fills the cart with quantities 1, 2 and 1.
- [ ] The 10-item link fills the cart with all 10 items.
- [ ] The flow is documented with screenshots, and the number of user clicks is recorded.

## Test scenario
1. Open the link in `smoke/amazon-cart/link-3.txt` in a signed-in browser.
2. Expect the Amazon cart to show the 3 products, with quantities 1, 2 and 1.

## Fallbacks
Use them in this order:
1. **Search links:** one per item (`https://www.amazon.com/s?k=<item+name>`), shown as a list on the cart card.
2. **Amazon Fresh search links.**
3. **Product pages:** a cart card with a QR code and an "Open on Amazon" button that opens each product page.

## Result
- Done by the agent (2026-10-22): 3 + 10 ASINs picked from product pages (all In Stock, shipped and sold by Amazon), `link-3.txt` (qty 1, 2, 1), `link-10.txt` (qty 1 each), `build-link.ts` (reusable `buildCartLink()` + CLI), user steps in `smoke/amazon-cart/README.md`.
- Not done: tasks 3, 4, 6, 7 and the screenshots need the user's browser and sign-in. Acceptance 0/3 until the user reports back.
- Deviations: none. Fallbacks used: none yet.
- Note: signed-out curl of the add.html link gets HTTP 503 (bot block), so only a real browser can prove the link.
