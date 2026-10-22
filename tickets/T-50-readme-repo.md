# T-50 · README and public repo

| Field | Value |
|---|---|
| Wave | 5: Repo, video, submission |
| Demo importance | REQUIRED (Stage 1 pass/fail check) |
| Size | S |
| Depends on | T-40 (or a local-only setup), T-30, T-31 |
| Owns | `README.md`, `LICENSE`, `docs/` |
| Approval needed | Yes: creating the GitHub repo, pushing, installing a secrets scanner |
| Status | TODO |

## Goal
Publish a public GitHub repo that judges can read, run and verify.

## Why it matters for the demo
- Stage 1 of judging is pass/fail. It checks that the repo actually runs the track's technology, an MCP server, in code.
- Judges may also build and run the project themselves.

## Read first
- [DESIGN.md](../DESIGN.md): all of it, for the README content.
- Hackathon repo rules:
  - Hosted on GitHub.
  - Either public with an open-source license visible in the About section, or private and shared with the Amazon reviewers and `testing@devpost.com`.
  - The repo must import and call the track's technology in code. A mention in the README isn't enough.

## Tasks
1. **README.md:**
   - A one-line pitch, and the demo video link (from T-51).
   - What it does, written as user stories.
   - The architecture diagram (Mermaid, plus an exported PNG in `docs/`).
   - **Alexa+ compliance:**
     - MCP 2025-11-25 over Streamable HTTP, with stateful sessions
     - elicitation for checkout
     - MCP Apps cards at 768×480
     - one tool per intent
   - The tool table, generated from the contracts.
   - **Run locally:**
     - `docker compose up`
     - the required env vars
     - AWS Bedrock access (needed for Opus and Sonic)
     - `VOICE_ENGINE=text` for a voice-free run
   - **Deploy to AWS:** `npm run deploy`, and `npm run destroy`.
   - **Demo controls:** the demo panel and the admin routes.
   - **Sample data:** disclose that the demo user and their 6-week history are sample data.
   - **Understanding switch:** `UNDERSTANDING=server`, with the note from T-28.
   - **Built with:** every AWS service, for AWS Builder.
2. **LICENSE:** MIT. After pushing, check that GitHub shows the license in the repo's About section.
3. **Planning files:** ask the user whether `PLAN.md`, `DESIGN.md` and `tickets/` stay in the public repo. They show the process, but they're internal.
4. **Secrets scan** before any push. Run `gitleaks detect` (**approval needed** to install it), or a grep for key patterns across the whole history.
5. **Approval needed:** create the public GitHub repo, and push.
6. **Fresh-clone test:**
   1. Clone into a temporary folder.
   2. Follow only the README.
   3. Run text mode against the local server.
   4. Fix any gap in the README.

## Acceptance criteria
- [ ] The fresh-clone test works, following only the README.
- [ ] GitHub shows the MIT license in the About section.
- [ ] The secrets scan is clean across the full history.
- [ ] The repo is public.
- [ ] The README points to the MCP server entry point (`server/src/index.ts`), for the Stage 1 check.

## Test scenario
1. Clone into a temporary folder: `git clone <repo> /tmp/aff-test && cd /tmp/aff-test`.
2. Follow the README's local run steps with `VOICE_ENGINE=text`.
3. Type the S1 line. Expect the `meal-logged` card.

## Result
_The agent fills this in._
