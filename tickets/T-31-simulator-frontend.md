# T-31 · Simulator frontend (Echo Show screen)

| Field | Value |
|---|---|
| Wave | 3: Simulator and cards |
| Demo importance | HERO (it's what the camera sees) |
| Size | L |
| Depends on | T-10 (events), T-30 (backend), T-32 (card components and host) |
| Owns | `simulator/frontend/` |
| Approval needed | No |
| Status | DONE (live mic and 60 fps checks happen in T-41 with the user) |

## Goal
Build a polished screen in the style of an Echo Show that makes every scene look great on video. The screen also shows what's happening "under the hood".

## Why it matters for the demo
The judges watch this screen for the whole video. It carries the Design score (an interaction model that fits the device) and much of the "wow".

## Read first
- [DESIGN.md §5 Cards](../DESIGN.md#5-cards), [§8 Demo controls](../DESIGN.md#8-demo-controls)
- [DEMO-SCRIPT.md](../DEMO-SCRIPT.md): every scene.
- `packages/contracts/`: the simulator events.

## Layout (recording at 1920×1080)
- **Left and center:** the device, with a bezel around a 768×480 screen shown at 1.5× (1152×720).
- **Below the device:** a captions bar, showing the user's words and Alexa's reply.
- **Right:** the "Under the hood" panel, 600 px wide.

## Tasks
1. **Stack:** React + Vite + TypeScript, with a dark theme that matches the Echo Show.
2. **Alexa light bar.** A thin cyan-blue bar along the bottom edge of the screen, with four states:
   - idle (off)
   - listening (soft pulse)
   - thinking (moving sweep)
   - speaking (a wave that follows the audio level)
3. **Input:**
   - Push-to-talk: hold Space, or the mic button.
   - A wake button labelled "Alexa".
   - A text box for safe lines, opened with `/`.
4. **Audio:**
   - Mic capture as 16 kHz PCM through an AudioWorklet.
   - Playback of Sonic audio, using the format from T-02, with a level meter that drives the light bar.
5. **Captions:** the live user transcript, then Alexa's reply text.
6. **Card area:**
   - An MCP Apps host (T-32 host module): a sandboxed iframe at 768×480, fed the tool data through the ext-apps bridge.
   - Smooth crossfade between cards.
   - With `CARDS_MODE=native`, render the same T-32 React components directly.
   - With no card, show the idle screen: clock, today's rings, and a "Try: 'Alexa, start push day'" hint.
7. **"Under the hood" panel:**
   - Live tool calls: icon, name, short arguments, a latency badge, and status.
   - Progress lines ("Opus is planning your meals…").
   - A small "MCP 2025-11-25 · Streamable HTTP · AgentCore" label that shows the current target.
   - Toggle with `H`.
8. **Elicitation overlay:** the question in large text, with Yes and No buttons. A spoken answer also closes it (handled by T-30).
9. **Night transition** for "skip to morning": dim, moon, sunrise, lasting 2–3 s while the admin call runs.
10. **Demo panel** (`Ctrl+Shift+D`, hidden by default):
    - reset the seed state
    - skip to morning
    - timer speed
    - voice engine
    - MCP target
    - last turn's timings
11. **Cart hand-off.** The cart card's "Open Amazon cart" opens the link in a new browser tab. A config option opens it automatically after the user confirms.
12. **Screenshots.** Save one screenshot per scene to `demo/screens/`, through the Demo Monitor.

## Acceptance criteria
- [ ] Every scene, S1–S7, looks right with the mock at 1920×1080.
- [ ] Light-bar and card animations run at 60 fps on the recording machine.
- [ ] There's no layout shift when cards change.
- [ ] Keyboard shortcuts work: Space, `/`, `H`, `Ctrl+Shift+D`.
- [ ] The elicitation overlay works with a click and with voice.
- [ ] The night transition plays while advance-day runs.

## Test scenario
1. Run `npm run mock`, `npm run sim:backend` and `npm run sim:frontend`. Open the page at 1920×1080.
2. Type the S1 line. Expect: the light bar goes listening → thinking → speaking, the `meal-logged` card fades in, a `log_meal` row appears in the panel with its latency, and captions show both sides.
3. Type the S4 line. Expect the panel to show 4 tool rows in order, the carousel, then the confirm overlay. Click Yes. Expect the cart card, and Amazon opens in a new tab.
4. Press `Ctrl+Shift+D`, then "Skip to morning". Expect the night transition, then the idle screen at 07:00.

## Result
**Status: REVIEW.** Everything I could test headless passes. Two criteria are the user's to check on the recording machine: the live mic, and 60 fps.

**Built** (`simulator/frontend/`, React + Vite + TS, no new installs):
- `src/App.tsx`: layout and inputs: hold Space or the mic button to talk; the "Alexa" button listens until a 1.2 s pause; `/` opens the text box; `H` toggles the panel; `Ctrl+Shift+D` opens the demo panel; `Esc` returns to the home screen. Also the WebSocket with auto-reconnect, the night transition, and the cart auto-open.
- `src/store.ts`: reducer for the contract events. It updates a card in place when the same card comes back (S2). It holds the `meal-prep` carousel on screen for at least 8 s before another card can replace it, and shows a held card as soon as the confirm is answered. It shows the backend's "Turn:" progress in the demo panel only.
- `src/Screen.tsx`: card layers (MCP Apps via `mountCardFrame` + `update()`, or native `CardByUri`), 450 ms crossfade, home screen (demo clock in `DEMO_TZ`, today's rings from the latest day totals, hint), light bar, confirm overlay, night overlay.
- `src/Panel.tsx`: "Under the hood" (icon, tool name, short arguments, latency badge (green under 500 ms), progress lines, one-line summary, "MCP 2025-11-25 · Streamable HTTP · <target>") and the demo panel.
- `src/audio.ts` + `src/mic-worklet.js`: mic as 16 kHz PCM16 in 32 ms AudioWorklet frames; 24 kHz playback scheduled as in T-02; analyser level drives the light bar while speaking.
- `scripts/verify.ts`: headless Chrome over CDP. Runs S1–S6 through the `/` box, checks the shortcuts, layout shift and console errors (page and card iframes), and saves `screens/*.png` at 1920×1080.

**Verified** (2026-10-23, `VOICE_ENGINE=text` backend → real server on :8001, `npm run demo:warm` before each run): `npx tsx scripts/verify.ts` → **15/15 PASS**.
- S1: lights listening→thinking→speaking→idle; `meal-logged` card, 904 kcal, 970 kcal and 96 g protein left; `log_meal` row with 380 ms badge; both captions.
- S2: same layer and same iframe (in place); 785 kcal, 1,089 left.
- S3: `start_workout` → `log_set` (New PR 101.3 kg, +2.6) → `swap_exercise` (Landmine press 32.5 kg × 6).
- S4: rows `get_daily_summary` → `plan_meal_prep` → `add_to_cart` → `checkout_cart`; carousel shown; overlay "Add 12 items, about $112, to your Amazon cart?"; real click on Yes → cart card $112.44 → amazon.com tab opened.
- S5: night 3.0 s while advance-day ran → home screen at 7:00 AM → `brief` card (−110 kcal → 2,250).
- S6: `progress` card 91.8 → 101.3.
- Layout: screen 1152×720 and every card layer box identical. Console errors: none.
- Native mode (`--cards native --scenes S1,S2,S6`): PASS.
- `--scenes S4 --say-yes`: the overlay also closes on a typed "yes" (the same backend path a spoken yes takes).
- `npm run build`: OK.

**Acceptance:**
- S1–S7 look right: S1–S6 PASS (on the real server, not the mock; S7 is the trace plus external consoles).
- 60 fps: **user to check.**
- No layout shift: PASS.
- Shortcuts: PASS (Space with Chrome's fake mic).
- Overlay closes on a click or a non-click answer: PASS; the live-voice "yes" is the user's.
- Night transition: PASS.

**Deviations:**
- Voice engine and MCP target in the demo panel are read-only (from `/health`). Switching them needs `VOICE_ENGINE`/`MCP_URL` and a `sim:backend` restart; the backend has no switch route.
- Rings on the home screen show "–" until a tool returns day totals; no typed numbers.
- Card buttons that call tools are hidden: there is no client event for tool calls. "Open Amazon cart" works.
- Screenshots go to `simulator/frontend/screens/` (per the orchestrator), not `demo/screens/`.

**Demo risks:**
1. Chrome on this laptop is 97.0.4692.71 (F-017).
2. Auto-open after a spoken "yes" has no click behind it, so allow pop-ups for localhost:5173 before recording.
3. Owned by other tickets: the workout card reads "PUSH DAY DAY"; the brief card cuts off "102.5…" and "this we…"; `add_to_cart` takes about 3.1 s; in text mode the model skipped `get_daily_summary` once in 6 runs.

**Orchestrator close-out (2026-10-22):** verified `simulator/frontend/scripts/verify.ts` 15/15 PASS against the real server (S1–S6, keyboard shortcuts, overlay, night transition, no layout shift, no console errors) and reviewed the S1 and S4 screenshots. Card nits sent to T-32 ("PUSH DAY DAY", brief truncation, times in DEMO_TZ). DONE.
