# T-31 · Simulator frontend (Echo Show screen)

| Field | Value |
|---|---|
| Wave | 3: Simulator and cards |
| Demo importance | HERO (it's what the camera sees) |
| Size | L |
| Depends on | T-10 (events), T-30 (backend), T-32 (card components and host) |
| Owns | `simulator/frontend/` |
| Approval needed | No |
| Status | TODO |

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
_The agent fills this in._
