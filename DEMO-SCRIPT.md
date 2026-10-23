# Demo Script

- **Owner:** Demo Monitor.
- **Status:** DRAFT v0. Ticket T-41 produces v1, which the user approves.
- **Length:** at most 2:59. Judges may stop watching at 3:00.

Numbers below come from a real-server run from the seed state (2026-10-23 01:47 UTC, `npm run demo:warm` then `npm run demo:scene -- all`, `OVERNIGHT_MODE=cached`). Re-check them after any seed or catalog change.

---

## 1. Scenes

| ID | Time | User says or does | Screen shows | Tickets |
|---|---|---|---|---|
| S1 | 0:00–0:20 | Opening line on screen: "Every fitness app makes you type. This one, you just talk to." Then: "Alexa, I had two rotis, chicken karahi and a mango lassi for lunch." | Light bar listens, then thinks. The `meal-logged` card shows three items and an "assumed: 1 plate" badge. The rings fill. Alexa says the calories and the protein left today. Real: lunch 904 kcal, 48.7 g protein; 970 kcal and 96 g protein left; assumed "1 plate of chicken karahi = 250 g". | T-12, T-22, T-30, T-31, T-32 |
| S2 | 0:20–0:32 | "Actually, make that one roti." | The card updates and the totals drop: lunch 904 → 785 kcal, 1,089 kcal left. | T-22 |
| S3 | 0:32–1:10 | "Alexa, start push day." → "Done, eight reps." → "My shoulder feels off. Swap the overhead press." | `workout` card: "Barbell bench press, set 1 of 3, 80 kg × 8". The `pr` card bursts: estimated 1RM 101.3 kg (+2.6 kg). The rest timer counts down (10 s in demo mode; `demo:warm` sets it, reset clears it). The swap shows Landmine press, 32.5 kg × 6. | T-23, T-24, T-32 |
| S4 | 1:10–2:00 | "Plan my meal prep for the next four days and add what I need to my cart." Then "Yes." | "Under the hood" shows `get_daily_summary` → `plan_meal_prep` → `add_to_cart` → `checkout_cart`. The `meal-prep` carousel runs. A confirm overlay asks "Add 12 items, about $112, to your Amazon cart?" (cart total $112.44; plan days 2,256 kcal each) After "Yes", an amazon.com tab opens with the items in the cart. | T-13, T-25, T-26, T-05 |
| S5 | 2:00–2:25 | Press "skip to morning" (night animation). Then: "Alexa, good morning." | `brief` card: "You lost 0.3 kg this week, slower than the planned 0.4, so I trimmed 110 calories. Today is legs: squat 102.5 kg × 5." (server reason text: "You lost 0.3 kg this week instead of 0.4 kg, so I reduced 110 calories daily."; 2,360 → 2,250 kcal) | T-27, T-21 |
| S6 | 2:25–2:35 | "How's my bench going?" | `progress` card: a 6-week rising line, bench estimated 1RM 91.8 → 101.3 kg (+9.5) after S3. | T-23 |
| S7 | 2:35–2:59 | Proof and close. | The tool-call trace, the AgentCore console, and MCP Inspector showing protocol 2025-11-25 over Streamable HTTP with 18 tools. Then the architecture slide and the tagline. | T-40, T-50 |

**Safe lines.** Every spoken line has a typed version. If voice recognition fails during a take, type the line.

Known mishearings (Nova 2.5 Sonic food-word test, 2026-10-22, `smoke/nova-sonic/food-words.md`; run-on speech, harsher than the takes):

| Line | Heard as | Plan |
|---|---|---|
| "start push day" (S3) | "start pushte" | T-30 prompt names the program days; type the line if misheard |
| "Done, eight reps." (S3) | "done eight trips" | T-30 prompt says "reps" may be heard as "trips"; type the line if misheard |
| "Dayform" (any) | "day form" | No script line says "Dayform" aloud; keep it that way |
| "chicken karahi" (S1) | "chicken karai" | T-12 alias `karai`; no action |

Scene runner: `npm run demo:scene -- S1..S7|all` (`demo/`) runs each line as typed text and asserts the tools and key fields; `npm run demo:warm` is the warm-up.

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
| S1 | REAL | NOT STARTED | log_meal (local server :8001, mcp driver) | 2026-10-23 | log_meal 13–91 ms. 3 items, karahi assumed 250 g. |
| S2 | REAL | NOT STARTED | correct_meal (local server :8001, mcp driver) | 2026-10-23 | correct_meal 13–52 ms. 904 → 785 kcal. |
| S3 | REAL | NOT STARTED | start_workout, log_set, swap_exercise, finish_workout (local server :8001, mcp driver) | 2026-10-23 | start_workout → log_set (PR, 10 s rest) → swap_exercise → finish_workout (off-script). Max 21 ms. Needs `demo:warm` for the 10 s rest timer. |
| S4 | REAL | NOT STARTED | get_daily_summary, plan_meal_prep, add_to_cart, checkout_cart (local server :8001, mcp driver) | 2026-10-23 | 4 tools, max 60 ms (cached plan). Elicitation accepted: "Add 12 items, about $112…". Real Add-to-Cart link returned; Amazon tab not checked by the runner. |
| S5 | REAL | NOT STARTED | get_morning_brief + admin advance-day (local server :8001, mcp driver) | 2026-10-23 | advance-day (cached, 4 ms) → get_morning_brief 11–16 ms, −110 kcal. |
| S6 | REAL | NOT STARTED | get_progress (local server :8001, mcp driver) | 2026-10-23 | get_progress 3–5 ms, 6 points, 91.8 → 101.3 kg. |
| S7 | BROKEN | NOT STARTED | tools/list (local server :8001, mcp driver) | 2026-10-23 | tools/list returns 19 tools: T-20 sample tool `ping` (server/src/tools/_sample) is registered. Protocol 2025-11-25 OK. AgentCore not run yet (T-40). |

---

## 4. Recording checklist

1. Run `npm run demo:warm`. This resets the seed state, sets rest timers to 10 s (reset clears them), warms Aurora, opens an AgentCore session, opens a Sonic session, and preloads the cards.
2. Set `DEMO_MODE=true`, rest timers to 10 s, and `OVERNIGHT_MODE=cached`.
3. Sign in to amazon.com in the recording browser (for S4).
4. Turn off system notifications. Set browser zoom to 100%. Hide bookmarks.
5. Check the mic level. Do one test line.
6. Open the OBS scene at 1920×1080. Check the system audio and mic tracks.
7. Keep the typed safe lines open in a hidden window.
8. Reset the seed state before every take.
