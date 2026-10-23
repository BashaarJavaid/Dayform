# Demo Script

- **Owner:** Demo Monitor.
- **Status:** DRAFT v1, 2026-10-23. Waiting for the user's approval (T-41).
- **Length:** at most 2:59. Judges may stop watching at 3:00.
- **Numbers:** every number below is real output from the seed state, taken from three clean simulator runs on 2026-10-23 (`npm run demo:warm`, then `npm run demo:scene -- all --driver simulator --runs 3`, local server on Aurora, `OVERNIGHT_MODE=cached`). Re-check them after any change to the seed or the catalog.
- **[USER]** marks steps only the user can do.

---

## 1. Scenes

Speak the **Say** line. If Alexa mishears it, or nothing happens within 5 s, press `/`, type the **Typed safe line**, and press Enter (drill D1). No line says "Dayform" aloud, because Sonic hears it as "day form".

| ID | Time | Say (voice) | Typed safe line | Screen shows (real values) | Tickets |
|---|---|---|---|---|---|
| S1 | 0:00–0:22 | On-screen title: "Every fitness app makes you type. This one, you just talk to." Then: "Alexa, I had two rotis, chicken karahi and a mango lassi for lunch." | `I had two rotis, chicken karahi and a mango lassi for lunch` | The light bar listens, then thinks. The `meal-logged` card shows 3 items, 904 kcal, with the badge "Assumed 1 plate of chicken karahi = 250 g". Rings: 970 kcal and 96 g protein left. | T-12, T-22, T-30, T-31, T-32 |
| S2 | 0:22–0:34 | "Actually, make that one roti." | `make that one roti` | The same card updates in place: lunch 904 → 785 kcal, 1,089 kcal left. | T-22 |
| S3 | 0:34–1:14 | "Alexa, start push day." → "Done, eight reps." → "My shoulder feels off. Swap the overhead press." | `start push day` → `done, 8 reps` → `swap the overhead press, my shoulder feels off` | `workout` card: "Barbell bench press, set 1 of 3, 80 kg × 8". The `pr` card bursts: estimated 1RM 101.3 kg (+2.6). The rest timer runs 10 s. The swap shows Landmine press, 3 × 32.5 kg × 6. | T-23, T-24, T-32 |
| S4 | 1:14–1:54 | "Plan my meal prep for the next four days and add what I need to my cart." Then "Yes." | `plan my meal prep for the next four days and add what I need to my cart`, then click **Yes** | "Under the hood" shows `get_daily_summary` → `plan_meal_prep` → `add_to_cart` → `checkout_cart`. The `meal-prep` carousel shows 4 days at 2,256 kcal each. The confirm overlay asks "Add 12 items, about $112, to your Amazon cart?" After "Yes", the cart card shows $112.44 and an amazon.com tab opens with the 12 items. | T-13, T-25, T-26, T-05 |
| S5 | 1:54–2:22 | Press "skip to morning" in the demo panel (night animation, 3 s). Then: "Alexa, good morning." | `good morning` | `brief` card: lost 0.3 kg this week against a planned 0.4 kg, so calories drop by 110 (2,360 → 2,250). Today is legs: back squat 102.5 kg × 5. Yesterday: 1,271 kcal. | T-27, T-21 |
| S6 | 2:22–2:34 | "How's my bench going?" | `how's my bench going` | `progress` card: bench estimated 1RM rising over 6 weeks, 91.8 → 101.3 kg (+9.5, includes the S3 PR). | T-23 |
| S7 | 2:34–2:59 | Proof and close (voice-over). | none | **[USER]** clips: the "Under the hood" trace, the AgentCore runtime console (`dayform_server`), and MCP Inspector showing protocol 2025-11-25 over Streamable HTTP with 18 tools. Then the architecture slide and the tagline. | T-40, T-50 |

Known mishearings (Nova 2.5 Sonic food-word test, 2026-10-22, `smoke/nova-sonic/food-words.md`; run-on speech is harsher than a take):

| Line | Heard as | Plan |
|---|---|---|
| "start push day" (S3) | "start pushte" | The T-30 prompt names the program days. If it is misheard, type the safe line. |
| "Done, eight reps." (S3) | "done eight trips" | Type `done, 8 reps` if misheard. |
| "Dayform" | "day form" | Never said aloud. |
| "chicken karahi" (S1) | "chicken karai" | T-12 alias `karai`. No action needed. |

