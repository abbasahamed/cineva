# Cineva Phase 2 Progress Log

## System changes made on this machine
- **Wi-Fi DNS**: Configured DNS servers to `1.1.1.1` and `8.8.8.8` via `networksetup -setdnsservers Wi-Fi 1.1.1.1 8.8.8.8` because the local router (`192.168.0.1`) failed to resolve `api.trycloudflare.com` for Cloudflare quick tunnels.
  - **Exact command to undo**:
    ```bash
    networksetup -setdnsservers Wi-Fi Empty
    ```
- **Rule**: Never change macOS system settings (DNS, network, power, etc.) without explicit user permission.

## Log
- **Handoff Takeover / Step 0 Initialized**: Created `docs/PHASE2_BRIEF.md` and `docs/PROGRESS.md`. Cleaned environment (ports 4000/5173, killed orphaned dev servers). Verified git state on branch `feature/phase2`.
- **Section 1 Completed — Single-Port Serving, Tunnel, Start:Share, Equal Control**:
  - **What changed**:
    - Single-port serving: Express serves `apps/web/dist` with SPA fallback excluding `/api`, `/socket.io`, `/media`.
    - Tunnel integration: `ENABLE_TUNNEL`, `KEEP_AWAKE`, `/api/system/public-url`, CORS configured for dynamic tunnel origins, `ShareModal.tsx` and `api.ts` wired to prefer public URL so invite links/QR never use localhost.
    - Equal playback control by default: `CreateRoomSchema` and `roomManager.createRoom` default `allowGuestControl: true`.
    - Process lifetime & orphan prevention: Bound `caffeinate` to server PID via `caffeinate -dims -w <pid>`, added `cleanupCaffeinate()` and `tunnelService.stop()` to `shutdown()`, `process.on('exit')`, `process.on('uncaughtException')`, and `server.on('error')`.
    - Added `scripts/start-share.mjs` and `npm run start:share`.
  - **What was verified**:
    - Occupied port test: Dummy listener held port 4000; server failed cleanly with exit code 1; `pgrep caffeinate` verified 0 orphaned processes.
    - `npm run start:share` end-to-end: built packages, started server + caffeinate, auto-spawned `cloudflared` quick tunnel, logged banner with public link (`https://patients-tuesday-tomorrow-whereas.trycloudflare.com`).
    - Verified `GET <public-url>/api/health` -> 200 OK.
    - Verified `GET <public-url>/` -> 200 OK (SPA root HTML).
    - Verified `GET <public-url>/room/ABC123` -> 200 OK (SPA deep link fallback).
    - Verified `GET /api/system/public-url` returns active tunnel URL.
    - SIGINT shutdown: Server, cloudflared, and caffeinate all terminated cleanly; `pgrep caffeinate` and `pgrep cloudflared` confirmed 0 remaining processes.
    - Equal control verified: Guest playback allowed by default; host toggle disallows.
    - `npm run typecheck`: 0 errors.
    - `npm run build`: 0 errors.
    - `npm test`: 166 passed (120 server, 46 web).
  - **What's next**: Section 1 follow-ups (DNS warning, crash recovery, abuse limits).
- **Section 1 Follow-ups Completed**:
  - **What changed**:
    - Recorded macOS Wi-Fi DNS configuration in PROGRESS.md with exact undo command (`networksetup -setdnsservers Wi-Fi Empty`).
    - Added DNS resolution diagnostic for `api.trycloudflare.com` to `tunnelService.ts` and `scripts/start-share.mjs` with explicit advice to manually configure DNS if lookup fails.
    - Added abuse limit configurations in `config.ts`: `MAX_CONCURRENT_ROOMS` (default 3), `MAX_TOTAL_STORAGE_GB` (default 20 GB), `MAX_TOTAL_STORAGE_BYTES`.
    - Added `apps/server/src/utils/clientIp.ts` with spoof prevention: only trusts `CF-Connecting-IP` when request arrives through authentic Cloudflare tunnel headers (`cf-ray` or verified tunnel host), falling back to remote IP on direct connections.
    - Added `apps/server/src/utils/diskQuota.ts` enforcing total uploads quota (20 GB) and host volume free space headroom (2 GB minimum), returning HTTP 507 when exceeded.
    - Wired capacity check into `RoomManager.createRoom`, returning HTTP 429 when max concurrent rooms limit is reached.
    - Wired `clientIp` into `apiLimiter`, `roomCreationLimiter`, `roomJoinLimiter`, and `uploadLimiter`.
    - Added test suite `apps/server/src/__tests__/abuseLimits.test.ts`.
  - **What was verified**:
    - Path (a): `kill -TERM` on server started via `npm run start:share`; verified server, cloudflared, and caffeinate are all terminated cleanly.
    - Path (b): `kill -9` on cloudflared while server was running; verified server remained UP (`/api/health` 200), tunnelService auto-detected crash and restarted cloudflared, `/api/system/public-url` updated to fresh tunnel URL.
    - Path (c): Started server with `cloudflared` omitted from PATH; verified clear warning logged and server operated cleanly in local mode on port 4000 (`/api/system/public-url` returning null).
    - `npm run typecheck`: 0 errors.
    - `npm run build`: 0 errors.
    - `npm test`: 172 passed across 18 test suites (server 126, web 46).
  - **What's next**: Section 2 — Media pipeline v2: HLS packaging with multi-audio, subtitle extraction, and test fixtures.
