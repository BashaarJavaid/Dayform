# Demo Script

- **Owner:** Demo Monitor.
- **Status:** DRAFT v0. Ticket T-41 produces v1, which the user approves.
- **Length:** at most 2:59. Judges may stop watching at 3:00.

The numbers in the lines below are placeholders (S4 "$63" is the T-10 fixture total; T-13 reports the real cart total). Replace them with real system output after T-41.

---

## 1. Scenes

| ID | Time | User says or does | Screen shows | Tickets |
|---|---|---|---|---|
| S1 | 0:00–0:20 | Opening line on screen: "Every fitness app makes you type. This one, you just talk to." Then: "Alexa, I had two rotis, chicken karahi and a mango lassi for lunch." | Light bar listens, then thinks. The `meal-logged` card shows three items and an "assumed: 1 plate" badge. The rings fill. Alexa says the calories and the protein left today. | T-12, T-22, T-30, T-31, T-32 |
| S2 | 0:20–0:32 | "Actually, make that one roti." | The card updates and the totals drop. | T-22 |
| S3 | 0:32–1:10 | "Alexa, start push day." → "Done, eight reps." → "My shoulder feels off. Swap the overhead press." | `workout` card: "Bench press, set 1 of 3, 80 kg × 8". The `pr` card bursts. The rest timer counts down (10 s in demo mode). The swap shows a new exercise with a target. | T-23, T-24, T-32 |
| S4 | 1:10–2:00 | "Plan my meal prep for the next four days and add what I need to my cart." Then "Yes." | "Under the hood" shows `get_daily_summary` → `plan_meal_prep` → `add_to_cart` → `checkout_cart`. The `meal-prep` carousel runs. A confirm overlay asks "Add 14 items, about $63, to your Amazon cart?" After "Yes", an amazon.com tab opens with the items in the cart. | T-13, T-25, T-26, T-05 |
| S5 | 2:00–2:25 | Press "skip to morning" (night animation). Then: "Alexa, good morning." | `brief` card: "You lost 0.2 kg this week, slower than planned, so I trimmed 150 calories. Today is legs: squat 102.5 kg × 5." | T-27, T-21 |
| S6 | 2:25–2:35 | "How's my bench going?" | `progress` card: a 6-week rising line. | T-23 |
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
| AWS Builder: a multi-service pipeline | S7: Nova Sonic + AgentCore + Opus on Bedrock + Aurora + EventBridge |

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
| S1 | MOCK | NOT STARTED | none (mock, mcp driver) | 2026-10-22 | log_meal: 3 items, 1 assumed (karahi plate), totals + protein left. 4–14 ms. |
| S2 | MOCK | NOT STARTED | none (mock, mcp driver) | 2026-10-22 | correct_meal: meal 928 → 808 kcal, day 1438 → 1318 kcal (fixture numbers). |
| S3 | MOCK | NOT STARTED | none (mock, mcp driver) | 2026-10-22 | start_workout → log_set (is_pr) → swap_exercise → finish_workout (off-script turn). Max 13 ms. |
| S4 | MOCK | NOT STARTED | none (mock, mcp driver) | 2026-10-22 | 4 tools in one turn; elicitation auto-accepted ("Add 14 items, about $63…"); link returned. $63.41 is the T-10 placeholder; T-13 gives the real total. Max 83 ms. |
| S5 | MOCK | NOT STARTED | none (mock, mcp driver) | 2026-10-22 | get_morning_brief with targets_change −150 kcal. advance-day not exercised (mock has no admin routes). |
| S6 | MOCK | NOT STARTED | none (mock, mcp driver) | 2026-10-22 | get_progress: 7 points, 88.7 → 101.3 kg. |
| S7 | MOCK | NOT STARTED | none (mock, mcp driver) | 2026-10-22 | tools/list: 18 tools, protocol 2025-11-25 (19 with CHECKOUT_CONFIRM=tool, also passes). |

---

## 4. Recording checklist

1. Run `npm run demo:warm`. This resets the seed state, warms Aurora, opens an AgentCore session, opens a Sonic session, and preloads the cards.
2. Set `DEMO_MODE=true`, rest timers to 10 s, and `OVERNIGHT_MODE=cached`.
3. Sign in to amazon.com in the recording browser (for S4).
4. Turn off system notifications. Set browser zoom to 100%. Hide bookmarks.
5. Check the mic level. Do one test line.
6. Open the OBS scene at 1920×1080. Check the system audio and mic tracks.
7. Keep the typed safe lines open in a hidden window.
8. Reset the seed state before every take.
