# T-50 · README and public repo

| Field | Value |
|---|---|
| Wave | 5: Repo, video, submission |
| Demo importance | REQUIRED (Stage 1 pass/fail check) |
| Size | S |
| Depends on | T-40 (or a local-only setup), T-30, T-31 |
| Owns | `README.md`, `LICENSE`, `docs/` |
| Approval needed | Yes: creating the GitHub repo, pushing, installing a secrets scanner |
| Status | DONE (video link added after T-51) |

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
**REVIEW, 2026-10-22.** README, LICENSE and docs/ written; no commit, repo or push (orchestrator holds those until the user approves).

Built:
- `README.md`: pitch, video placeholder (`_VIDEO_LINK_`), user stories, Mermaid architecture + `docs/architecture.png`, Alexa+ compliance, generated tool table (18 + `confirm_checkout`), run locally, deploy, demo controls, sample-data disclosure, understanding switch (T-28 note), built with.
- `LICENSE`: MIT, "Copyright (c) 2026 Bashaar Javaid" (name inferred from the git user `BashaarJavaid`; confirm).
- `docs/gen-tools.ts` (`npx tsx docs/gen-tools.ts` prints the table; paste between the `tools:start/end` markers), `docs/architecture.mmd`, `docs/architecture.png` (mermaid-cli 11.4.2 via npx, 1600 px).

Fresh-clone test (`git clone` of the local repo to /tmp/aff-test, README/LICENSE/docs copied in since they are uncommitted; separate database `dayform_t50` in the same `dayform-pg` container; server on 8011 because the main tree's server holds 8001):
- `npm install`, `npm run db:migrate` (166 ms), `npm run db:reset` (174 ms, clock 2026-10-23T13:00+05:00), `npm run data:load-foods` (1659 foods), `PORT=8011 npm run dev`: 18 tools, demo_mode=true.
- First `npm run demo`: S3 FAIL "10 s demo rest timer, got 150 s (run demo:warm)". README gap fixed: step 5 is now `npm run demo:warm && npm run demo`. Rerun: `S1 PASS | S2 PASS | S3 PASS | S4 PASS | S5 PASS | S6 PASS | S7 PASS`, slowest turn 71 ms (S4), 18 tools.
- Test scenario, text mode: simulator backend (main tree; `simulator/backend/src` is untracked so absent from the clone) with `VOICE_ENGINE=text`, `MCP_URL` = clone server; `sim:probe "I had two rotis, chicken karahi and a mango lassi for lunch"` → `log_meal` 145 ms, `card ui://cards/meal-logged`, Alexa: "...904 kcal and 48.7 g protein...". Needs Bedrock (Nova 2 Lite).
- Cleaned up: processes stopped, `dayform_t50` dropped, /tmp/aff-test removed.

Secrets scan (grep, all 41 commits, `git grep ... $(git rev-list --all)`): no AKIA/ASIA keys, no secret access key or session token, no private keys, no `.env*` file ever committed except `.env.example`, no literal token/password assignments; the `.env.local` values of ADMIN_TOKEN, DATABASE_URL and AURORA_SECRET_ARN appear in 0 blobs. Only DB URL literal: the `postgres:postgres@127.0.0.1:5433` default in code. Note: the AWS account ID appears in SMOKE-RESULTS.md, T-00 and T-03 (not a secret; relevant to the planning-files question).

Deviations:
- The entry point is `server/src/main.ts` (no `index.ts` exists); the README points there plus `app.ts` and `registry.ts`.
- Deploy is CloudFormation templates + `infra/deploy.sh` (T-40's actual method), not CDK, and reuses the existing Aurora cluster; the README says so. Root has no `deploy`, `destroy`, `aws:status`, `sim:backend`, `sim:probe` scripts, so the README uses the `-w @dayform/infra` / `-w @dayform/simulator-backend` forms. Proposal: add root aliases in package.json, then simplify the README.
- `docker compose up` (task) is `docker compose up -d postgres`: the compose `server` service needs `.env.local` and AWS mounts; `npm run dev` is the simpler path.

Open for the orchestrator/user: video link (T-51); whether PLAN.md, DESIGN.md, tickets/ stay public (task 3); create the repo, push, check the license in About (tasks 2, 5); simulator frontend section once T-31 lands.

**Orchestrator close-out (2026-10-23):** pushed to https://github.com/BashaarJavaid/Dayform (public; GitHub detects MIT); planning files kept per the user; secrets scan clean (T-50 agent); fresh-clone test passed. DONE.
