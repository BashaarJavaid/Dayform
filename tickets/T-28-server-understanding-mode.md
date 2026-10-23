# T-28 · Server understanding mode

| Field | Value |
|---|---|
| Wave | 2: MCP server tools |
| Demo importance | CUT-FIRST |
| Size | S |
| Depends on | T-20, T-22, T-24 (at least these tools must exist) |
| Owns | `server/src/understanding/` |
| Approval needed | No |
| Status | DONE |

## Goal
With `UNDERSTANDING=server`, each tool takes one text field, and the server's Opus turns that text into the normal structured input.

## Why it matters for the demo
It isn't shown in the main scenes. It keeps the user's requirement that one env var switches who does the understanding. S7 can mention it in one line.

## Read first
- [DESIGN.md D3, D10](../DESIGN.md#1-agreed-decisions), [§7 LLM and code](../DESIGN.md#7-llm-and-code)

## Tasks
1. **Adapter.** For each tool, build a server-mode input schema, `{text: string}` (the contracts' `ServerModeInput`; the orchestrator aligned this on 2026-10-22, it was `{request}` before). Its description tells clients to "pass the user's words for this request". T-20 already calls `server/src/understanding/index.ts` `parseRequest()` when `UNDERSTANDING=server`.
2. **Parse.** Call the LLM client with the tool's alexa-mode input schema as the required output. Add context: today's date on the demo clock, the last meal entry, the open workout session.
3. **Validate** the parsed input, then call the same handler as alexa mode.
4. **Register.** T-20's registry calls this adapter when `UNDERSTANDING=server`.
5. **README note** (send the text to T-50): server mode is for clients without a strong language model. It goes over Alexa's 500 ms target.
6. **Tests:** 5 tools (`log_meal`, `correct_meal`, `log_set`, `add_to_cart`, `get_progress`) with plain sentences.

## Acceptance criteria
- [x] Restarting with `UNDERSTANDING=server` changes `tools/list` to text inputs.
- [x] The S1 sentence, sent as raw text, creates the same entry as alexa mode.
- [x] The 5 tool tests pass.

## Test scenario
1. Start the server with `UNDERSTANDING=server`. In MCP Inspector, check that `log_meal` has one `text` field.
2. Call `log_meal {text:"I had two rotis, chicken karahi and a mango lassi for lunch"}`. Expect the same items and totals as S1 in alexa mode.

## Result
**REVIEW, 2026-10-22.** Built `server/src/understanding/index.ts`: `parseRequest(contract, text)` makes one forced-tool call to the reasoning model (Nova 2 Lite, D21) with the tool's alexa-mode input schema as the tool, and context = demo-clock local time (DEMO_TZ), the last meal entry (id, meal, items) and the open workout (day, current exercise, set, target). T-20's registry then validates with the contract and calls the same handler as alexa mode. `{text}` schema is the contracts' `ServerModeInput` (registry already swaps it in).

Verification:
- `npm test -w server -- understanding`: 6 passed (tools/list all `text`; log_meal, correct_meal, start_workout+log_set, add_to_cart, get_progress with plain sentences; LLM mocked, prompt checked for date, last-meal and open-workout context).
- `T28_LIVE=1 npm test -w server -- understanding`: 6 passed with one real Nova call per tool. Latency end to end: log_meal 1329 ms, correct_meal 1304, start_workout 580, log_set 551, add_to_cart 1312, get_progress 699 (Nova 527–1169 ms per call, all attempt 1).
- `UNDERSTANDING=server PORT=8014 npm run dev -w @dayform/server`, Inspector CLI `tools/list`: all 19 tools have the single `text` field (log_meal: `{"text": {"type":"string","minLength":1}}`, required).
- Inspector CLI `tools/call log_meal text="I had two rotis, chicken karahi and a mango lassi for lunch"`: lunch, Roti (chapati) 2 roti 80 g 239 kcal, Chicken karahi 1 plate 250 g 440 kcal, Mango lassi 1 glass 300 g 225 kcal, totals 904 kcal / 48.7 g protein, same as alexa mode. Server log `tool=log_meal ms=1419` (Nova 1169 ms). Demo DB reset afterwards.

Deviations: the ServerModeInput description is the contract's ("What the user said, word for word."), not "pass the user's words for this request"; changing it is a contract edit, left to the orchestrator. Test sentence for add_to_cart uses peanut butter: "eggs" with 2 packs added nothing on the seed (likely the catalog's availability rule, not T-28; not investigated).

README note (for T-50): Server mode (`UNDERSTANDING=server`) gives every tool one plain-text input that the server's own model turns into the structured call, for clients without a strong language model. Each call then makes one model call, so it goes over Alexa's 500 ms target (about 0.6 to 1.4 s).

**Orchestrator close-out (2026-10-22):** verified as part of the 89/89 suite; server mode is CUT-FIRST and works (0.6–1.4 s per call by design). DONE.
