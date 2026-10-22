# T-26 · Cart and checkout

| Field | Value |
|---|---|
| Wave | 2: MCP server tools |
| Demo importance | HERO (S4 finish) |
| Size | M |
| Depends on | T-20, T-13 (catalog), T-25 (plan grocery list), T-05 (link flow), T-03 (elicitation) |
| Owns | `server/src/tools/cart/`, `server/src/domain/cart/` |
| Approval needed | Human step: the user verifies the final link once, signed in to Amazon |
| Status | TODO |

## Goal
Build the tools `add_to_cart`, `remove_from_cart`, `view_cart` and `checkout_cart`. After the user confirms, the cart ends up in their real Amazon cart.

## Why it matters for the demo
S4 ends with the judges' "purchasing capabilities" example: Alexa confirms, and the items appear in a real Amazon cart.

## Read first
- [DESIGN.md D9, D15](../DESIGN.md#1-agreed-decisions), [§4 MCP tools](../DESIGN.md#4-mcp-tools)
- [SMOKE-RESULTS.md](../SMOKE-RESULTS.md) §T-03 (elicitation) and §T-05 (link flow)

## Tasks
1. **`add_to_cart`.**
   - **Input:** `from_plan?: true`, or `items?: [{name, quantity?}]`.
   - It resolves names to catalog items (alias, then trigram) and merges them into the cart.
   - **Returns** the cart, with the `cart` card.
2. **`remove_from_cart`** with `{item, quantity?}`, and **`view_cart`** with no input. Both return the `cart` card.
3. **`checkout_cart`.**
   1. Build a summary: lines, packs and estimated total.
   2. Send an elicitation request. Message: "Add N items (about $X) to your Amazon cart?" Schema: `{confirm: boolean}`.
   3. **On accept:** build the link through the `CartProvider`. Return `{link, items, total}` with the `cart` card, which shows an "Open Amazon cart" button and a QR code.
   4. **On decline or cancel:** return `{status: "not_sent"}` and keep the cart.
4. **`CartProvider` interface:**
   - `AmazonCartLinkProvider`: the T-05 format, `ASIN.n` and `Quantity.n`.
   - `SearchLinkProvider`: the fallback for items with `asin: null`.
   - A future `CreatorsApiProvider`: declared, not built.
5. **Two-step mode**, for hosts without elicitation (T-03 fallback). Set `CHECKOUT_CONFIRM=tool`.
   - `checkout_cart` returns the summary with `needs_confirmation: true`.
   - A 19th tool, `confirm_checkout`, registered only in this mode, completes the checkout.
6. **Tests:**
   - aggregation from a plan
   - link format
   - elicitation accept and decline, with a test MCP client
   - two-step mode

## Acceptance criteria
- [ ] `add_to_cart {from_plan:true}` puts the plan's grocery list in the cart, with the right packs.
- [ ] `checkout_cart` sends elicitation. Accept returns a link; decline keeps the cart.
- [ ] The link opens Amazon with every item (the user checks once, signed in).
- [ ] Two-step mode works when `CHECKOUT_CONFIRM=tool`.
- [ ] Every tool takes under 500 ms, not counting the user's time to answer.
- [ ] Outputs validate against the contracts.

## Test scenario
1. Run `npm run db:reset`. Call `plan_meal_prep`, then `add_to_cart {from_plan:true}`. Expect about 10–15 lines.
2. Call `checkout_cart` from MCP Inspector, and answer the elicitation with accept. Expect a link starting `https://www.amazon.com/gp/aws/cart/add.html?ASIN.1=`.
3. Open the link signed in. Expect every item in the cart.
4. Call `checkout_cart` again, and decline. Expect `not_sent`, with the cart unchanged.

## Fallbacks
- **Add-to-Cart link stops working:** use `SearchLinkProvider` for all items. The cart card shows the list as links.
- **No elicitation on the chosen host:** use `CHECKOUT_CONFIRM=tool`.

## Result
_The agent fills this in._
