# T-02 · Nova Sonic voice loop smoke

Browser (mic 16 kHz PCM, playback 24 kHz) ↔ `server.ts` WebSocket relay on port 8102 ↔ Bedrock `InvokeModelWithBidirectionalStream`.
Model comes from `VOICE_MODEL_ID` in the repo's `.env.local` (now `amazon.nova-2-5-sonic`; fallback `amazon.nova-2-sonic-v1:0`), credentials from `AWS_PROFILE` there.

## Run

```
cd smoke/nova-sonic
npm install            # once; local to this folder
npm run smoke:sonic    # relay + page on http://localhost:8102
npx tsx test-text.ts   # (optional, other shell) typed-turn check: tool call, audio, latency, reconnect
```

Env: `PORT` (8102), `RECONNECT_AFTER_S` (60; 0 = off), `VOICE_MODEL_ID` (overrides `.env.local`).

## Your steps (about 10 minutes, Chrome, headphones help)

1. `npm run smoke:sonic`, open http://localhost:8102 in Chrome.
2. **Voice round trip.** Voice = tiffany → **Start session** → **Mic on** (allow the mic). Say: "Alexa, I had two eggs for breakfast."
   Expect in the log pane: `TOOL log_meal_stub {"items":[{"food":"eggs","quantity":2}]}`, a spoken reply that mentions eggs, and the latency readout.
3. **Latency.** Say 5 short meal lines (e.g. "I had a banana", "a glass of milk", "two rotis", "a mango lassi", "a cup of chai"), waiting for each reply. Copy the `p50 … over N turns` line.
4. **Text in the same session.** Type `I had two eggs` and press Enter. Expect the same tool call.
5. **Reconnect.** Wait for the `RECONNECTED (60s elapsed)` line (or click **Force reconnect**), then say "What was the first thing I told you I ate?" Expect "eggs".
6. **Voice choice.** For each of tiffany, amy, matthew: pick it, **Start session**, say one line. Note which sounds closest to Alexa.
7. **Food words.** Fill `food-words.md`: say each phrase, copy the `USER:` line.
8. Send the orchestrator: voice p50, chosen voice, reconnect yes/no, and the filled `food-words.md`.

The latency readout for voice uses a simple energy VAD: time from the last loud mic frame to the first audio byte, so it includes Sonic's own end-of-speech wait (`endpointingSensitivity: MEDIUM`).
