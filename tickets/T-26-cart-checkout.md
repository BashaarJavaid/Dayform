# T-26 · Cart and checkout

| Field | Value |
|---|---|
| Wave | 2: MCP server tools |
| Demo importance | HERO (S4 finish) |
| Size | M |
| Depends on | T-20, T-13 (catalog), T-25 (plan grocery list), T-05 (link flow), T-03 (elicitation) |
| Owns | `server/src/tools/cart/`, `server/src/domain/cart/` |
| Approval needed | Human step: the user verifies the final link once, signed in to Amazon |
| Status | DONE (the final plan-cart link is opened by the user during T-41 rehearsal) |

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
**Status: REVIEW**, 2026-10-22. Everything is built and verified except the human step: the user has not yet opened a T-26 checkout link while signed in.

**Built**
- `server/src/domain/cart/index.ts`
  - Cart state lives in `cart_items`, one row per catalog item, with `quantity` counted in packs.
  - Name matching runs in code: exact id or name, then the one item that contains the words, then the head noun ("rice" → basmati rice, not rice cakes), then trigram similarity of at least 0.3.
  - `CartProvider` comes in three forms: `AmazonCartLinkProvider` (the `/associates/addtocart?AssociateTag=dayform-20` form, copied from smoke/amazon-cart/build-link.ts), `SearchLinkProvider` (used for any item with `asin: null`), and `CreatorsApiProvider`, which is declared as a type only.
  - Every checkout writes a `cart_checkouts` row.
- `server/src/tools/cart/index.ts`
  - Tools: `add_to_cart`, `remove_from_cart`, `view_cart`, `checkout_cart`.
  - `cartTools(mode)` registers `confirm_checkout` only when `CHECKOUT_CONFIRM=tool`.
- `server/test/cart.test.ts`: 8 tests.

**Verified**
- `npm test -w server -- cart`: 8 passed (8). They cover the link format, name matching, `from_plan` aggregation from a T-25-shaped plan fixture (with retry idempotency and an unavailable item left out), `items[]` merging and removal, elicitation accept with the GET stream refused (AgentCore-like), decline and cancel, an empty cart, and two-step mode.
- Full server suite: 73 of 74 pass. The one failure is `nutrition > get_daily_summary`, where lunch is missing. That test file is T-22's and doesn't touch the cart. Other agents were running tests against the same test database at the same time.
- `npm run db:reset`, then a real SDK client against `PORT=8012`:
  - `add_to_cart` with 5 items: 174 ms (cold catalog load; 30 ms warm)
  - `view_cart`: 5 ms
  - `checkout_cart` accept: 20 ms. The question was "Add 5 items, about $59, to your Amazon cart?" and the link was `https://www.amazon.com/associates/addtocart?AssociateTag=dayform-20&ASIN.1=B089BWP51D&Quantity.1=1&...`
  - `checkout_cart` decline: 12 ms, status `declined`, cart unchanged
  - `remove_from_cart`: 9 ms
- `plan_meal_prep` (cached plan id 1), then `add_to_cart {from_plan:true}`: 15 lines, 15 packs, $189.38, which matches the plan's grocery total. A second `from_plan` call adds nothing. Checkout accept returns a 15-ASIN link.

**Deviations**
- Decline returns `checkout.status: "declined"` (or `"cancelled"`), as the contract requires, instead of `{status: "not_sent"}`. The `content` text says "Not sent".
- The link form is the user-verified `/associates/addtocart` form, not the old `/gp/aws/cart/add.html` form named in the ticket.
- Availability uses T-25's `loadCatalog().available`: shelf-stable items plus the frozen chicken, until T-13 adds a flag. That gives the planner and the cart one rule. The orchestrator's note marked only fresh and refrigerated items as unavailable.
- Unavailable items are left out of the cart and named in `content`, because `CartItem` has no `unavailable` field.
- The input field is `packs`, not `quantity`, per the contract.
- The cart is kept after a confirmed checkout; the ticket says nothing about clearing it.

**Follow-up after T-40 (Aurora latency):** `add_to_cart {from_plan}` took 2161 ms on the Data API, because it made 3 calls per line.
- The cart is now changed in memory, then written with one clock read and one statement (a CTE: UPDATE the existing rows, INSERT the new ones in order).
- `remove_from_cart` makes one UPDATE or DELETE and no clock read.
- The tools reuse the rows they already read instead of reading the cart again.
- Behaviour is unchanged, except that the same item named twice in one `items[]` now sums its packs (before, the second name overwrote the first).
- Timings, server-side:
  - Local pg: from_plan writing 12 lines takes 80 ms (cold).
  - Aurora Data API (port 8015): from_plan writing 12 lines takes 287 ms; a from_plan retry 88 ms; items[] 243 ms; view_cart 38 ms; remove_from_cart 168 ms; checkout_cart accept 220 ms and decline 199 ms.

**Fallbacks used:** none. `SearchLinkProvider` is wired, but no catalog item has a null ASIN.

**Orchestrator close-out (2026-10-22):** verified 8 tests and the live sequence (add 5 items → 4 added, eggs unavailable → elicitation → accept returns the /associates/addtocart link in 31 ms → decline keeps the cart). The user already confirmed the link form fills a real cart (T-05); the full plan cart gets opened once during T-41 rehearsal. DONE.
