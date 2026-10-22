# T-01 · Smoke test: Claude Opus 5.5 on Bedrock

| Field | Value |
|---|---|
| Wave | 0: Setup and smoke tests |
| Demo importance | ENABLER |
| Size | S |
| Depends on | T-00 |
| Owns | `smoke/bedrock-claude/` |
| Approval needed | No. The model calls cost a few cents. |
| Status | TODO |

## Goal
Prove the server can call Claude Opus 5.5 on Bedrock, use tools, and get valid structured JSON back. Measure the latency.

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
1. **Claude Sonnet 5.5:** faster, but only `auto` or `none` tool choice.
2. **Amazon Nova 2 Lite:** Amazon-native, supports Converse with tools.
3. **Anthropic API directly:** outside the Amazon stack, so it weakens AWS Builder. The orchestrator decides.

## Result
_The agent fills this in._