### 1.1 Timing (measured, 2026-10-23)

Three simulator runs in a row, all clean, with the text voice engine (Nova 2 Lite + Polly). On-air time = the user's line at 2.5 words/s + time to Alexa's first audio + the length of Alexa's audio. S3 leaves out the off-script `finish_workout` turn. The live take uses Sonic: T-30 measured first audio at 0.7–1.9 s, but its replies are about as long (S4 about 15 s, S5 about 29 s).

| Scene | Budget | On-air, runs 1/2/3 | Alexa's audio | Over by | Proposal |
|---|---|---|---|---|---|
| S1 | 22 s | 30 / 30 / 31 s | 21.6 s | 8 s | P1 |
| S2 | 12 s | 19 / 19 / 18 s | 14 s | 7 s | P1 |
| S3 | 40 s | 46 / 45 / 46 s | 6.5 + 16.8 + 6.8 s | 6 s | P1 (the `log_set` reply reads out the next set) |
| S4 | 40 s | 24 / 25 / 24 s | 9.4 s | under, about 15 s to spare | The carousel holds 8 s. Spare time goes to S5. |
| S5 | 28 s | 49 / 50 / 48 s | 44 s | 21 s | P1, P2 |
| S6 | 12 s | 20 / 20 / 21 s | 15.7 s | 8 s | P1, P3 |
| Total S1–S6 | 154 s | 188 / 189 / 188 s | | 34 s | |

Proposals (the user decides; P1 is a change in T-30, not in this file):
- **P1:** cap Alexa's replies at about 15 words and one or two numbers. The cards already show the details. Today replies read out every field: S1 lists both assumptions and the day totals, and S5 reads yesterday, the weight, the targets and the reason (about 70 words). Estimated saving: about 45 s in total.
- **P2:** if P1 is not enough for S5, start the S5 clip on the brief card and cut the night animation down to 1 s in the edit.
- **P3:** S6 is the first scene to cut if the video still runs over (it is not a keep-at-all-costs scene; S1, S3, S4 and S5 are).
- `finish_workout` stays off camera. It works (6–330 ms), but the script has no time for it.

**Safe lines.** Every spoken line has a typed version. If voice recognition fails during a take, type the line.

---

## 2. What each scene proves to the judges

| Judges' Alexa+ "creative" example | Where we show it |
|---|---|
| An agentic workflow that orchestrates across services | S4: plan → cart → Amazon |
| A context-aware add-on that keeps state across sessions | S3 (live session), S5 (the morning after) |
| Purchasing capabilities | S4 checkout |
| Media support: cards, carousels | Every scene; S4 carousel |
| MCP Apps | Every card |
| AWS Builder: a multi-service pipeline | S7: Nova Sonic + AgentCore + Nova 2 Lite on Bedrock + Aurora + EventBridge |

| Judging criterion | Scenes that carry it |
|---|---|
| Tech Implementation | S4, S7 |
| Design (fits the device) | S1, S3 |
| Potential Impact | S1, S5 |
| Quality of the Idea | S4, S5 |

---

## 3. Readiness matrix

The Demo Monitor updates this after every run.

States:
- **READY:** runs on real parts and passes.
- **MOCK:** runs on the mock.
- **BROKEN:** fails.
- **NOT STARTED.**

