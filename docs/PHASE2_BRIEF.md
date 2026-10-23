# REMAINING BRIEF

## GENERAL RULES
No stubs/TODOs. Run everything and show real output. Fix failures before moving on. Don't claim something works unless a command output or test proves it. Commit after each section. Keep typecheck/build/tests green at every commit.

## SECTION 2 — Media pipeline v2: HLS with every audio language and subtitle track
Goal: the movie keeps ALL its audio languages and subtitle tracks; each viewer picks their own.

Server:
- On upload, ffprobe every stream. Build a track manifest: video streams, each audio stream (index, language code, title, codec, channels, default flag), each subtitle stream (index, language, title, codec, forced flag).
- Package to HLS (fMP4 segments ~4s, `hls_playlist_type vod`, independent segments, keyframes aligned to segments):
  - Video: copy (`-c:v copy`) when already browser-safe H.264 8-bit; otherwise encode with `h264_videotoolbox` (fallback `libx264 -preset veryfast -crf 21`). Cap 1080p, yuv420p.
  - Audio: ONE separate audio rendition per source audio track, AAC (copy if already AAC), stereo default, proper language/name attributes via `#EXT-X-MEDIA` in the master playlist.
  - Subtitles: extract every TEXT-based track (subrip, ass/ssa, mov_text, webvtt) to WebVTT, referenced in the master playlist or the track manifest. IMAGE-based tracks (PGS, VobSub, DVB) can't be converted without OCR: list them in the manifest as `unsupported` and tell the user in the UI. Never hide them silently.
  - Keep a progressive single-file MP4 fallback ONLY if HLS packaging fails, and report that clearly.
- Playback must start as soon as the first segments exist, while the rest is still transcoding. Uploader sees a progress bar; guests see "Host is preparing the movie, X%".
- Serve HLS with correct MIME types, HTTP Range support, cache headers, through the same single port.
- Extend `/api/system/diagnostics` self-test to cover multi-audio + subtitle extraction using a generated fixture.

Web:
- Replace raw `<video src>` with `hls.js` (Safari native HLS fallback). The existing sync engine (drift controller) must keep working against the same media element.
- Per-viewer audio-language menu and per-viewer subtitle menu (Off + each track), remembered per room in localStorage. These are PERSONAL and must NOT sync to others. Keep the manual `.srt/.vtt` upload (shared with the room) as an extra option; remove only the room-wide broadcast of embedded tracks.
- Language names via `Intl.DisplayNames` ("Hindi", "English (5.1)"), not raw codes.
- Switching audio must not desync or restart the movie; verify drift returns under 120ms after a switch.
- Don't show a quality menu unless multiple renditions actually exist.

