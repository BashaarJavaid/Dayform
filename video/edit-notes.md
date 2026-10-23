# Edit notes (T-51)

Target: **at most 2:59** (judges may stop at 3:00). Captions burned in. English SRT: [captions.srt](captions.srt).
Order and times: [shot-list.md](shot-list.md). Stills are re-rendered with `npx tsx video/scripts/render.ts`.

## Where each asset goes

| Asset | Where | Length |
|---|---|---|
| `assets/title-card-A.png` or `-B.png` (user picks) | 0:00, before or under the start of S1; again as the close at about 2:54 | ≤ 3 s at the open (the first 20 s must show the product working) |
| `assets/lower-thirds/nova-sonic.png` | S1, when the light bar first listens | 3–4 s |
| `assets/lower-thirds/mcp-apps-card.png` | S1, when the `meal-logged` card lands | 3–4 s |
| `assets/lower-thirds/mcp.png` | S3 first tool call in "Under the hood"; S7 Inspector clip | 3–4 s |
| `assets/lower-thirds/nova-lite.png` | S4, when the `meal-prep` carousel appears | 3–4 s |
| `assets/lower-thirds/add-to-cart.png` | S4, when the amazon.com tab opens | 3–4 s |
| `assets/lower-thirds/eventbridge-lambda.png` | S5, on the night animation | 1–3 s |
| `assets/lower-thirds/aurora.png` | S5, when the brief card lands | 3–4 s |
| `assets/lower-thirds/agentcore.png` | S7, on the AgentCore console clip | 3–4 s |
| `assets/architecture-slide-A.png` or `-B.png` (user picks) | S7, after the proof clips | about 5 s |
| `assets/s7-*.txt` | S7 backups only, if a console clip can't be recorded | |

Lower thirds are transparent 1920×1080 PNGs: place each at 0,0 on a track above the footage. The flat label sits top left, in the empty band above the Echo Show frame, so it never covers the burned-in captions or the simulator's reply text at the bottom. Fade in/out about 0.2 s.

## Rules

- **P2:** if S5 runs long, start the S5 clip on the "skip to morning" press and trim the night animation to 1 s (or start straight on the brief card).
- **P3:** if the cut is still over 2:59, drop S6 (not a keep-at-all-costs scene). Keep S1, S3, S4 and S5. Shift the S7 caption cues earlier by S6's length.
- Measured live replies run long (S1 about 22 s of audio, S5 about 44 s): trim pauses and dead air between turns, never the card landing.
- **Captions:** the SRT is a draft from the script's lines and real numbers. After the cut, retime it to the final edit and change each Alexa cue to the words she actually said. Burn in with the editor (DaVinci Resolve: import the SRT onto a subtitle track, Deliver → Subtitle Settings → Burn into video; Clipchamp: import captions, export). The Homebrew ffmpeg on this laptop has no `subtitles` filter (no libass, FRICTION F-018), so `ffmpeg -vf subtitles=` won't work here. Upload the SRT to YouTube too.
- **Music:** none (the voice carries the video). If any is added, it must be royalty-free, with the license noted here.
- **Audio:** mix the mic and system tracks so Alexa and the user are equally loud; no clipping (peaks below −1 dB).
- **Screens:** only our own screens and AWS consoles from our account. Crop or blur the AWS account ID, the browser tabs and anything personal (the amazon.com account name).
- **S7 console still:** don't use `smoke/agentcore-mcp/screens/agentcore-runtime-console.png`; it shows the smoke runtime `dayform_smoke_mcp` (not `dayform_server`), the account ID and unrelated tabs. Record `dayform_server` fresh.
- Export 1920×1080, H.264, same fps as recorded. Check the final length in YouTube: at most 2:59.
