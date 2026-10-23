# Food-word test (user, 2026-10-22, amazon.nova-2-5-sonic, voice tiffany)

Phrases were spoken in one run-on stream with no pause between them, which is harsher than the demo lines will be.

| said | heard | match |
|---|---|---|
| two rotis and chicken karahi | two rotis and chicken karai | yes (alias: karai) |
| a plate of chicken biryani | a plate of chicken biryani | yes |
| a mango lassi | and a mango lassi | yes |
| daal chawal | dal chawal | yes (alias: dal) |
| an aloo paratha with raita | aloo paratha with raita | yes |
| nihari with naan | nihari with naan | yes |
| chana chaat | chana chaat | yes |
| start push day | start pushte | **no** |
| done, eight reps | done eight trips | **no** |
| eighty kilos | eighty kilos | yes |
| swap the overhead press | swap the overhead press | yes |
| ask Dayform what's left for today | ask day form what's left for the day | partial (Dayform → "day form") |

Sonic's own tool call mapped the heard words to clean items: roti ×2, "chicken karai", "chicken biryani" (unit plate), "dal chawal", "aloo paratha with raita", "nihari with naan", "chana chaat". So the server's food search must accept `karai` and `dal`, and should split compound items ("aloo paratha with raita", "nihari with naan") into two foods.

Follow-ups:
- T-12: aliases `karai`, `kadai`, `dal`, `daal`; handle "X with Y" as two items.
- T-30 system prompt: name the program days ("push, pull, legs, upper day") and say that "reps" may be heard as "trips"/"wraps"; the product name is "Dayform" (one word).
- Safe lines: S3's "start push day" and "done, eight reps" get typed fallbacks (already in DEMO-SCRIPT).
