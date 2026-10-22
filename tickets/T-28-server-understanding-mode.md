# T-28 · Server understanding mode

| Field | Value |
|---|---|
| Wave | 2: MCP server tools |
| Demo importance | CUT-FIRST |
| Size | S |
| Depends on | T-20, T-22, T-24 (at least these tools must exist) |
| Owns | `server/src/understanding/` |
| Approval needed | No |
| Status | TODO |

## Goal
With `UNDERSTANDING=server`, each tool takes one text field, and the server's Opus turns that text into the normal structured input.

## Why it matters for the demo
It isn't shown in the main scenes. It keeps the user's requirement that one env var switches who does the understanding. S7 can mention it in one line.

## Read first
- [DESIGN.md D3, D10](../DESIGN.md#1-agreed-decisions), [§7 LLM and code](../DESIGN.md#7-llm-and-code)

## Tasks
1. **Adapter.** For each tool, build a server-mode input schema, `{request: string}`. Its description tells clients to "pass the user's words for this request".
2. **Parse.** Call the LLM client with the tool's alexa-mode input schema as the required output. Add context: today's date on the demo clock, the last meal entry, the open workout session.
3. **Validate** the parsed input, then call the same handler as alexa mode.
4. **Register.** T-20's registry calls this adapter when `UNDERSTANDING=server`.
5. **README note** (send the text to T-50): server mode is for clients without a strong language model. It goes over Alexa's 500 ms target.
6. **Tests:** 5 tools (`log_meal`, `correct_meal`, `log_set`, `add_to_cart`, `get_progress`) with plain sentences.

## Acceptance criteria
- [ ] Restarting with `UNDERSTANDING=server` changes `tools/list` to text inputs.
- [ ] The S1 sentence, sent as raw text, creates the same entry as alexa mode.
- [ ] The 5 tool tests pass.

## Test scenario
1. Start the server with `UNDERSTANDING=server`. In MCP Inspector, check that `log_meal` has one `request` field.
2. Call `log_meal {request:"I had two rotis, chicken karahi and a mango lassi for lunch"}`. Expect the same items and totals as S1 in alexa mode.

## Result
_The agent fills this in._