- **Section 2 Milestones Completed (HLS Multi-Audio & Subtitle Packager + Fixtures)**:
  - **What changed**:
    - Created `scripts/make-fixtures.mjs` generating all 4 required test fixtures:
      - `fixtures/1_h264_aac.mp4`: H.264 + LC-AAC baseline
      - `fixtures/2_multi_track.mkv`: 7 streams — H.264 video, 3 audio tracks (English 440 Hz, Hindi 880 Hz, Telugu 1320 Hz), 2 text subtitle tracks (English [CC], Español), 1 image-based PGS subtitle track (Français)
      - `fixtures/3_hevc.mkv`: HEVC video + AAC audio
      - `fixtures/4_corrupted.mp4`: Corrupted header fixture
    - Verified FFmpeg 9.0.1 on Apple Silicon M4: confirmed `h264_videotoolbox` hardware acceleration is active and operational.
    - Updated `@cineva/shared` with `TrackManifest`, `VideoTrackInfo`, `AudioTrackInfo`, `SubtitleTrackInfo`, and updated `MediaInfo`.
    - Enhanced `mediaAnalyzer.ts` to capture stream tags (`language`, `title`), `channelLayout`, and disposition flags (`isDefault`, `isForced`).
    - Created `trackManifest.ts`:
      - Resolves ISO 639-1 / 639-2 codes to clean display names via native `Intl.DisplayNames`.
      - Identifies supported text subtitles (`subrip`, `srt`, `ass`, `ssa`, `mov_text`, `webvtt`) vs unsupported image/bitmap subtitles (`hdmv_pgs_subtitle`, `pgs`, `dvd_subtitle`, `vobsub`, `dvb_subtitle`) with explicit user-facing explanation.
    - Created `hlsPackager.ts`:
      - Extracts every supported text subtitle track into standalone `.vtt` WebVTT files using FFmpeg.
      - Packages video and all audio renditions into fMP4 HLS (`stream_%v.m3u8`, `init_*.mp4`, `stream_*.m4s`).
      - Rewrites/formats `master.m3u8` to include human-readable audio rendition names, `#EXT-X-MEDIA:TYPE=AUDIO`, companion subtitle playlists (`sub_*.m3u8`), `#EXT-X-MEDIA:TYPE=SUBTITLES`, and links them to `#EXT-X-STREAM-INF`.
      - Supports early playback startup notification when initial segments are ready.
    - Added unit test suite `apps/server/src/__tests__/hlsMultiTrack.test.ts`.
  - **What was verified**:
    - Ran `npx tsx scripts/test-hls-packager.mjs` against `fixtures/2_multi_track.mkv`: packaged 7 streams in 110ms on M4; generated all fMP4 segments, WebVTT files, and formatted master playlist.
    - Ran `npx vitest run src/__tests__/hlsMultiTrack.test.ts`: 4/4 tests passed.
    - `npm run typecheck`: 0 errors across `@cineva/shared`, `@cineva/server`, `@cineva/web`.
    - `npm test`: 176 passed (130 server, 46 web).
  - **What's next**: Show Track Manifest JSON and Master Playlist to the user for review, then wire media storage/job queue and the frontend HLS player.

## Old UI still in use by the watch room
Per instructions, the watch room page UI is kept intact and will be redesigned in the next phase. The following components and styles remain active for the watch room:
- `apps/web/src/context/ThemeContext.tsx` (palette themes: blue, red, purple, emerald, amber, rose)
- `apps/web/src/components/ThemeSelector.tsx`
- `apps/web/src/components/Navbar.tsx`
- `apps/web/src/components/CinematicBackground.tsx`
- `apps/web/src/components/StarfieldBackground.tsx`
- `apps/web/src/components/VideoPlayer.tsx`
- `apps/web/src/components/ChatPanel.tsx`
- `apps/web/src/components/ParticipantsList.tsx`
- `apps/web/src/components/MediaUploadModal.tsx`
- `apps/web/src/components/SettingsModal.tsx`
- `apps/web/src/components/ShareModal.tsx`
- `apps/web/src/components/DebugPanel.tsx`
- Existing `--brand-*` CSS custom properties in `apps/web/src/index.css`

## New UI Implementation (Landing, Create, Join)

- **Step 0: Ground Truth Reference Capture Completed**:
  - Captured Playwright Chrome reference screenshots of the static prototypes (`claude/index.html`, `claude/create.html`, `claude/join.html`) across 360px, 768px, 1440px, and 2560px viewports into `docs/design-reference/`.
- **Step 1: Design tokens, fonts, and glass primitives Completed**:
  - **What changed**:
    - Installed and self-hosted `@fontsource-variable/geist` and `@fontsource-variable/geist-mono` in `apps/web/src/main.tsx`.
    - Extended `tailwind.config.js` to map Geist / Geist Mono fonts.
    - Added Cineva 2.0 design tokens (`--bg`, `--text`, `--line`, `--accent`, `--ok`, `--danger`, aurora colors `--a1`...`--a4`, radii, easings) and CSS rules to `apps/web/src/index.css`.
    - Created `apps/web/src/components/AmbientBackground.tsx` supporting ambient background with blurred color fields and film still, plus aurora variant for landing.
    - Created `apps/web/src/components/GlassSurface.tsx` supporting pointer sheen coordinates (`--mx`, `--my`), specular rim gradient, inner highlight, blur/saturation/brightness, and accessibility fallbacks.
  - **What was verified**:
    - `npm run typecheck --workspace=@cineva/web`: 0 errors.
  - **What's next**: Step 2: Shared UI components (Logo, PillLink, Button, Field, Input, Switch, CodeInput, Dropzone, FileRow, ProgressStages).


