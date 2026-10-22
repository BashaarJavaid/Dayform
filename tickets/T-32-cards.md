# T-32 · Cards (MCP Apps and native)

| Field | Value |
|---|---|
| Wave | 3: Simulator and cards |
| Demo importance | HERO (the visual wow of every scene) |
| Size | L |
| Depends on | T-10 (card data types, fixtures), T-06 (MCP Apps pattern) |
| Owns | `cards/` |
| Approval needed | No |
| Status | TODO |

## Goal
Build 8 animated cards at 768×480. Each one works as an MCP Apps card and as a native React component. Also build the host module the simulator uses to show MCP Apps cards.

## Why it matters for the demo
Cards are what the judges see in every scene. They cover the judges' examples "media support (cards, carousels)" and "MCP Apps".

## Read first
- [DESIGN.md §5 Cards](../DESIGN.md#5-cards), [§3 Alexa+ add-on rules](../DESIGN.md#3-alexa-add-on-rules)
- `smoke/mcp-apps/` (T-06) and [SMOKE-RESULTS.md](../SMOKE-RESULTS.md) §T-06
- `packages/contracts/`: card data types and the mock fixtures.

## Tasks
1. **Design tokens:**
   - Colors: dark background, an Alexa cyan accent, one color each for protein, carbs and fat.
   - A type scale readable from 3 m away (the minimum body size at 768×480 is 20 px).
   - Motion: 200–400 ms ease-out. Each card's entrance finishes within 1.2 s.
2. **Card components.** Build each one as a React component that takes its contract type:
   - `rings`: four rings that fill, with numbers that count up, plus a water bar.
   - `meal-logged`: item rows with grams, an "assumed" badge, an "estimated" badge, and meal totals.
   - `workout`: exercise name, "Set X of Y", target weight × reps in large type, and a rest countdown ring.
   - `pr`: a confetti burst, "New PR", the lift, the new e1RM and the change.
   - `progress`: a line chart that draws in over 6 weeks, with a summary chip ("+7.5 kg e1RM").
   - `meal-prep`: a carousel of the days. Each day shows its meals and macros against target, with a batch-cook step list at the end. It advances every 5 s, or on a swipe.
   - `cart`: lines with packs, the estimated total, an "Open Amazon cart" button and a QR code.
   - `brief`: a greeting, yesterday in 3 facts, one insight, today's workout and targets, and the targets-change reason.
3. **MCP Apps builds.** Build each component into single-file HTML (for example with `vite-plugin-singlefile`). It uses the ext-apps app-side API to receive the tool result. Output: `cards/dist/<name>.html`. The server serves these (T-20).
4. **Card buttons.** These call tools through the host bridge:
   - `meal-prep`: "Add all to cart" → `add_to_cart {from_plan:true}`
   - `cart`: "Checkout" → `checkout_cart`
   - `rings`: "+ water" → `log_water {glasses:1}`

   If T-06 found that callbacks are unsupported, hide these buttons in MCP Apps mode.
5. **Host module** (`cards/host/`), used by T-31:
   - a sandboxed iframe at 768×480
   - the ext-apps host bridge
   - a postMessage relay for card-to-tool calls
6. **Preview page** (`npm run cards:preview`). Shows every card with the mock fixtures, in both modes, side by side.
7. **Charts:** hand-drawn SVG, or one small library. Keep each card's bundle small.

## Acceptance criteria
- [ ] All 8 cards render the fixtures at 768×480 with no overflow and no clipping.
- [ ] Text stays sharp and readable when the frame is scaled to 1152×720.
- [ ] Entrance animations finish within 1.2 s and run at 60 fps.
- [ ] Every card works as MCP Apps HTML and as a native component, with the same look.
- [ ] Card buttons call tools through the host, or are hidden when unsupported.
- [ ] The preview page shows all cards. Screenshots are saved to `cards/screens/`.

## Test scenario
1. Run `npm run cards:build && npm run cards:preview`.
2. Expect 8 cards in each mode, matching each other, with no console errors.
3. In the simulator with the mock, run S4. Expect the carousel to advance, then "Add all to cart" to trigger `add_to_cart` in the "Under the hood" panel.

## Fallbacks
- **MCP Apps rendering fails in the simulator:** set `CARDS_MODE=native` (same components). The server still declares the `ui://` resources for Alexa+ compatibility.

## Result
_The agent fills this in._
