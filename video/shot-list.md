# Shot list (T-51)

From [DEMO-SCRIPT.md](../DEMO-SCRIPT.md) script v1 (approved 2026-10-23). Every number below is the script's real seed output; if the take shows a different number, the take wins and the caption changes.
Record each scene as its own take. Run `npm run demo:warm` before every take (it resets to the seed state).
Raw footage goes in `video/raw/` (git-ignored).

## Scenes

| ID | Start–end | Say (typed safe line if misheard) | Expected screen | Overlays (see [edit-notes.md](edit-notes.md)) |
|---|---|---|---|---|
| S1 | 0:00–0:22 | "Alexa, I had two rotis, chicken karahi and a mango lassi for lunch." (`I had two rotis, chicken karahi and a mango lassi for lunch`) | Light bar listens, then thinks. `meal-logged` card: 3 items, 904 kcal, badge "Assumed 1 plate of chicken karahi = 250 g". Left today: 970 kcal, 96 g protein. | Title card 0:00–0:03 (or tagline over the first seconds), then `nova-sonic`, `mcp-apps-card` |
| S2 | 0:22–0:34 | "Actually, make that one roti." (`make that one roti`) | Same card updates in place: lunch 904 → 785 kcal, 1,089 kcal left. | none |
| S3 | 0:34–1:14 | "Alexa, start push day." → "Done, eight reps." → "My shoulder feels off. Swap the overhead press." (`start push day` → `done, 8 reps` → `swap the overhead press, my shoulder feels off`) | `workout` card: "Barbell bench press, set 1 of 3, 80 kg × 8". `pr` card bursts: estimated 1RM 101.3 kg (+2.6). Rest timer 10 s. Swap: Landmine press, 3 × 32.5 kg × 6. | `mcp` (over the "Under the hood" panel) |
| S4 | 1:14–1:54 | "Plan my meal prep for the next four days and add what I need to my cart." Then "Yes." (typed line, then click **Yes**) | Under the hood: `get_daily_summary` → `plan_meal_prep` → `add_to_cart` → `checkout_cart`. `meal-prep` carousel, 4 days at 2,256 kcal. Confirm: "Add 12 items, about $112, to your Amazon cart?" After Yes: cart card $112.44, amazon.com tab with 12 items. | `nova-lite` (on the plan), `add-to-cart` (on the amazon.com tab) |
| S5 | 1:54–2:22 | Press "skip to morning" (night animation 3 s), then "Alexa, good morning." (`good morning`) | `brief` card: lost 0.3 kg vs planned 0.4 kg, calories 2,360 → 2,250 (−110). Today legs: back squat 102.5 kg × 5. Yesterday 1,271 kcal. | `eventbridge-lambda` (on the night animation), `aurora` |
| S6 | 2:22–2:34 | "How's my bench going?" (`how's my bench going`) | `progress` card: bench e1RM over 6 weeks, 91.8 → 101.3 kg (+9.5). First scene to cut (P3). | none |
| S7 | 2:34–2:59 | Voice-over (draft in [captions.srt](captions.srt), cues 23–26) | S7 clips below, then the architecture slide, then the tagline. | `agentcore`, `mcp` |

The first 20 seconds must show the product working: keep the title card to 3 s at most, or put the tagline over S1's opening.

## S7 clips (2:34–2:59, about 25 s in total)

| # | Clip | Length | Source | Backup if the clip fails |
|---|---|---|---|---|
| 1 | "Under the hood" trace: the four S4 tool calls with their ms | 4 s | Reuse the S4 take, crop/zoom to the right panel | `simulator/frontend/screens/S4.png` |
| 2 | AgentCore runtime console, runtime `dayform_server`, Status Ready | 5 s | **[USER]** AWS console, us-east-1, Bedrock AgentCore → Runtime → `dayform_server` | `assets/s7-agentcore-runtime.txt` (do not use `smoke/agentcore-mcp/screens/agentcore-runtime-console.png`: it shows the smoke runtime `dayform_smoke_mcp`, the account ID and unrelated tabs) |
| 3 | MCP Inspector: connect over Streamable HTTP, protocol 2025-11-25, Tools list = 18 | 5 s | **[USER]** `npx @modelcontextprotocol/inspector`, URL `http://localhost:8000/mcp` (or 8001), List Tools | `npm run demo:scene -- S7` output (tools/list) |
| 4 | CloudWatch log lines: `tool=... ms=... status=ok` | 3 s | **[USER]** CloudWatch → `/aws/bedrock-agentcore/runtimes/dayform_server-itlffCFT4p-DEFAULT` | `assets/s7-cloudwatch-tool-call.txt` |
| 5 | Architecture slide | 5 s | `assets/architecture-slide-A.png` or `-B.png` | n/a |
| 6 | Tagline close | 3 s | `assets/title-card-A.png` or `-B.png` | n/a |

Optional if time allows: `assets/s7-aurora-cluster.txt` and `assets/s7-overnight-lambda.txt` as evidence for Aurora and the overnight Lambda. Hide the account ID in any console clip (crop or blur).

## OBS setup and recording steps

From the ticket and DEMO-SCRIPT.md §5.

1. Start the stack: server (`OVERNIGHT_MODE=cached npm run dev`, or AgentCore via `.env.aws`), `npm run sim:backend` (Sonic), `npm run sim:frontend`.
2. Open http://localhost:5173 in the recording browser **before** warm-up; don't reload it afterwards.
3. `npm run demo:warm` → READY in about 10 s (AgentCore: `npm run demo:agentcore -w @dayform/infra -- warm`).
4. Sign in to amazon.com in the recording browser; allow pop-ups for localhost:5173.
5. Notifications off. Browser zoom 100%, bookmarks hidden, browser full screen.
6. OBS: canvas and output 1920×1080, 30 or 60 fps. Display or window capture of the browser.
7. OBS audio: system audio and mic on **separate tracks** (Output → Recording → Audio tracks 1 and 2; Advanced Audio Properties → assign Desktop Audio to track 1, Mic to track 2).
8. Levels test: say one test line, peaks around −12 to −6 dB, never red. The test line leaves state, so run `npm run demo:warm` again.
9. Keep the typed safe lines open in a hidden window. If Alexa mishears or nothing happens in 5 s: press `/`, type the line, Enter.
10. `npm run demo:warm` before every take. One scene per take.
11. Record the S7 clips (Inspector, AgentCore console, CloudWatch) as separate takes.
