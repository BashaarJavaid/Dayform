# T-53 · Open-source Alexa+ MCP simulator

| Field | Value |
|---|---|
| Wave | 5: Repo, video, submission |
| Demo importance | CUT-FIRST |
| Size | S |
| Depends on | T-30, T-31 |
| Owns | A separate repo folder, outside `dayform/` |
| Approval needed | Yes: creating a folder outside this repo, creating the GitHub repo, pushing |
| Status | DONE (un-cut by the orchestrator 2026-10-23) |

## Goal
Publish the Alexa+ simulator as a standalone, MIT-licensed repo that any MCP developer can point at their own server. Enter it in the Open Source mini challenge.

## Why it matters for the demo
It isn't in the video. It's one more prize category, using work that already exists. Other Alexa+ builders can't reach the real Alexa+ tools either, so they can use it.

## Read first
- `simulator/` (T-30, T-31)
- The Open Source requirements:
  - a new open-source project (with a license) or a contribution, made during the hackathon window
  - Devpost needs the contribution URL, the repo URL, the GitHub username and a description

## Tasks
1. **Approval needed:** create the new repo folder. Copy the simulator backend and frontend into it.
2. **Make it generic:**
   - any `MCP_URL`
   - no fitness-specific text
   - cards from any server's `ui://` resources
   - a plain idle screen
3. **README:** screenshots, a one-command setup, and the supported features (Streamable HTTP, elicitation, progress, MCP Apps cards, Nova Sonic voice).
4. **Add an MIT license.**
5. **Test** against the T-03 `ping` server and against the fitness server.
6. **Approval needed:** create the public GitHub repo, and push.
7. **Draft the Devpost fields** in `SUBMISSION.md` (with T-52): the contribution URL, the repo URL, the GitHub username, and what it does, how it works and why it matters.

## Acceptance criteria
- [x] The repo is public, with an MIT license detected by GitHub.
- [x] It works with any MCP server (tested with two servers).
- [x] The Devpost Open Source fields are drafted.

## Test scenario
1. Clone the new repo. Set `MCP_URL` to the T-03 `ping` server. Start it.
2. Type "ping". Expect the tool call in the "Under the hood" panel, and a spoken or typed reply.

## Result
Repo: https://github.com/BashaarJavaid/alexa-plus-mcp-simulator (public; local copy `/Users/bashaarjavaid/Projects/alexa-plus-mcp-simulator`, outside this repo, so no `oss/` or `.gitignore` change here). 2026-10-23.

**Built.** A copy (not a symlink) of `simulator/backend`, `simulator/frontend`, `cards/host` and the `WebSocket` event schema, made generic: one package, `npm install` then `npm run dev` (backend + Vite via `concurrently`), settings from `.env` (`MCP_URL`, `MCP_AUTH=none|sigv4`, `VOICE_ENGINE`, model IDs, ports). Removed: admin proxy, demo panel, night transition, native `CardByUri` cards and `CARDS_MODE`, cart auto-open, card dwell, macro rings, Dayform tool icons and prompt. Added: plain idle screen (clock, date, "Ask me anything"), settings panel (gear or Ctrl+Shift+S: target, auth, server name/version, tools, engine, last-turn timings), server name in the panel header via `/health`, generic Sonic system prompt, `examples/ping-server.ts` (the T-03 server with `PORT`), MIT `LICENSE` (Malik Bashaar Javaid), README with 3 screenshots (`docs/idle.png`, `docs/card.png`, `docs/confirm.png`). `npx tsc` clean.

**Verification** (VOICE_ENGINE=text, AWS_PROFILE from `.env.local`, own ports so the Dayform simulator on 8300/5173 kept running):
- Ping server (`PORT=18003 npm run example`), `npm run probe -- "ping"`: `tool_call_finished ping latency_ms 26 ok server_time=2026-10-23T06:24:49.190Z`, reply "The server time is 2026-10-23 at 06:24:49 UTC.", spoken 5.9 s. `confirm_demo`: `elicitation_request "Proceed?"`, click accept → `action=accept, confirmed=true`; typed "yes" (`--say-yes`) → same.
- Headless Chrome (CDP): connected, panel header `ping-example 0.0.1`, rows `ping 11 ms`, `confirm_demo 1318 ms`, Yes/No overlay shown and clicked, no console errors.
- Dayform server `http://localhost:8001/mcp`: S1 line → `log_meal 914 ms | entry, day, assumptions`, card `ui://cards/meal-logged` (904 kcal, 3 items, 970 kcal / 96 g left), header `dayform 0.1.0`, no console errors. Note: this logged a lunch on the 8001 server's database; run `npm run db:reset` before the next take.
- Sonic engine (VOICE_ENGINE=sonic) with the ping server: `ping 21 ms`, spoken reply, first audio 1120 ms.
- Ticket test scenario from a fresh `git clone` of the public repo: `npm install`, `npx tsc` OK, `.env` with `MCP_URL`, `npm run dev`, probe "ping" → tool call and reply.
- `gh repo view --json licenseInfo` → `{"key":"mit","name":"MIT License"}`, visibility PUBLIC.

**Devpost.** `SUBMISSION.md` → "Open Source contribution" (URL, username, what/how/why); the checklist line and the Tracks bullet updated.

**Deviations.** None from the ticket. Card buttons that call tools stay hidden (no `onCallTool`), as in the Dayform simulator.
