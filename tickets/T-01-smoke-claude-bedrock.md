# T-01 · Smoke test: the Nova reasoning model on Bedrock (D21)

| Field | Value |
|---|---|
| Wave | 0: Setup and smoke tests |
| Demo importance | ENABLER |
| Size | S |
| Depends on | T-00 |
| Owns | `smoke/bedrock-claude/` |
| Approval needed | No. The model calls cost a few cents. |
| Status | DONE |

## Goal
Prove the server can call the Nova reasoning model (DESIGN.md D21: `REASONING_MODEL_ID` from T-00, Nova 2 Pro or Nova 2 Lite) on Bedrock, use tools, and get valid structured JSON back. Measure the latency. Wherever this ticket says Opus, read the Nova model.

## Why it matters for the demo
Opus does every judgment call: meal plans (S4), the morning brief (S5), the reasons targets change (S5), and estimates for unknown foods. If Opus fails, S4 and S5 fail.

## Read first
- [DESIGN.md §7 LLM and code](../DESIGN.md#7-llm-and-code)
- The model ID recorded by T-00 in [SMOKE-RESULTS.md](../SMOKE-RESULTS.md)

## Tasks
1. Write `smoke/bedrock-claude/run.ts` (TypeScript, run with `npx tsx`). Use `@aws-sdk/client-bedrock-runtime` with the **Converse** API.
2. **Test A, plain text:** ask for one sentence. Record the latency.
3. **Test B, tool use:**
   - Give the model one tool, `record_meal`, whose JSON schema is `items: [{food: string, quantity?: number, unit?: string}]`.
   - Send: "I had two rotis and a bowl of daal".
   - Expect a `toolUse` block. Validate its input with zod.
4. **Test C, forced tool:** set `toolChoice` to the specific tool.
   - If Bedrock rejects that for this model, use `auto` with one tool, validate, and retry once on failure.
   - Record which mode works. The Bedrock model card says Sonnet 5.5 accepts only `auto` or `none`.
5. **Test D, long output:** use **ConverseStream** to generate a 4-day meal-plan JSON of about 3,000 tokens, with a fixed schema. Record the time to first token and the total time.
6. Run tests A and B five times each. Record the p50 and maximum latency.
7. Write the results to [SMOKE-RESULTS.md](../SMOKE-RESULTS.md) §T-01, and set `REASONING_MODEL_ID` in `.env.local`.

## Acceptance criteria
- [ ] Tests A, B, C and D pass with Opus 5.5, or with a fallback model (recorded).
- [ ] Test B output validates 5 times out of 5.
- [ ] p50 and maximum latency are recorded for A and B. Time to first token and total time are recorded for D.
- [ ] The working tool-choice mode is recorded. T-20's LLM client copies it.

## Test scenario
1. Run `npx tsx smoke/bedrock-claude/run.ts`.
2. Expect a table with columns test · result · p50 ms · max ms · notes, and every result PASS.

## Fallbacks
1. **Amazon Nova 2 Lite**, if Nova 2 Pro fails or is unavailable.
2. **Another Nova model** (Nova Pro, Nova Premier), whichever is available.
3. Never Claude (D21).

## Result
2026-10-22. `npx tsx smoke/bedrock-claude/run.ts` printed `PASS primary=nova-2-lite-v1:0 fallback=nova-pro-v1:0` and exited 0:

| test | model | result | p50 ms | max ms | notes |
|---|---|---|---|---|---|
| A text x5 | nova-2-lite-v1:0 | PASS | 638 | 814 | 5/5 runs 742/590/638/627/814 ms |
| B tool use x5 | nova-2-lite-v1:0 | PASS | 704 | 725 | toolChoice auto; 5/5 zod-valid; [{"food":"roti","quantity":2},{"food":"daal","quantity":1,"unit":"bowl"}] |
| C toolChoice tool | nova-2-lite-v1:0 | PASS | 595 | 595 | {tool:{name}} accepted, zod-valid, stopReason=tool_use |
| C toolChoice any | nova-2-lite-v1:0 | PASS | 648 | 648 | {any:{}} accepted, zod-valid |
| C toolChoice auto | nova-2-lite-v1:0 | PASS | 674 | 674 | {auto:{}} accepted, zod-valid |
| C JSON, no tools | nova-2-lite-v1:0 | PASS | 634 | 634 | prompt-only JSON parsed + zod-valid (had code fences, stripped) |
| D stream plan | nova-2-lite-v1:0 | PASS | 10783 (TTFT) | 10786 (total) | forced tool, streamed; 2416 output tokens, maxTokens=10000, stopReason=tool_use; 16 meals zod-valid |

- Tool-choice mode for T-20: forced `{tool: {name}}` plus a zod parse. The Nova 2 guide documents tool, any and auto, and all three worked.
- Deviations: these tests use Nova (D21), not Opus. Test C also covers `any`, `auto` and JSON without tools, as the orchestrator asked. The fallback did not run as a suite because nothing failed; a probe showed Nova Pro behaves the same on forced-tool streaming. `.env.local` was already set by T-00, so it is unchanged.
- Finding (F-007): ConverseStream sends a forced tool's input as one delta at the end (TTFT about equal to total). Plain text streams normally (TTFT 450 ms). Treat structured output as non-streaming and run it in the background or overnight.
- Full numbers: [SMOKE-RESULTS.md §T-01](../SMOKE-RESULTS.md).

**Orchestrator verification (2026-10-22):** ran the suite twice. A–C PASS both times; D PASS once, FAIL once on both models (fewer than 4 days). Marked DONE; the D flakiness is recorded in SMOKE-RESULTS §T-01 as a T-25 risk.
