# T-41 · Demo hardening and rehearsal

| Field | Value |
|---|---|
| Wave | 4: Deploy and harden |
| Demo importance | HERO |
| Size | M |
| Owner | Demo Monitor (see [DEMO-MONITOR.md](../DEMO-MONITOR.md)) |
| Depends on | Every HERO ticket, T-40 |
| Owns | `demo/`, [DEMO-SCRIPT.md](../DEMO-SCRIPT.md) |
| Approval needed | The user approves script v1 |
| Status | TODO |

## Goal
Make the full demo run clean three times in a row, inside the time budget, on the final stack. Produce script v1.

## Why it matters for the demo
The video is recorded from these runs. Everything the judges see depends on this ticket.

## Read first
- [DEMO-SCRIPT.md](../DEMO-SCRIPT.md), [DEMO-MONITOR.md](../DEMO-MONITOR.md), [DESIGN.md §8 Demo controls](../DESIGN.md#8-demo-controls)

## Tasks
1. **Warm-up script**, `npm run demo:warm`, in this order:
   1. Check that Aurora min capacity is 0.5 ACU or more.
   2. Reset the seed state.
   3. Call `get_daily_summary`, which opens an AgentCore session and warms the database.
   4. Open a Sonic session, and say one silent warm-up turn.
   5. Preload every card resource.
   6. Print "READY" with the timings.
2. **Scene runner**, `npm run demo:scene -- S1..S7`:
   - **Text mode** asserts the tool calls and the key result fields.
   - **Voice mode** prints the line to say, and records the timings.
3. **Time each scene** against DEMO-SCRIPT.md. Shorten lines that run over.
4. **Replace placeholder numbers** in DEMO-SCRIPT.md with the real output from the seed state.
5. **Failure drills.** Write down and practise each one:
   - **Bedrock slow:** type the safe line, and keep going.
   - **AgentCore down:** switch `MCP_URL` to the local server. Target: under 1 minute.
   - **Sonic down:** set `VOICE_ENGINE=pipeline`, or `text`.
   - **Amazon tab asks for sign-in:** pre-sign-in, per the recording checklist.
6. **Practice takes.** Record 2, using the T-51 setup. Review them with the orchestrator, and list the fixes.
7. **Script v1.** Write it with the orchestrator, then ask the user to approve it.

## Acceptance criteria
- [ ] Three full runs in a row (S1–S7) are clean on the final stack.
- [ ] Each scene stays inside its time budget, and the total is at most 2:59.
- [ ] `npm run demo:warm` prints READY in under 60 s.
- [ ] The failure drills are written down and tested once each.
- [ ] DEMO-SCRIPT.md v1 has real numbers and is approved by the user.

## Test scenario
1. Run `npm run demo:warm`. Expect READY.
2. Run `npm run demo:scene -- all --mode text`. Expect S1–S7 PASS, with timings.
3. Run a full voice run, following the script. Time it. Expect at most 2:59.

## Result
_The agent fills this in._
