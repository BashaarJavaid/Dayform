# T-02 · Smoke test: Nova Sonic voice loop

| Field | Value |
|---|---|
| Wave | 0: Setup and smoke tests |
| Demo importance | ENABLER (it unlocks every scene's voice) |
| Size | M |
| Depends on | T-00 |
| Owns | `smoke/nova-sonic/` |
| Approval needed | No |
| Status | BLOCKED (typed path PASS; waiting for the user's voice session: mic round trip, voice choice, food words) |

## Goal
Prove a full browser voice round trip through Nova Sonic that includes one tool call. Measure the latency. Find out how well Sonic hears desi food words.

## Why it matters for the demo
Nova Sonic is Alexa's voice in every scene. If it mishears or replies slowly, every take fails.

## Read first
- [DESIGN.md §2 Architecture](../DESIGN.md#2-architecture) and [§10 Services and fallbacks](../DESIGN.md#10-services-and-fallbacks)
- AWS sample: https://github.com/aws-samples/amazon-nova-samples/tree/main/speech-to-speech/amazon-nova-2-sonic
- Model card: https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-2-sonic.html

## Facts from research (2026-10-23)
- **Models:** Nova 2 Sonic (`amazon.nova-2-sonic-v1:0`) and Nova 2.5 Sonic (GA 2026-10-05; ID not yet confirmed).
- **Capabilities:** speech-to-speech with tool calling. Text and audio can mix in one session.
- **API:** `InvokeModelWithBidirectionalStream`, an HTTP/2 event stream signed with IAM. It doesn't use the Converse API.
- **Browser connection:** browsers can't call it directly. Use a local WebSocket relay.
- **Limits:** 8 minutes per connection, and 20 concurrent streams per account per region.
- **Languages:** English (US, UK, India, Australia), French, Italian, German, Spanish, Portuguese, Hindi.
- **Voices:** tiffany and matthew are polyglot. Others include amy, olivia, kiara and arjun.

## Tasks
1. Pick the model: Nova 2.5 Sonic if T-00 found its ID and access; otherwise `amazon.nova-2-sonic-v1:0`.
2. **Build a minimal relay:** a browser page (mic capture as 16 kHz PCM, audio playback) ↔ a local WebSocket server ↔ Bedrock bidirectional stream.
   - Start from the AWS sample.
   - Prefer Node/TypeScript with `@aws-sdk/client-bedrock-runtime` and an HTTP/2 request handler.
   - If Node blocks you, use the sample's Python server for this smoke test, and record why. T-30 makes the final language choice.
3. **One tool.** Give Sonic `log_meal_stub` (items array), and return a fixed result. Check that Sonic speaks a reply that uses the result.
4. **Text input.** In the same session, type "I had two eggs". Expect the same tool call.
5. **Voice.** Try `tiffany`, `amy` and `matthew`. Choose the one closest to Alexa, and record it.
6. **Latency.** Measure the time from the end of the user's speech to the first audio byte, over 5 turns. Record the p50.
7. **Reconnect.**
   - Force a session restart after 60 s.
   - Pass a short summary of the conversation into the new session.
   - Check that the next turn still knows the context.
8. **Food-word test.** The user says each phrase below; record what Sonic hears in `smoke/nova-sonic/food-words.md`:
   - "two rotis and chicken karahi"
   - "a plate of chicken biryani"
   - "a mango lassi"
   - "daal chawal"
   - "an aloo paratha with raita"
   - "nihari with naan"
   - "chana chaat"
   - "start push day", "done, eight reps", "eighty kilos", "swap the overhead press"
   - "ask Dayform what's left for today" (the product name; watch for "deform" or "day for him")
9. Write the results to [SMOKE-RESULTS.md](../SMOKE-RESULTS.md) §T-02.

## Acceptance criteria
- [ ] A voice round trip with a tool call works in Chrome.
- [ ] Text input works in the same session.
- [ ] The p50 from end of speech to first audio is recorded.
- [ ] Reconnect keeps context.
- [ ] `food-words.md` has one row per phrase: said · heard · match (yes or no).
- [ ] The voice and model ID are recorded.

## Test scenario
1. Run `npm run smoke:sonic` (or the sample's start command). Open the local page in Chrome.
2. Say: "Alexa, I had two eggs for breakfast."
3. Expect:
   - the console logs the tool call `log_meal_stub` with `food: "eggs"`
   - Alexa's voice replies and mentions eggs
   - the page shows the latency

## Fallbacks
Use them in this order:
1. **Nova 2 Sonic**, if the Nova 2.5 Sonic ID or access is missing.
2. **Sonic in us-west-2**, for voice only.
3. **Pipeline:** Amazon Transcribe streaming → Claude (Converse with tools) → Amazon Polly (generative voice, streaming). It's slower, but every part is Amazon. Transcribe custom vocabulary can fix food words.
4. **Browser Web Speech API** (Chrome) for speech-to-text, plus Polly for speech.
5. **Typed input** plus Polly voice output. The demo keeps Alexa's voice.

**If Sonic mishears food words:**
- Add the misheard forms as aliases in T-12. Fuzzy search then still finds the right food.
- If it's still bad, type those lines in the demo (they're the safe lines), or use fallback 3 with a custom vocabulary.

## Result
- **Built (`smoke/nova-sonic/`):** `server.ts` (WebSocket relay on 8102 that serves `index.html`, one Bedrock bidirectional stream per session, `log_meal_stub` with a fixed result, typed input, silence keep-alive, auto-reconnect after `RECONNECT_AFTER_S`=60 with a code-built summary in the new system prompt), `index.html` (mic 16 kHz PCM via ScriptProcessor, 24 kHz playback, barge-in stop, text box, latency readout with p50, log pane), `test-text.ts` (typed-turn checker), `README.md` (user steps), `food-words.md` (template). `npm run smoke:sonic` starts it.
- **Model:** `amazon.nova-2-5-sonic` (T-00 recorded it; fallback `amazon.nova-2-sonic-v1:0` also passes).
- **Verified (no human):** typed "I had two eggs" → `TOOL log_meal_stub {"items":[{"food":"eggs","quantity":2}]}`, spoken reply "I have logged two eggs for you…", 944,640 audio bytes. Typed-turn → first audio p50 646 ms over 5 turns (Nova 2: 1232 ms). Reconnect (forced and automatic at 60 s) → "The first thing you told me you ate was two eggs."
- **Not verified (user):** voice round trip in Chrome, voice p50, voice choice, food-word table. Acceptance 3/6 met (text input, reconnect, model ID); voice round trip, voice p50 and food words wait for the user.
- **Deviations:** event shapes from the AWS docs and the websocket-nodejs sample; no rxjs/express/socket.io. Summary passed in the system prompt rather than as USER/ASSISTANT history (simpler; the docs allow history once, before audio).
- **Fallbacks used:** none.
- **Friction:** F-008 (typed input inside the reply's play time counts as barge-in).
