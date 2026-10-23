# Voice run 1 (user, 2026-10-22 20:51 EDT, Chrome, model amazon.nova-2-5-sonic, voice tiffany)

Spoken turns that triggered `log_meal_stub` (end of speech → first audio byte, includes the tool round trip):

| # | user said (as heard) | tool call | latency ms |
|---|---|---|---|
| 1 | i had two breakfasts i had two eggs for breakfast | eggs ×2 | 1246 |
| 2 | i had a glass of milk | milk 1 glass | 1389 |
| 3 | add a banana and two rotis to that | banana ×1, roti ×2 | 1202 |
| 4 | and a mango lassi | mango lassi ×1 | 1182 |
| 5 | add another banana to that | banana ×1 | 1162 |

**Voice p50 (tool turns): 1202 ms** (min 1162, max 1389). Non-tool turns: 153, 945, 2097, 2137 ms.

- Reconnect: automatic at 60 s and manual. After reconnect, "what was the first thing i told you to add" → "The first thing you told me to add was two eggs for breakfast." Context kept: **yes**.
- Food words heard correctly by voice: "two rotis", "mango lassi", "banana", "glass of milk". The 12-phrase list in food-words.md is still to be spoken.
- Voice: tiffany only (amy and matthew not compared).
- Bugs seen: the manual reconnect button fired ~12 times in a row (no debounce; T-30 must guard); the user could not type into the page's text box (typed input itself works through the WebSocket, see test-text.ts).
- First turn of the session was misheard ("it is very similar to the").
