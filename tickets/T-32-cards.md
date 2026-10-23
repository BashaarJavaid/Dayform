# T-32 · Cards (MCP Apps and native)

| Field | Value |
|---|---|
| Wave | 3: Simulator and cards |
| Demo importance | HERO (the visual wow of every scene) |
| Size | L |
| Depends on | T-10 (card data types, fixtures), T-06 (MCP Apps pattern) |
| Owns | `cards/` |
| Approval needed | No |
| Status | DONE (60 fps not measurable headless; S4-in-simulator check runs with T-31) |

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
Agent run 2026-10-22.

**Built (all in `cards/`):**
- `src/cards/*.tsx`: 8 React components, each `({ data: <contract type>, callTool?, openLink? })`. Tokens and motion in `src/styles.css` (scoped `.df-card`), shared pieces in `src/ui.tsx` (count-up, SVG ring, bar, tool button, confetti). Hand-drawn SVG for rings, rest ring and the progress chart; QR via `qrcode-generator` (only extra dependency).
- `src/index.ts`: native export for T-31: the 8 components, `CARD_COMPONENTS` (by name) and `CardByUri` (`ui://cards/<name>` -> component).
- `src/mcp/mount.tsx` + `build.ts`: esbuild single-file builds -> `dist/<name>.html` (ext-apps `App`, `ontoolresult` renders the component; the card zooms to fill any frame size). Buttons show only if the host declares `serverTools`; "Open Amazon cart" only if it declares `openLinks` (otherwise QR only).
- `host/index.ts`: `mountCardFrame({ container, html, toolResult, toolInput?, scale?, onCallTool?, onOpenLink? })` -> `{ iframe, ready, update(result), destroy() }`. Sandboxed `allow-scripts` iframe, 768x480 x scale, ext-apps `AppBridge` + `PostMessageTransport` (the T-06 pattern). `update()` re-sends a result to the same card (S2 correct_meal) without reloading.
- `preview/` (Vite): every card state from `mock/fixtures`, MCP Apps and native side by side; `?scale=1.5`, `?only=<id>`. Buttons answer with the matching fixture and log the call.
- `scripts/screens.ts`: headless Chrome over CDP (approach from smoke/mcp-apps/verify-browser.ts): screenshots per entry and mode into `screens/`, overflow/ellipsis check inside each card (both modes; iframe checked through an isolated world), entrance length from `document.getAnimations()`, console errors (iframes included), and MCP-mode button clicks.
- `test/cards.test.tsx`: 14 Vitest tests (fixtures parse against the contracts and render with the key facts; buttons hidden without `callTool`; PR merge; `CardByUri`; dist files have no external refs).

**Verification (2026-10-22):**
- `npm run cards:build`: 8 files, 735-758 KB each (rings 737, meal-logged 735, workout 737, pr 736, progress 736, meal-prep 738, cart 758, brief 735), external refs 0. About 600 KB of each is the ext-apps App runtime (T-06 measured 603 KB with no React).
- `npm test -w @dayform/cards`: 14 passed (14).
- `npm run cards:screens` with the preview running: 13 entries x 2 modes PASS at 768x480 and again at `--scale 1.5` (1152x720): one card per frame in each mode, no element outside its frame, no ellipsis truncation, 0 console errors, longest entrance 1190 ms (progress) and below 1200 ms for all. The batch-cook slide passes too. MCP-mode buttons: rings -> `log_water {"glasses":1}`, meal-prep -> `add_to_cart {"from_plan":true}`, cart -> `checkout_cart {}` all reach the host's `onCallTool`. After the checkout click the cart card shows the QR code.
- The full preview page (`/`) renders all 13 iframe cards and 13 native cards (`screens/preview-side-by-side.png`, top of the page).
- Frame rate: headless Chrome measured 50-60 fps for most entrances, but some runs dropped to 10-40 fps. This happened when a sandboxed iframe was parsing its 740 KB bundle on the same thread while the native card animated. It was not measured on a real GPU display, so 60 fps is NOT proven.

**Decisions within the ticket:**
- Rest countdown starts from `rest_seconds` when the result arrives. It never compares `rest_ends_at` with the wall clock, because that value is on the demo clock (T-24 note).
- `workout` shows a small "New PR" chip and confetti when `pr` is set. `pr` gives one celebration per lift: the e1RM entry leads and a same-lift `rep_best` becomes the line "Also your best for N reps" (T-23 note). `prs: []` shows a calm "Logged / No PR this time" state.
- `meal-logged` shows at most 3 item rows plus "+ N more". `cart` shows 14 lines in two columns (13 + "+ N more" beyond that). `brief` shows yesterday's weight only on rest days, because the weight chip in the header always shows it.
- `meal-prep` shows `preparing` with a spinner and `failed` with the message.

**Not verified / open:**
- Test scenario step 3 (S4 in the simulator with the mock) needs T-31.
- 60 fps on real hardware has not been measured (see above).

**Orchestrator close-out (2026-10-22):** verified build (8 single files, 0 external refs), 14 tests, screenshots reviewed (rings, meal-logged, PR, meal-prep). Follow-ups done by the orchestrator: cards/dist committed (un-ignored), mock serves cards/dist when present, mock checkout fixtures use the working cart link. DONE.
