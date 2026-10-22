# T-51 · Demo video

| Field | Value |
|---|---|
| Wave | 5: Repo, video, submission |
| Demo importance | HERO (judges may judge from the video alone) |
| Size | M |
| Depends on | T-41 (script v1) |
| Owns | `video/` (shot list, captions, assets; raw footage stays out of git) |
| Approval needed | Human steps: the user records, and uploads to YouTube |
| Status | TODO |

## Goal
Produce a video under 3 minutes that shows every hero scene, and proves the technology.

## Why it matters for the demo
The rules let judges stop watching at 3:00, and judge only from the video and the description. This is the product, as far as most judges are concerned.

## Read first
- [DEMO-SCRIPT.md](../DEMO-SCRIPT.md) v1, especially the recording checklist.
- `smoke/amazon-cart/screens/`, `smoke/agentcore-mcp/screens/` and `video/assets/` (from T-40), for the S7 clips.

## Tasks
1. **Shot list,** `video/shot-list.md`, from script v1: one row per scene, with the line, the expected screen, and the start and end times.
2. **Recording setup:**
   - OBS at 1920×1080, 30 or 60 fps
   - the browser full screen
   - separate tracks for system audio and the mic
   - a levels test before recording
3. **Assets:**
   - a title card
   - the architecture slide (from the T-50 diagram)
   - lower-third labels naming each technology as it appears (MCP 2025-11-25, Nova Sonic, AgentCore, Claude Opus 5.5 on Bedrock, Aurora)
4. **Record** each scene as its own take. Reset the seed state between takes. Capture the S7 clips: MCP Inspector, the AgentCore console, CloudWatch.
5. **Edit** (DaVinci Resolve, Clipchamp or ffmpeg).
   - Captions: English, in an SRT file and burned in.
   - Music: none, or royalty-free with a license note.
   - Use only our own screens, plus AWS consoles we have rights to show.
6. **Human step:** upload to YouTube as **Public**. Put the link in `README.md` and `SUBMISSION.md`.

## Acceptance criteria
- [ ] The length is at most 2:59.
- [ ] The video is public on YouTube, and plays signed out.
- [ ] Every HERO scene (S1, S3, S4, S5) is shown working.
- [ ] The first 20 seconds show the product working.
- [ ] English captions are present. Audio is clear, with no clipping.

## Test scenario
1. Open the YouTube link in a private browser window. It plays.
2. Watch it with the sound off. Captions carry the story.
3. Check the length in YouTube: at most 2:59.

## Result
_The agent fills this in._
