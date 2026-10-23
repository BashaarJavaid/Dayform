# T-52 · Devpost submission materials

| Field | Value |
|---|---|
| Wave | 5: Repo, video, submission |
| Demo importance | REQUIRED (feedback is mandatory; the friction log can add up to 10%) |
| Size | S |
| Depends on | T-50, T-51, [FRICTION.md](../FRICTION.md) |
| Owns | `SUBMISSION.md` |
| Approval needed | Human step: the user pastes the fields and submits on Devpost |
| Status | REVIEW (waiting for the user to review, fill <REPO_URL>/<VIDEO_URL>, and submit) |

## Goal
Draft every Devpost field, ready to paste.

## Why it matters for the demo
- Judges read the description beside the video.
- Product feedback is a required field.
- The friction log can add up to a 10% bonus to the final score.

## Read first
- [FRICTION.md](../FRICTION.md), [DESIGN.md](../DESIGN.md), the README (T-50)
- Devpost tips from the organizers:
  - Name the project like a person would, not like an algorithm.
  - Make the track's technology impossible to miss: in the description, in "Built with", and in the video.

## Tasks
1. **Name and tagline.** A memorable name that means something about what it does.
2. **Description:**
   - what it does, and how it works
   - the architecture
   - what's real and what's sample data
   - how it meets the Alexa+ add-on rules
3. **Tracks:** Alexa+. Mini challenges: AWS Builder, plus Open Source if T-53 is done.
4. **Product feedback**, for every tool, API and SDK. For each, answer:
   - what we used it for
   - what worked well
   - what needs work
   - onboarding (zero to hello world)
   - would we build with it again (yes or no, and why)

   Cover: Amazon Bedrock (Claude Opus 5.5), Nova Sonic, AgentCore Runtime, Aurora Serverless v2 with the Data API, Lambda, EventBridge Scheduler, AWS CDK, the MCP TypeScript SDK, the MCP Apps SDK, MCP Inspector.

   Describe the AWS usage here too; AWS Builder requires it.
5. **Friction log.** Build it from [FRICTION.md](../FRICTION.md). Each entry has:
   - the task
   - the steps
   - expected vs. actual
   - severity
   - the workaround
   - an actionable suggestion

   Aim for at least 8 strong, specific entries.
6. **Feature requests,** each rated critical, important or nice-to-have.
7. **Links:** the repo and the video. Add "Built with" tags.
8. **Human step:** the user reviews `SUBMISSION.md`, pastes each field into Devpost, adds teammates if any, and submits before the deadline.

## Acceptance criteria
- [ ] Every Devpost field is drafted in `SUBMISSION.md`.
- [ ] Product feedback covers every tool listed in task 4, with all five answers each.
- [ ] At least 8 friction entries, each with every field.
- [ ] The user has reviewed it.
- [ ] The user submits before 2026-10-23 12:00 PT.

## Test scenario
1. Check `SUBMISSION.md` against the Devpost form, field by field. Nothing is missing.
2. Open the repo and video links signed out. Both work.

## Result
2026-10-22. `SUBMISSION.md` drafted: one heading per Devpost field (name, 163-character elevator pitch, About in the Devpost story sections, Built with, Try-it-out links, video link, tracks and mini challenges with an AWS-usage table, product feedback, friction log, feature requests), plus a pre-paste checklist.

- **Product feedback:** 11 entries, five answers each: Nova 2 Lite on Bedrock, Nova 2.5 Sonic, AgentCore Runtime, Aurora Serverless v2 + Data API, Lambda, EventBridge Scheduler, CDK + CloudFormation, MCP TypeScript SDK, MCP Apps SDK, MCP Inspector, Amazon Add-to-Cart link.
- **Friction log:** all 14 FRICTION.md entries (F-001 to F-015; F-012 does not exist), every field filled, strongest first.
- **Feature requests:** 15, rated 3 critical, 7 important, 5 nice-to-have.
- **Numbers:** taken from SMOKE-RESULTS, ticket Results, db/seed/README and DEMO-SCRIPT; no new measurements.
- **Placeholders:** `<REPO_URL>`, `<VIDEO_URL>`, and `<OSS_REPO_URL>`/`<GITHUB_USERNAME>` (Open Source section, optional, T-53). Sentences marked `[T-40]` claim the full AgentCore + Lambda deploy; reword them if T-40 is not DONE.
- **Deviations:** Bedrock feedback covers Nova 2 Lite, not Claude Opus (D21). The "AWS CDK" entry covers CDK bootstrap plus CloudFormation, since every stack is a plain template. Amazon Transcribe is listed under AWS usage from T-30's in-progress code.
- **Not done (human):** acceptance criteria 4 and 5 (user review and submission) and test-scenario step 2 (links open signed out).
