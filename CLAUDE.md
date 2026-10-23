# CLAUDE.md

Project-specific context and instructions for Dayform, merged with a set of general behavioral guidelines (sections 1–5 below, adapted from [andrej-karpathy-skills/CLAUDE.md](https://github.com/multica-ai/andrej-karpathy-skills/blob/main/CLAUDE.md) and from the author's Hirz conventions) aimed at reducing common LLM coding mistakes: unstated assumptions, speculative complexity, unrelated edits, vague success criteria, and unverified claims of completion.

**Tradeoff:** these guidelines bias toward caution over speed. For trivial tasks, use judgment. When in doubt, ask.

---

## Project

Dayform — an Alexa+ add-on (a self-hosted MCP server) that lets you talk to Alexa to log meals and workouts, run a live gym session, plan meal prep, and fill your Amazon cart. A web simulator plays the part of an Echo Show (Nova Sonic as Alexa's voice and brain); an Amazon Nova reasoning model on Bedrock makes the judgment calls (D21: Nova only, no Claude), and code does the arithmetic, storage and checks. Built for the Build, Ship, Shape: Amazon Developer Hackathon (submission deadline **2026-10-23 12:00 PT**, 2026-10-24 00:00 PKT): the Alexa+ track and the AWS Builder mini challenge, with the Open Source mini challenge (T-53) cut first. **The demo comes first:** put effort where the judges see it, simplify everything else.

## Where things live

Read order for every agent: `PLAN.md`, then `DESIGN.md`, then your ticket file.

- `PLAN.md` — how we work (orchestrator, ticket agents, Demo Monitor), dispatch prompt, ticket rules, status values, hand-off format, approval rule, human steps, demo-importance levels, waves and gates, ticket index, cut order. Sections 1–2 are required reading for ticket agents.
- `DESIGN.md` — the single source of truth: agreed decisions D1–D20 (§1), architecture (§2), Alexa+ add-on rules (§3), the 18 MCP tools (§4), cards (§5), data model (§6), LLM vs code (§7), demo controls (§8), env vars (§9), services and fallbacks (§10), repo layout (§11), demo-first simplifications (§12). Load the section relevant to the work, not the whole file.
- `tickets/T-XX-*.md` — one file per ticket: what it owns, acceptance criteria, test scenario, fallbacks, Status line, Result section.
- `DEMO-SCRIPT.md` — scenes S1–S7, lines, readiness matrix, recording checklist. Owned by the Demo Monitor.
- `DEMO-MONITOR.md` — brief for the standing Demo Monitor agent.
- `SMOKE-RESULTS.md` — Wave 0 smoke results and the Gate G0 decision.
- `FRICTION.md` — raw friction entries for the Devpost friction log. Append only (see Conventions).

## Where records go

Each kind of record has one home. Write it there once and link to it; never paste the same facts into a second file.

| Record | Home | Never |
|---|---|---|
| What a ticket must build, its acceptance criteria and test scenario | The ticket file | Don't rewrite the spec when it is done |
| A ticket's progress | The ticket's `Status` line (TODO → IN PROGRESS → REVIEW → DONE, or BLOCKED with reason, or CUT) | Not in `PLAN.md` |
| A ticket's outcome, deviations, fallbacks used | The ticket's Result section, plus the hand-off report (`PLAN.md` §1.4, 15 lines max) to the orchestrator | No paragraphs in the hand-off |
| Wave 0 smoke numbers and fallback switches | `SMOKE-RESULTS.md`, the ticket's own section | Not in the ticket alone |
| Later-wave fallback switches | The ticket's Result section | |
| A decision, a tool, a schema, a chosen service | `DESIGN.md` (orchestrator only); exact schemas in `packages/contracts/` | Ticket agents don't edit `DESIGN.md` or contracts; they propose the change in their hand-off |
| Third-party friction | `FRICTION.md`, using its entry template | Nothing invented or padded |
| Scenes, lines, readiness | `DEMO-SCRIPT.md` (Demo Monitor) | |
| Where the project stands right now | "Current phase" below | Under about 80 words |

## Conventions

- **TypeScript on Node** throughout (`npm` workspaces, `tsx`, Vitest, zod), per `DESIGN.md` §11 layout: `packages/contracts`, `packages/food-search`, `server`, `simulator/{backend,frontend}`, `cards`, `jobs/overnight`, `db`, `data`, `infra` (CDK in TypeScript), `mock`, `demo`, `video`. React for the simulator frontend and cards. Don't introduce another language or framework without asking.
- **Stay in your paths.** A ticket agent writes only in the paths under its ticket's **Owns**. Changes elsewhere go through the orchestrator.
- **Contracts are the shared language.** Tool inputs, tool outputs, card data and simulator events live in `packages/contracts/`. Don't invent a new shape for a tool or an event; propose a contract change in the hand-off.
- **Opus judges, code checks (`DESIGN.md` §7, D11).** Every LLM output passes a zod schema and a code check before it is stored. Meal plans use catalog ingredients only and must land within ±5% of targets. Every number in the morning brief is checked against the database. Nutrient maths, PR detection, estimated 1RM, progression and the ±250 kcal weekly cap are code, never a model.
- **Under 500 ms per tool call.** The confident path makes no LLM call. Slow LLM work goes to the overnight job or the background with `{status: "preparing"}`. Only `log_meal` with an unknown food, `plan_meal_prep` with new constraints, and server mode may go over.
- **Real Alexa+ add-on rules, verbatim (`DESIGN.md` §3).** MCP 2025-11-25 over Streamable HTTP; one tool per intent, no overlaps; declare only parameters you honor; output matches the declared schema; always a result or an error; return facts, not scripts; every tool returns `structuredContent`; cards link via `_meta.ui.resourceUri` at 768×480. When a doc is unclear, fetch it and cite it; don't guess an API shape.
- **Alexa never places an order (D9).** It builds and confirms the cart (elicitation, or `confirm_checkout` when `CHECKOUT_CONFIRM=tool`); the user checks out on Amazon via the Add-to-Cart link.
- **Estimated is labeled.** A food the table can't match is estimated by Opus and marked `estimated`. A vague portion logs a standard portion and returns the assumption so Alexa can say it (D5).
- **Demo time comes from `clock.now()`.** With `DEMO_MODE=true`, no code reads the system clock directly. Every take starts from the seed state (`npm run db:reset`). Admin routes exist only in `DEMO_MODE` and require `ADMIN_TOKEN`.
- **Use fallbacks in order.** If a service fails, use the ticket's fallbacks in the order given (`DESIGN.md` §10) and record the switch. Don't skip ahead or invent a new one without asking.
- **Approval rule (`PLAN.md` §1.5).** Any change outside this folder needs the user's explicit "yes" for **that** change: AWS resources, machine package installs, GitHub repos or pushes, accepting terms, signing in. One approval covers one change. Ticket agents ask the orchestrator; the orchestrator asks the user.
- **Secrets** only in `.env.local` (git-ignored). Names, never values, in `.env.example`. Never in seeds, fixtures, tests, cards, or docs.
- **Effort follows demo importance (`PLAN.md` §2).** HERO flawless, VISIBLE correct and clean, ENABLER works, REQUIRED meets the rule exactly, CUT-FIRST minimum. When behind, cut in the order in `PLAN.md` §5. Keep scenes S1, S3, S4 and S5 at all costs.
- **Numbers are derived, never typed.** Macros, targets, PRs and cart totals in the demo, README, video and Devpost text come from the seed data or a real run.
- Relative dates in docs are absolute (`2026-10-23`), never "tomorrow".
- **Friction log, from day one.** Devpost gives up to a 10 percent bonus for it. Append an entry to `FRICTION.md` at the moment a tool, SDK, doc, CLI or AWS service blocks or surprises you, cost more than about 15 minutes, or forced a workaround. Log it then, not at the end of the session. Entries are facts with the exact step, doc URL and exact error text; never invented, never padded. Severity: `blocker`, `major`, `minor`.

## Commands

Verified so far (2026-10-22): `npm install && npm test`, `npm run typecheck`, `npm run mock`, `docker compose up -d postgres mock`, the Wave 0 smoke runners under `smoke/*`. The rest are targets named in the tickets.

- `npm install && npm test` — install workspaces and run all tests; `npm test -w <workspace> [-- <filter>]` for one workspace.
- `npx tsx smoke/<service>/run.ts [--target local|aurora|agentcore]` — Wave 0 smoke tests (T-01–T-07); `npm run smoke:sonic`, `npm run smoke:apps`.
- `npm run mock` — mock MCP server on 8100 with fixtures and hybrid mode (T-10).
- `npm run dev` — real MCP server on `http://localhost:8001/mcp` locally (8000 is taken on this laptop; the container still listens on 8000); `docker-compose.yml` for local Postgres (`dayform-pg`, port 5433).
- `npm run db:reset` — reset to the seed state in seconds; `npm run db:report` — summarize the seed.
- `npm run catalog:link` — check grocery ASINs and the Add-to-Cart link (T-13).
- `npm run sim:backend`, `npm run sim:frontend` — the simulator; `npm run sim:probe -- "<utterance>"` sends one typed request through it.
- `npm run overnight:cache` — store overnight output for `OVERNIGHT_MODE=cached`.
- `npm run demo`, `npm run demo:warm` — scene runner and warm-up (T-41).
- `npm run deploy` / `npm run destroy` — CDK deploy and teardown (T-40, **approval needed**); `npm run aws:status`.
- `npx @modelcontextprotocol/inspector` — inspect the MCP server by hand.
- Runtime switches: `UNDERSTANDING=alexa|server`, `VOICE_ENGINE=sonic|pipeline|text`, `DB_DRIVER=pg|data-api`, `OVERNIGHT_MODE=live|cached`, `CHECKOUT_CONFIRM=elicitation|tool`, `CARDS_MODE=mcp-apps|native`, `DEMO_MODE`. Full list: `DESIGN.md` §9.

## Current phase

All build tickets DONE on 2026-10-22 (Wave 0–4 incl. T-40 deploy to AgentCore; all 7 scenes pass on local and AgentCore in text mode). T-41 hardening in progress (script v1 drafted, awaiting the user). Open: T-50 push (needs the user's repo approval), T-51 video (user records), T-52 submit (links pending). T-53 CUT. Agents work in the main tree (no worktrees). Reasoning model is Nova only (D21).

---

## 1. Ask before deciding

**Don't assume. Don't hide confusion. Surface tradeoffs. Ask.**

The author's standing instruction: **when a question comes up, ask rather than decide, assume, or guess.** That includes product choices, naming, scope, contract shapes, which fallback to take, what to cut, and anything about money (AWS spend), accounts, or the hackathon submission.

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them; don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

Most ambiguity is resolved in writing in `DESIGN.md` and the ticket files. Check there first; if it's genuinely not covered, that's exactly what to surface. Batch questions so the author answers once. With the deadline this close, ask early rather than late.

## 2. Simplicity first

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond the ticket. Don't pull forward a later wave's work, and don't build what `DESIGN.md` §12 deliberately left out (multi-user, pantry step, program builder, vector search).
- No abstractions for single-use code. The `CartProvider` interface is the one sanctioned seam (D15).
- No "flexibility" or "configurability" that wasn't requested; the env switches in `DESIGN.md` §9 are the full list.
- No error handling for impossible scenarios; do implement the fallbacks the ticket names.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical changes

**Touch only what you must. Clean up only your own mess.**

- Don't "improve" adjacent code, comments, or formatting. Don't refactor what isn't broken. Match existing style.
- If you notice unrelated dead code, mention it; don't delete it.
- Remove imports/variables/functions that *your* change made unused. Leave pre-existing dead code unless asked.

The test: every changed line traces to the current ticket and sits inside its **Owns** paths.

## 4. Goal-driven execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add desi food search" → "Run the ticket's food-word list and assert at least 95% match accuracy, then make it pass."
- "Add PR detection" → "Write a test where a set beats the best estimated 1RM and assert the PR flag, then make it pass."
- "Wire the meal-prep planner" → "A generated plan uses catalog items only and every day is within ±5% of targets."

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
```
Each ticket already carries acceptance criteria and a test scenario; use them as the source of success criteria instead of inventing new ones.

## 5. Run it and show it

**Nothing is done until it has been run and the output is shown.**

The author's second standing instruction: **after building a feature, run and verify it, and report what you saw.** Concretely:
- Run the relevant tests and paste the summary line (passed/failed).
- Run the feature the way a user would: the tool through MCP Inspector or `sim:probe`, the scene through the simulator, the card in the browser via a screenshot. Paste the output or describe exactly what rendered.
- Check the latency against the 500 ms budget for any tool you touched.
- If something could not be verified (no AWS credentials, no Bedrock access, a service down), say so first and plainly, and set the ticket to BLOCKED, not DONE.
- Never write "should work", "is now complete", or mark a ticket DONE on the strength of code alone. DONE means every acceptance criterion passes and the test scenario runs green.
- Report failures faithfully with the output. A failing test reported honestly is progress; a green claim that isn't is a regression.
- If the task touched a third-party tool, check `FRICTION.md`: was an entry earned? Add it before reporting done.

---

**These guidelines are working if:** clarifying questions come before implementation rather than after mistakes; diffs are small and stay inside each ticket's paths; every DONE ticket has a pasted verification; the Demo Monitor reports no regressions; and the cut order in `PLAN.md` §5 is followed when behind.