| Scene | Text mode | Voice mode | Real tools used | Last run | Notes |
|---|---|---|---|---|---|
| S1 | READY | NOT STARTED [USER take] | log_meal | 2026-10-23, simulator ×3 | log_meal 52–363 ms. First audio 3.3–3.8 s. |
| S2 | READY | NOT STARTED [USER take] | correct_meal | 2026-10-23, simulator ×3 | 337–383 ms. |
| S3 | READY | NOT STARTED [USER take] | start_workout, log_set, swap_exercise, finish_workout | 2026-10-23, simulator ×3 | start_workout 509–537 ms and log_set 538–595 ms: over 500 ms on Aurora. |
| S4 | READY | NOT STARTED [USER take] | get_daily_summary, plan_meal_prep, add_to_cart, checkout_cart | 2026-10-23, simulator ×3 | add_to_cart 3.0–3.1 s: the :8001 server predates the T-26 batching fix (ff949a1). First audio 7.5–8.8 s. |
| S5 | READY | NOT STARTED [USER take] | admin advance-day, get_morning_brief | 2026-10-23, simulator ×3 | 166–244 ms. Run 3 once said yesterday was 486 kcal, not 1,271. Not reproduced in 3 more tries; the runner now asserts it. |
| S6 | READY | NOT STARTED [USER take] | get_progress | 2026-10-23, simulator ×3 + AgentCore ×1 | 100–236 ms locally, 600 ms through AgentCore. |
| S7 | READY | n/a | tools/list | 2026-10-23 | 18 tools, protocol 2025-11-25. The Inspector and console clips are the user's. |

---

## 4. Failure drills

Each drill was tested once on 2026-10-23.

| ID | Failure | What to do | Tested |
|---|---|---|---|
| D1 | Bedrock slow, or Sonic mishears a line | Don't wait more than 5 s. Press `/`, type the safe line from §1, press Enter. Keep going: the scene still runs. | `npm run sim:verify -- --scenes S1` types S1 through the `/` box on the real frontend: PASS (log_meal 357 ms, card, both captions). The scene runner types every line the same way (`text_input`): 3 clean runs. |
| D2 | AgentCore down | Ctrl-C `sim:backend`. Run `MCP_URL=http://localhost:8001/mcp MCP_AUTH=none VOICE_ENGINE=sonic npm run sim:backend` (the local server runs with `DB_DRIVER=data-api`, so the data is the same Aurora). Reload the page (Cmd-R). Run `npm run demo:warm`. Restart the take. | A backend on 8301 against AgentCore passed S6 (get_progress 600 ms). After killing it, the restart on the local URL reached /health in 1.0 s and passed S6 14.4 s after the kill. With warm (10 s) and a reload, the switch takes about 30 s. Target: under 1 minute. Met. |
| D3 | Sonic down | Ctrl-C `sim:backend`. Run `VOICE_ENGINE=text npm run sim:backend` (typed lines, Polly voice), or `VOICE_ENGINE=pipeline` to keep the mic (Transcribe). Reload the page. Type every line from §1. | A Sonic backend on 8301 answered S6 (first audio 1.4 s). After killing it, the restart with `VOICE_ENGINE=text` reached /health in 1.0 s and finished its first reply 22.7 s after the kill. |
| D4 | The Amazon tab asks for sign-in, or the pop-up is blocked | Before recording: **[USER]** sign in to amazon.com in the recording browser, and allow pop-ups for localhost:5173. If the tab is blocked anyway, click "Open Amazon cart" on the cart card. | Not tested: needs the user's signed-in browser. T-31 verified that the tab opens after a click on Yes. |

---

## 5. Recording checklist

1. Start the stack: the server (`OVERNIGHT_MODE=cached npm run dev`, or AgentCore via `.env.aws`), `npm run sim:backend` (Sonic), and `npm run sim:frontend`.
2. **[USER]** Open http://localhost:5173 in the recording browser **before** step 3, and don't reload it afterwards. The voice engine runs only while a page is connected, so the warm session lives in that page.
3. Run `npm run demo:warm` and expect READY in about 10 s. It does the Aurora ACU check (with `DB_DRIVER=data-api`), a food-search warm-up (`log_meal`), a voice warm-up turn, a reset to the seed state, 10 s rest timers (a reset clears them), `get_daily_summary`, and a read of all 8 cards. On AgentCore, run `npm run demo:agentcore -w @dayform/infra -- warm`.
4. **[USER]** Sign in to amazon.com in the recording browser, and allow pop-ups for localhost:5173 (S4).
5. **[USER]** Turn off system notifications. Set browser zoom to 100%. Hide bookmarks.
6. **[USER]** Check the mic level and say one test line. This test line leaves state behind, so run step 3 again afterwards.
7. **[USER]** Open the OBS scene at 1920×1080. Check the system audio and mic tracks.
8. **[USER]** Keep §1's typed safe lines open in a hidden window.
9. Run `npm run demo:warm` before every take.