## SECTION 3 — Guaranteed cleanup of media on my Mac
When the room ends, EVERY file created for it on my disk is deleted.
- Host clicks End/Leave: immediate full cleanup. Host closes tab / loses connection: 30s grace, then full cleanup.
- Delete: original upload, chunk/temp files, HLS segments + playlists, extracted subtitles, transcode scratch, thumbnails, and the DB rows (Room, Participant, Media, ChatMessage) for that room.
- Also run cleanup on: host deletes the movie, host replaces the movie (delete the old one), server SIGINT/SIGTERM (delete all active rooms' files), and server startup (sweep the uploads dir; delete any directory with no matching live room, including leftovers from crashed sessions).
- Cancel in-progress FFmpeg jobs and uploads first (kill child processes, then delete), and ensure no job can recreate files after deletion.
- Log every deletion (path, bytes freed); expose the total in diagnostics.
- Tests with before/after directory listings of ./uploads and the temp dir, proving empty after: (a) host leave, (b) host tab close + grace period, (c) `kill -TERM` the server, (d) crash simulation + restart sweep, (e) cleanup during an active transcode. Use an injectable clock / shorter grace in test mode.

## SECTION 4 — Full visual redesign (most important)
The current UI looks AI-generated (starfield, purple glow, gradient text, glass cards, "sub-frame" hype copy). Rebuild the visual design from scratch; keep routes, state and logic. Direction: calm, premium, minimal "private screening room", closer to Linear / Apple TV / Plex than a sci-fi landing page.

Hard rules (violations = redo):
- REMOVE: starfield/nebula canvas, glowing blobs, gradient text, glassmorphism/blur cards, neon glow shadows, emoji decorations, hype copy ("sub-frame", "theater-grade", "lockstep").
- Near-black NEUTRAL surfaces (not blue-tinted), ONE restrained accent used sparingly (primary buttons, active states, focus rings, seek/progress bar). At most 4 accent options in settings; delete the other themes. WCAG AA contrast.
- One quality variable font (Geist or Instrument Sans + Geist Mono for timecodes), self-hosted via fontsource, a deliberate type scale, tight headings, comfortable body line-height.
- Strict 4/8px grid, two radii only, 1px low-contrast borders instead of shadows, real hover/focus/active/disabled states, visible keyboard focus.
- Lucide icons only, one stroke width, consistent sizes.
- Motion: 150-200ms ease only; respect prefers-reduced-motion.
- Copy: plain, short, human, honest empty states and errors.

Pages:
- Landing: left-aligned hero, one-line value proposition, two buttons (Create room, Join with code), clean 3-step explanation, short how-it-works/privacy section, accurate CSS/SVG mock or screenshot of the watch room, minimal footer.
- Create/Join: focused single-card forms; code input with 6 segmented boxes, paste support, inline validation.
- Watch room: video is the hero. Player chrome fades when idle; slim control bar (play, time, seek bar with buffered range + hover preview, volume, audio language, subtitles, speed, zoom, PiP, fullscreen). Right sidebar with Call / Chat / People tabs (collapsible), compact video tiles with speaking indicator and per-person connection-quality indicator. Toasts like "Maya paused", "Host changed the movie".
- Upload/prepare state: stages (Uploading → Analyzing → Converting → Ready), file name, size, ETA, cancel.
- Responsive: 360px phone, tablet, 1440 laptop, 21:9 ultrawide; fullscreen and landscape phone must be good. Dark default.

Process:
1. Write `docs/design-system.md` first (tokens: colors, type scale, spacing, radii, components) and implement as Tailwind config + CSS variables.
2. Build, then use Playwright to screenshot every page/state at 360, 768, 1440, 2560 widths.
3. Critique your own screenshots against the hard rules and a checklist (alignment, contrast, truncation, overflow, empty/loading states). List flaws and FIX them. At least TWO review-and-fix rounds. Save finals to `docs/screenshots/`.
4. Run axe-core via Playwright on every page; fix serious/critical issues.

## SECTION 5 — End-to-end testing with real host and participants
Playwright suite in `e2e/`. Use installed Google Chrome (`channel: 'chrome'`), NOT bundled Chromium (it can't decode H.264/AAC). Launch args: `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --autoplay-policy=no-user-gesture-required`. Separate browser contexts for Host, Guest A, Guest B. Test setup starts the server automatically (tunnel disabled locally).

Fixtures generated with ffmpeg at test time (2-3 min, 1080p, burned-in frame counter/timecode): (1) MP4 H.264/AAC; (2) MKV with 3 audio tracks (English 440 Hz tone, Hindi 880 Hz, Telugu 1320 Hz), 2 text subtitle tracks, 1 image-based track; (3) HEVC MKV; (4) corrupted file. Never use copyrighted movies.

Scenarios (assert and RECORD NUMBERS, not just "no crash"):
A. Room lifecycle: create, invite link, join by code, 3 users visible, kick, rejoin.
B. Upload + convert: MKV upload with progress; playback starts before full transcode ends; all 3 audio languages and subtitle tracks show with correct names; image-based subtitle reported honestly; corrupted file shows a clear error, not a hang.
C. Playback sync: host plays, guest pauses, guest A seeks to 01:30, host changes speed, guest B joins mid-play, guest reloads mid-play, host reloads mid-play. After each action, sample `video.currentTime` + server clock on all pages in the same tick for 20s. Pass: median drift < 120ms, p95 < 250ms after settle; record time-to-resume after each seek (target < 1.5s locally) and rebuffer count.
D. Audio language: each viewer picks a different language; verify with a WebAudio AnalyserNode that the dominant frequency matches the chosen track (440/880/1320 Hz); one person's choice must not affect another's; drift < 120ms after switching.
E. Subtitles: different tracks per viewer; verify active cue text per page; zoom keeps cues visible; manual `.srt` upload works.
F. Calls: 3 tabs, all peer connections reach `connected`; read `RTCPeerConnection.getStats()` every second for 60s and report RTT, jitter, packet loss %, jitterBufferDelay/emittedCount (approx playout delay), audio level activity, frames decoded/dropped. Pass: RTT < 150ms local, loss < 1%, no ICE failures. Also test mute/unmute, camera toggle, peer reload (reconnects without offer glare), two peers joining at exactly the same time.
G. Network stress via CDP `Network.emulateNetworkConditions` on a guest: (1) 5 Mbps + 80ms, (2) 2 Mbps + 200ms, (3) offline for 5s. App must recover, sync must converge, UI shows reconnecting state. Record rebuffering and recovery time.
H. Cleanup proofs in the browser flow (leave button, tab close, end room), verifying files are really gone from disk.
I. UI checks: screenshots at all breakpoints, no console errors/warnings, no failed network requests, no horizontal overflow.
J. Soak: 10 minutes continuous playback with 3 users; report drift over time, server memory growth, reconnects.

Reporting: `e2e/report.md` with a table per scenario (expected vs measured, PASS/FAIL, raw numbers), traces/videos for failures. For every failure: find root cause, fix, rerun, keep a changelog. Be honest about what local tests can't prove (real internet latency, TURN relay behavior, my upload speed). Add `docs/manual-test-checklist.md` for testing over the real tunnel link with a phone or friend, including how to measure my upload bandwidth and what bitrate it supports.

## SECTION 6 — Final deliverables
- typecheck, build, unit tests, e2e all green.
- README: "Movie night in 5 steps" for macOS, troubleshooting (ffmpeg, cloudflared, ports, Chrome autoplay, TURN), limits (image-based subtitles, upload bandwidth).
- Final summary: what changed, test numbers, known limitations, next steps.
