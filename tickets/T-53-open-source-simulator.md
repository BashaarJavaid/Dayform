# T-53 · Open-source Alexa+ MCP simulator

| Field | Value |
|---|---|
| Wave | 5: Repo, video, submission |
| Demo importance | CUT-FIRST |
| Size | S |
| Depends on | T-30, T-31 |
| Owns | A separate repo folder, outside `dayform/` |
| Approval needed | Yes: creating a folder outside this repo, creating the GitHub repo, pushing |
| Status | CUT (cut order #1, orchestrator 2026-10-22: time goes to the video and submission) |

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
- [ ] The repo is public, with an MIT license detected by GitHub.
- [ ] It works with any MCP server (tested with two servers).
- [ ] The Devpost Open Source fields are drafted.

## Test scenario
1. Clone the new repo. Set `MCP_URL` to the T-03 `ping` server. Start it.
2. Type "ping". Expect the tool call in the "Under the hood" panel, and a spoken or typed reply.

## Result
_The agent fills this in._
