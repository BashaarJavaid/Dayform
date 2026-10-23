# T-05 · Amazon Add-to-Cart link smoke test

Files:
- `link-3.txt`: the 3-item link (quantities 1, 2, 1).
- `link-10.txt`: the 10-item link (quantity 1 each).
- `build-link.ts`: `npx tsx smoke/amazon-cart/build-link.ts ASIN:QTY [ASIN:QTY ...]` prints a link. Also exports `buildCartLink()` for T-13 and T-26.
- `screens/`: your screenshots go here.

## Products (read 2026-10-22, signed out, amazon.com US)

All were "In Stock", "Ships from Amazon.com" and "Sold by Amazon.com" (the garam masala says "Amazon") on the product page. Prices change; they are what the page showed then.

| Link | # | ASIN | Title | Pack size | Price | Qty |
|---|---|---|---|---|---|---|
| 3 | 1 | B089BWP51D | Royal Authentic Long Grain White Basmati Rice | 2 lb, pack of 2 | $8.88 | 1 |
| 3 | 2 | B08P6MF2D9 | Iberia Red Lentil Beans | 12 oz | $3.96 | 2 |
| 3 | 3 | B00DX53P4M | Jif Creamy Peanut Butter | 16 oz jar | $2.98 | 1 |
| 10 | 1 | B07TL6CDMX | Goya Chick Peas, Garbanzo Beans | 15.5 oz can, pack of 8 | $10.88 | 1 |
| 10 | 2 | B01KV4H51G | Quaker Old Fashioned Rolled Oats | 2 × 64 oz bags | $16.73 | 1 |
| 10 | 3 | B07BCX2YNG | Pompeian Smooth Extra Virgin Olive Oil | 68 fl oz (2 L) | $21.48 | 1 |
| 10 | 4 | B000GISTZ4 | Optimum Nutrition Gold Standard Whey, Vanilla Ice Cream | 2 lb | $47.99 | 1 |
| 10 | 5 | B015GK0Z8A | Amazon Grocery Whole Almonds, unroasted, unsalted | 16 oz | $6.34 | 1 |
| 10 | 6 | B08WR5J62L | Chicken of the Sea Chunk Light Tuna in water | 5 oz can, 10 count | $10.48 | 1 |
| 10 | 7 | B00VXQGY28 | 4th & Heart Original Grass Fed Ghee | 9 oz | $11.48 | 1 |
| 10 | 8 | B0011311TO | McCormick Gourmet Garam Masala | 1.7 oz | $8.91 | 1 |
| 10 | 9 | B00CMQD3VS | Nate's Raw & Unfiltered Honey | 32 oz squeeze bottle | $14.47 | 1 |
| 10 | 10 | B0CF37Y3V8 | Quaker Large Rice Cakes, White Cheddar | 5.5 oz, pack of 3 | $11.97 | 1 |

## Your steps (human only; about 10 minutes)

Nothing here places an order. Do not click "Proceed to checkout". Empty the cart afterwards if you like.

Use a desktop browser. Take full-window screenshots (macOS: Cmd+Shift+4, then Space, then click the window). Save them into `smoke/amazon-cart/screens/` with the names below. Count every click or key press you make between opening the link and seeing the cart.

**Run A: signed out (3 items)**
1. Open a private window (Cmd+Shift+N in Chrome). Make sure you are signed out of amazon.com.
2. Paste the link from `smoke/amazon-cart/link-3.txt` and press Enter.
3. Screenshot each page you see, in order: `A1-first-page.png`, `A2-sign-in.png`, `A3-<what it is>.png` (for example a "Continue" or "Add to cart" confirmation page), and so on.
4. Sign in if asked. (Password screens: screenshot before typing, never with the password visible.)
5. When the cart shows, screenshot it: `A9-cart.png`. Check: basmati qty 1, red lentils qty 2, peanut butter qty 1.

**Run B: signed in (10 items)**
1. In your normal window, already signed in to amazon.com, empty the cart (or note what was in it).
2. Open the link from `smoke/amazon-cart/link-10.txt`.
3. Screenshot each page: `B1-first-page.png`, `B2-...png`, then the cart: `B9-cart.png` (scroll and take `B9b-cart.png` if not all 10 fit).
4. Check all 10 items are in the cart with qty 1.

**Run C: signed in (3 items)**
1. Still signed in, open the link from `link-3.txt` again.
2. Screenshot each page: `C1-...png` to `C9-cart.png`. Note which steps from Run A were skipped.

## What to report back (copy, fill, paste to the orchestrator)

```
Run A (signed out, 3 items): cart filled yes/no; quantities 1/2/1 yes/no; pages seen in order: ...; clicks: N
Run B (signed in, 10 items): cart filled yes/no; items in cart: N/10; missing: ...; pages seen: ...; clicks: N
Run C (signed in, 3 items): cart filled yes/no; quantities yes/no; steps skipped vs Run A: ...; clicks: N
Shipping / region / "not available" messages (exact text): ...
Anything surprising (exact text): ...
```
