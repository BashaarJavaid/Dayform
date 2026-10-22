# Demo Script

- **Owner:** Demo Monitor.
- **Status:** DRAFT v0. Ticket T-41 produces v1, which the user approves.
- **Length:** at most 2:59. Judges may stop watching at 3:00.

The numbers in the lines below are placeholders. Replace them with real system output after T-41.

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
| S1 | NOT STARTED | NOT STARTED | — | — | — |
| S2 | NOT STARTED | NOT STARTED | — | — | — |
| S3 | NOT STARTED | NOT STARTED | — | — | — |
| S4 | NOT STARTED | NOT STARTED | — | — | — |
| S5 | NOT STARTED | NOT STARTED | — | — | — |
| S6 | NOT STARTED | NOT STARTED | — | — | — |
| S7 | NOT STARTED | NOT STARTED | — | — | — |

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
