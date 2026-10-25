# CINEVA — MASTER PROMPT (v1)
/gsd-code-review /gsd-ui-review /liquid-glass /gsd-ai-integration-phase 
Save this file in the repo as `docs/MASTER_PROMPT.md`. It is the single source of truth for the whole project. Re-read it at the start of every session and after any interruption.

---

## 0. HOW YOU MUST WORK (agent protocol — non-negotiable)

1. **Read before acting.** Read this whole file, `docs/PROGRESS.md`, `git log --oneline -20`, `git status`. Report what you found. If the working tree is dirty, tell me before touching anything.
2. **Evidence over assumption.** For every bug: reproduce it, collect evidence (console output, DOM/computed styles, network traces, ffprobe, screenshots, test output), write the root cause in `docs/PROGRESS.md`, THEN fix it. Never fix by guessing and never hide a symptom (no blanket `overflow-x:hidden`, no silenced errors, no `try/catch` that swallows failures).
3. **Small verified steps.** One concern per commit. After every step: run typecheck, build, relevant tests, append to `docs/PROGRESS.md` (date, what changed, what was verified, what's next), commit with a clear message. Unrecorded work is lost work (a previous session was cut off by a quota limit).
4. **Honesty.** Never claim something works without a passing test, a measurement, or a screenshot you looked at. If a check fails, say so and show the output. If something can't be verified here (real iPhone, real internet latency, real DRM services), say so explicitly.
5. **Stop points.** Where this document says **STOP**, finish the step, present evidence (screenshots + numbers), and wait for my approval.
6. **Scope discipline.** Do not change application logic when the task is presentation, and do not redesign when the task is a bug fix. If something in a design file conflicts with how the app works, stop and ask.
7. **Machine safety.** Never change macOS system settings (DNS, network, power, security, login items) without asking first. Record any system change in `docs/PROGRESS.md` with the exact undo command. Never run destructive commands outside the repo (`rm -rf` only on paths you created, always print the path first). Never commit secrets, `.env`, uploaded movies, or fixtures derived from copyrighted media.
8. **Legal line.** Cineva plays files the host owns or may share, and (later) official embeddable sources. Never build anything that captures, records, proxies, re-streams or bypasses DRM of streaming services. Test fixtures are generated synthetically with ffmpeg (tones, test patterns), never real movies.
9. **Quota resilience.** Keep `docs/PROGRESS.md` current so any new session can resume from it. If you sense you're near a limit, commit and write the "next steps" section first.
10. **Final message format** for each phase: what changed, root causes, test numbers, screenshot paths, known limitations, and what needs a real device.

---

## 1. PRODUCT

**Cineva** is a private virtual cinema: a host creates a room, adds a movie file (or a sample), shares a link/code, and everyone watches in sync with a video call and chat, no accounts. It runs on the host's Mac (M-series, macOS, Node 20+, Chrome installed) and is shared through a Cloudflare Quick Tunnel on a single port.

### 1.1 Stack and structure (existing)
npm-workspaces monorepo: `packages/shared` (types, zod schemas, event names, math), `apps/server` (Node, Express, Socket.io, Prisma/SQLite, FFmpeg, media pipeline, tunnel service, `start:share` script), `apps/web` (React 18, Vite, TypeScript, Tailwind, WebRTC mesh, hls.js). Server serves the built web app on the same port as the API and sockets.

### 1.2 What exists (verify each in Phase 0, do not assume)
Rooms (create/join by code), host/guest roles, `allowGuestControl`, authoritative sync engine with drift correction, chat with activity lines, WebRTC mesh video call (mic/camera tiles), invite link from `/api/system/public-url`, tunnel + `caffeinate` lifecycle, media upload (up to 5 GB) with ffmpeg transcoding, per-viewer audio/subtitle menus, custom subtitle layer + subtitle settings (size, position, colour, edge, background, delay), keyboard shortcuts, reactions, ambient light from video, session resilience (`activeSessionSockets`), cleanup on room end.

### 1.3 Known issues to confirm and fix (from my testing)
- Mobile room layout overflows the viewport; two sidebars (`mobile-tabs-area` and `aside.side`) are mounted at once; stray `landscape-drawer-toggle` in portrait; empty-state content clipped inside the small stage.
- DevTools shows ~1,200 console errors and ~130 warnings on the room page.
- 1080p movie looks like 720p in Cineva but sharp in IINA.
- Duplicate participants and demo content ("Maya", "Dev", "Demo", `A7K9PX`) appeared after porting the design file; empty "Audience" chat chips; missing seek bar (fixed once; must stay fixed); arrow keys didn't seek on macOS (fixed once; must stay fixed); resume countdown overlay (removed; must stay removed).
- Audio-language menu once showed a placeholder instead of the file's real tracks (Hindi/Telugu).

---

## 2. QUALITY BAR

The product must feel like it was built by a professional design and engineering team: calm, consistent, fast, predictable. "AI slop" is a defect.

**Banned (reject in review):** purple/blue/pink brand gradients; gradient text; neon glows or coloured shadows; glass on everything; nested glass; heavy saturated colour behind glass; hover animations that scale/blur large surfaces; decorative emoji/icons without function; hype copy ("sub-frame", "theater-grade", "lockstep", "revolutionary"); fake people/data; lorem ipsum; random font sizes; centred-everything layouts; more than one primary button per view; inconsistent radii/icon sizes; unlabeled icon-only buttons; layout shift; horizontal scroll; any console error.

**Required:** one design system, consistent states for every component, real empty/loading/error states, zero console noise, keyboard and screen-reader support, honest copy.

---

## 3. PHASE 0 — AUDIT (no code changes) → STOP

1. Inventory routes and states: Landing, Create (empty, file selected, MKV, >5 GB, error, preparing with 4 stages, ready), Join (empty, prefilled, invalid, not found, locked, full, banned, waiting), Room (empty, preparing, buffering, playing, paused, controls hidden, each menu, subtitle settings, shortcuts help, fullscreen, host/guest/co-host, 1 and 6 participants, camera on/off, sidebar hidden, People tab, reaction burst), Diagnostics, 404, crash/error boundary, every modal/popover/toast/bottom sheet.
2. Screenshot all of it with Playwright (installed Chrome, channel `chrome`) at 1920, 1440, 1024, 768, 412, 360 and landscape 844×390 into `docs/audit/`.
3. Write `docs/audit/REPORT.md` with: (a) design inconsistencies (radii, font sizes, spacing, icon sizes/stroke, button styles/heights, glass recipes, colours, shadows, copy tone) counted with file:line; (b) visual/UX bugs (overflow, clipping, misalignment, overlap, flicker, layout shift, z-index conflicts, double scrollbars, low contrast over video, missing focus rings, duplicate ids, duplicate components); (c) console errors/warnings grouped by message with counts per page and their root causes; (d) dead/duplicate CSS and components; (e) banned-list violations; (f) security review findings (see §9); (g) performance baseline (Lighthouse, CLS, long tasks, bundle sizes per route, dropped frames with glass over video); (h) status of every item in §1.2/§1.3 (works / broken / missing).
4. Propose the exact order of work and risks. **STOP for my approval.**

---

## 4. PHASE 1 — DESIGN SYSTEM (single source of truth) → STOP

Create `docs/design-system.md` and implement it as CSS variables + Tailwind theme. Delete all other ad-hoc values and any old theme/brand variables once nothing imports them.

### 4.1 Tokens
- **Colour (dark, neutral graphite, not blue-tinted):** `--bg #09090b`; `--surface-1 rgba(255,255,255,.04)`; `--surface-2 rgba(255,255,255,.08)`; `--line rgba(255,255,255,.09)`; `--text #f5f5f7`; `--text-2 rgba(245,245,247,.66)`; `--text-3 rgba(245,245,247,.42)`. Status only: success `#5fd68a`, warning `#f5b84b`, danger `#ff6b6b`. Primary action = near-white pill with near-black text. No decorative accent.
- **Ambient light** (the only colour on non-video pages): two large blurred desaturated fields (about `rgb(70,78,150)` and `rgb(150,86,62)`) at ≤ 0.35 effective opacity, drift ≥ 40 s (off with reduced motion), 5% film grain. In the Room the colours come from the playing video (8×4 canvas, every 700 ms, desaturated and dimmed, skipped silently when the canvas is tainted or the tab hidden).
- **Typography:** Geist + Geist Mono, self-hosted (`@fontsource-variable`), preload the primary weight, `font-display: swap`; Devanagari/Telugu fallbacks (Noto Sans Devanagari/Telugu). Scale (px): 12, 13, 14, 16, 18, 22, 28, 36, 48, 64. Weights 400/500/600 only. Line-height 1.2 (headings), 1.5 (body). Letter-spacing −0.02em at ≥ 28 px. Sentence case. Tabular numerals for time/counters. Mono only for timecodes and room codes.
- **Space (4 px base):** 4, 8, 12, 16, 20, 24, 32, 40, 56, 80, 120. **Radii:** 10 (inputs), 16 (buttons in cards, tiles), 24 (panels, stage), 32 (large cards), 999 (pills). Inner radius = outer radius − padding.
- **Icons:** Lucide only, stroke 1.6, sizes 16/18/20/24, always passed explicitly. Icon and label share one centre line. Playwright check: fail on any svg < 12 px or > 48 px.
- **Motion:** 150/200/300 ms, easing `cubic-bezier(.22,.9,.3,1)`, animate only `transform` and `opacity`; one entrance pattern (fade + 8 px rise); reduced motion disables everything except opacity.
- **Elevation:** no coloured shadows. Solid surfaces: 1 px border + `0 18px 50px -14px rgba(0,0,0,.6)`.
- **Breakpoints:** one shared constant: mobile < 900 px, desktop ≥ 900 px; landscape-phone special case `(orientation: landscape) and (max-height: 500px)`.
- **Z-index scale** (tokens, no magic numbers): base 0, stage 1, overlays 10, controls 20, menus 30, sheets 40, modals 50, toasts 60.

### 4.2 Liquid-glass recipe (one implementation: `<GlassSurface level="thin|regular|thick">`)
```css
.glass{position:relative;isolation:isolate;background:var(--glass-bg);
  -webkit-backdrop-filter:blur(var(--glass-blur)) saturate(150%);backdrop-filter:blur(var(--glass-blur)) saturate(150%);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.14),inset 0 0 0 1px rgba(255,255,255,.06),0 18px 50px -14px rgba(0,0,0,.6)}
/* thin: bg rgba(30,30,36,.38) blur 20px · regular: .52 / 32px · thick: .72 / 44px */
.glass::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;pointer-events:none;
  background:conic-gradient(from 210deg,rgba(255,255,255,.5),rgba(255,255,255,.06) 20%,rgba(255,255,255,.03) 50%,rgba(255,255,255,.34) 74%,rgba(255,255,255,.06) 90%,rgba(255,255,255,.5));
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
```
Rules: glass only on floating layers (nav, control bar, menus, popovers, toasts, sheets, modals, sidebar panel, sync pill, cards on ambient pages); never glass-in-glass except menu-over-control-bar; at most two backdrop-filter layers over playing video; no pointer-following light over video (optional sheen only on landing/create/join cards); SVG-displacement refraction only as a Chromium-only, feature-detected enhancement on non-video surfaces. Fallbacks (tested): no `backdrop-filter` → opaque `rgba(30,30,36,.94)`; `prefers-reduced-transparency`, `prefers-contrast: more`, `forced-colors` → solid surfaces with visible borders. Text on glass must pass WCAG AA against the worst backdrop (bright video frame); add an inner dark tint where needed and verify with sampled pixels.

### 4.3 Components (one implementation each; states: default, hover, active, focus-visible, disabled, loading, error)
Button (primary, secondary, ghost, danger, icon), Input/Field (label, hint, error), Switch, Segmented control (sliding indicator), Tabs, Slider (visible 4 px track, filled part, thumb, keyboard), Select/Menu, Popover, Modal (focus trap), Bottom sheet (grabber, swipe-down, focus trap), Toast (stack, auto-dismiss, aria-live), Tooltip, Badge/Tag, Avatar, Participant tile, Progress, Dropzone, Code input (6 boxes, paste, arrows, backspace), Empty state, Skeleton, Error screen, Keyboard-shortcuts dialog.

### 4.4 Living style guide
Dev-only route `/design-system` (excluded from production builds) rendering every component in every state over the ambient background AND over a bright video frame and a dark one. Screenshots become the visual-regression baseline. **STOP for approval with these screenshots.**

---

## 5. PHASE 2 — APPLY THE SYSTEM, PAGE BY PAGE

Order: Room desktop → Room mobile → Create → Join → Landing → waiting/locked/denied/banned/404/error → Diagnostics → modals/toasts everywhere. For each page: replace ad-hoc styles with tokens/components, delete dead CSS, fix the page's audit bugs, re-shoot, compare to the previous screenshots, list every remaining difference and fix it (minimum two rounds).

### 5.1 Landing
Left-aligned hero with plain one-line value ("Watch movies together, even when you're apart"), two buttons (Create a room, Join with a code), an accurate product mock built from the REAL components, three steps, honest privacy facts (no accounts; file deleted when the room ends; video and voice between browsers; use videos you may share), footer. Floating glass nav pill, soft ambient, nothing else decorative. Copy has no hype and no claim the product can't prove (every claim maps to a tested feature).

### 5.2 Create
Single glass card on ambient. Name (required), room name (optional), movie dropzone (drag/drop/browse; MP4/MKV/WebM/MOV up to 5 GB; MKV shows "Will be converted for browsers"; >5 GB rejected with a clear message), switch "Guests can play, pause and skip" (default on), optional room password and "Approve new people" toggles. Preparing panel with REAL progress through four stages (Uploading → Analyzing → Converting/Packaging → Ready), file name, size, ETA, Cancel (actually cancels and cleans up), then invite link (public URL) with Copy and "Enter the room".

### 5.3 Join
Six code boxes (paste, auto-advance, uppercase, unambiguous alphabet), name field, real room lookup with honest errors (not found, ended, locked, full, banned, network), password step if set, waiting-room screen when approvals are on ("Waiting for the host to let you in" with Cancel), no leakage of room details before admission.

### 5.4 Room — desktop (≥ 900 px)
Top glass pill (logo, room name, Host tag, live sync state, Invite, people count, sidebar toggle, settings, leave). Stage fills the available height with the video directly (no frame-in-frame), dark scrims, floating glass control bar, subtitle layer above controls. Sidebar = ONE glass panel: video-call tiles (real streams, host badge, muted icon, speaking ring, connection bars, initials when camera off), Mic/Camera buttons, tabs (Chat/People) with sliding indicator, chat bubbles + centered activity lines, composer.
Control bar (single source of truth for ids/labels): seek bar (buffered range, hover time tooltip, drag, keyboard; visible track), play/pause, −10 s, +10 s, volume (slider on hover), time, audio, subtitles (with Subtitle settings), quality, speed, zoom (Fit / Fill 21:9 = 1.34× / Stretch), reactions, faces toggle, PiP, shortcuts help, fullscreen. 3 s idle fade while playing (always visible when paused or a menu is open). No big centre overlays during playback; ±10 s and volume feedback is a small pill near the top centre of the stage.

### 5.5 Room — mobile (< 900 px) — exact structure
```
safe-area top
Top bar 52px        logo | room name… | Host | 👥 n | ⋯
STAGE  100% width, aspect-ratio 16/9, max-height 40dvh (container-type:size)
Tabs bar 48px       Call | Chat | People
Tab panel flex:1    min-height:0, scrolls; composer pinned at its bottom
safe-area bottom
```
```css
@media (max-width:899px){
 html,body{height:100%;max-width:100%;overflow:hidden}
 .room-shell{height:100dvh;display:grid;grid-template-rows:var(--topbar-h) auto minmax(0,1fr);gap:8px;
   padding:max(8px,env(safe-area-inset-top)) max(8px,env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-left));overflow:hidden}
 .main{display:contents}
 .stage{grid-row:2;width:100%;aspect-ratio:16/9;max-height:40dvh;container-type:size;border-radius:18px}
 .mobile-tabs-area{grid-row:3;min-height:0;display:flex;flex-direction:column}
 .tabs-panel{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain}
 .composer{position:sticky;bottom:0;padding-bottom:env(safe-area-inset-bottom)}
}
```
- Render exactly ONE sidebar implementation (conditional rendering by `useMediaQuery`, not `display:none`); shared child components so streams/tiles/sockets are never mounted twice. `landscape-drawer-toggle` exists only in landscape phones.
- Empty state adapts to the STAGE via container queries (`@container (max-height:300px)`: icon 40 px, title 18 px, hide long text, "Choose a file" and "Try a sample" side by side at 44 px height). Nothing inside the stage may overflow it. The sample button exists only in development builds.
- Controls: seek (36 px touch target), play/pause 44 px, ±10 s, compact time, ⋯ opens a bottom sheet (Audio, Subtitles, Subtitle settings, Quality, Speed, Zoom, Reactions, PiP, Shortcuts), fullscreen. Tap video toggles controls; double-tap left/right third seeks ∓10 s (respect `allowGuestControl`).
- Viewport meta: `width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content`; `--vvh` from `visualViewport` as an iOS keyboard fallback; inputs ≥ 16 px.
- Fullscreen: Android `stage.requestFullscreen()` + try landscape lock; iPhone: pseudo-fullscreen (`position:fixed; inset:0; height:100dvh`) with an exit button, plus an option for native `webkitEnterFullscreen`.
- Landscape phone (height < 500): stage fills the screen; tabs area becomes a right slide-over. Tablets 600–899: stacked, stage max-height 45dvh.
- Bottom sheets: glass, top radius 20, grabber, ≤ 70% viewport (55% for subtitle settings), swipe-down/backdrop/Escape closes, focus trapped and returned.

### 5.6 Other screens
Locked room, denied, banned, ended room, 404, crash screen (error boundary with "Reload" and "Back home"), Diagnostics (server health, storage, ffmpeg, tunnel, disk, cleanup totals), all with the same components.

---

## 6. PHASE 3 — FEATURES (verify status first; implement only what is missing/broken; each as its own PR-sized commit series)

### 6.1 Media quality and smooth playback (highest priority)
**Diagnose:** ffprobe the original vs what is served (codec, profile, bit depth, resolution, fps, bitrate, pixel format, colour range); log the exact ffmpeg commands; in the browser report `videoWidth/Height`, `getVideoPlaybackQuality()`, hls.js `levels/currentLevel/autoLevelEnabled/capLevelToPlayerSize`, CSS size and `devicePixelRatio`; extract the same frame from the original and from the player (canvas at native size) and compute SSIM/PSNR; save images in `docs/quality/`. Root cause goes in PROGRESS.md before fixing.
**Fix, in this order of preference:**
1. Direct play / remux (`-c copy`) when the source is browser-safe H.264 (High ≤ 4.2, 8-bit, yuv420p) and AAC; other audio (AC3/EAC3/DTS) → AAC 192–256k.
2. Encode only when needed (HEVC, 10-bit, bad profile): `libx264 -crf 18 -preset veryfast -profile:v high -level 4.2 -pix_fmt yuv420p`, or `h264_videotoolbox` WITH an explicit bitrate derived from the source (clamp(src×0.9, 6M, 14M), maxrate 1.5×, bufsize 2×); keep resolution/fps; tag BT.709; tone-map HDR/DV to SDR properly.
3. HLS fMP4, 4 s segments, forced keyframes at boundaries, event playlist while packaging → VOD, playback starts from the first segments.
4. Player (hls.js): `capLevelToPlayerSize:false`, start at the highest level the quick bandwidth probe allows, step down only after real stalls, recover upward; no CSS scaling except the user's zoom.
5. Serving: streamed Range responses (206), correct MIME, ETag, immutable caching for finished segments, no gzip on media, nothing buffering Range through the tunnel.
6. Per-viewer "Quality" readout ("1080p · 8.2 Mbps · Direct play/Converted"); background-generated 720p and 480p renditions (skipped if ≥ source), per-viewer Quality menu (Auto/1080p/720p/480p, only real options); timeline stays shared.
7. Host Network check: measured upload through the public URL and an honest message ("supports ~N viewers at 1080p").
**Acceptance:** SSIM vs original ≥ 0.97 for direct play (identical) / ≥ 0.93 for encoded on 5 sampled frames; `videoHeight===1080` windowed and fullscreen on desktop in Auto with a good probe; local first frame < 2 s, seek-resume < 1.5 s median, zero stalls in a 10-minute 3-viewer run; report tunnel results honestly with my upload speed.

### 6.2 Audio languages and subtitles (like IINA)
Track manifest from ffprobe; HLS with one audio rendition per source track (LANGUAGE/NAME/DEFAULT), WebVTT for text subtitles, image-based tracks listed disabled as "not supported". Menus show clean names via `Intl.DisplayNames` (never the file's junk title like "1Vegamovies.tw…"), duplicates "(2)", default track checked, "This file has one audio track" when single. Choices are per viewer, never synced, remembered per room. Switching audio never restarts or desyncs (drift < 120 ms after). Fixtures: generated 3-audio (440/880/1320 Hz) + 2 text + 1 image subtitle video. Test by dominant-frequency analysis per viewer.

### 6.3 Subtitles layer and settings (keep working)
Custom layer above the control bar (never covered), text-only with transparent background by default (Background default None, edge default Outline, colour White), settings: size 60–220%, position (buttons/slider/drag while the panel is open), background, colour, edge, delay −5…+5 s, reset; dock the panel on the right of the stage (bottom sheet on mobile) so the subtitle stays visible; no drag box/hint outside the settings panel; sanitise cue text (no HTML injection). Per viewer, persisted with a versioned localStorage key.

### 6.4 Keyboard and gestures
Global handler on `window` (capture): ←/→ ∓10 s, Shift+←/→ ∓30 s, ↑/↓ volume ±5%, Space/K play-pause, J/L ∓10 s, F fullscreen, M mute, C subtitles, V faces, `[`/`]` subtitle size, Home/End, 0–9 jump, Enter opens chat composer overlay in fullscreen, Escape closes. Ignore inside text inputs/dialogs; ignore with Cmd/Ctrl/Alt held; `preventDefault` for handled keys; same seek action as the buttons (sync + `allowGuestControl`); blur clicked buttons so Space doesn't re-trigger; shortcuts dialog (?).

### 6.5 Sync, buffering and resume
Authoritative sync with drift tiers, `version` counters, no visible countdown overlay (removed on purpose). After seek/stall/join: everyone pauses while someone is behind, a small top pill "Waiting for Maya…" (never covers the video centre) with host "Continue without Maya", then resume together with a ≤ 300 ms scheduled lead. Median drift < 120 ms, p95 < 250 ms.

### 6.6 Roles, locking, approvals, bans, host transfer (server-enforced)
Roles host/co-host/guest. Co-host can kick, ban/unban, lock, approve/deny, toggle guest control, change movie. Only host promotes co-hosts, transfers host, ends the room, sets/removes the password (scrypt/argon2 hash). Host leaving transfers to the longest-present co-host, else guest, with a 30 s grace after disconnects; the room (and media) lives until everyone leaves, the host ends it, or the server stops. Lock room; approval waiting room (Admit/Deny/Admit all, 5-minute expiry, deny cooldown 30 s ×3); kick/ban (sessionId + salted IP hash; honest text that VPN/new device bypasses); generic join errors, per-IP and per-code rate limits, 60 s lockout after 10 failures; system chat lines for all events. Waiting/denied/banned people receive no room data, no media URLs, no signaling.

### 6.7 Chat
Unread badge (tab, sidebar toggle, document title), typing indicator (throttled, expires), replies with quoted snippet and jump, movie-time chip per message (click seeks if allowed; typed timestamps clickable), zod validation (≤ 500 chars), rate limit (5/5 s), text-node rendering only, safe linkify (`rel="noopener noreferrer"`), optional soft sound (off by default), real empty state, no empty author chips.

### 6.8 Faces and chat over fullscreen
Fullscreen on the STAGE element. Glass strip of small participant tiles over the video (S/M/L, draggable, snaps to corners, remembered), max 6 + "+N", V toggles, 40% opacity when idle, never overlaps controls/subtitles; transient glass chat bubbles (max 3, fade 6 s); reactions visible. At most two glass layers over video; if dropped frames exceed the glass-off baseline by > 1%, reduce blur.

### 6.9 Calls
Real MediaStreams in tiles, host badge, mic-muted icon, quality bars from `getStats()`, speaking ring from analyser levels, camera-off initials; no demo clones; reconnection without offer glare; TURN/STUN from `.env` (document a free TURN option); echo-friendly defaults (`echoCancellation`, `noiseSuppression`).

### 6.10 Cleanup and lifecycle
When a room ends, everything for it is deleted: original, chunks, HLS segments/playlists, renditions, subtitles, thumbnails, scratch files, DB rows; cancel ffmpeg jobs first; also on host-delete/replace movie, SIGINT/SIGTERM, and a startup sweep for orphans. Logs record path and bytes. Tests prove empty directories after each path.

### 6.11 Later (only after everything above passes; separate approval)
Paste-a-link sources (YouTube/Vimeo/direct URL via official players; SSRF-safe URL validation; no server fetching) and an optional "Cineva Companion" extension that only syncs play/pause/seek of a service the viewer plays on their own account (never captures or relays video/audio).

---

## 7. RELIABILITY

Error boundaries per route and for the room's major regions; socket reconnect with backoff and a visible "Reconnecting…" state; idempotent join (React StrictMode safe, one participant per `sessionId`, replace-not-append on reconnect); unmount cleanup (sockets, peer connections, observers, intervals, object URLs, canvas sampling); graceful server shutdown (flush, cleanup, stop tunnel and `caffeinate`); crash-safe startup sweep; memory soak (10 minutes with 3 viewers: no unbounded growth in server RSS or tab heap); no unhandled promise rejections; consistent loading skeletons and timeouts with retry UI.

---

## 8. SECURITY AND PRIVACY (the tunnel makes the app public)

1. **Validate everything on the server** with zod (socket payloads, REST bodies, query params, file metadata); reject unknown fields; cap sizes.
2. **AuthZ on the server** for every action (play/pause/seek, kick, ban, lock, transfer, change movie, end room); negative tests with crafted socket events.
3. **Rate limits:** room creation, join attempts, uploads, chat, reactions, typing; use `CF-Connecting-IP` only when the request arrives through the tunnel; limits on concurrent rooms (default 3), total disk (default 20 GB or free-disk based), per-file size (5 GB).
4. **Uploads:** check magic bytes/ffprobe (not just the extension), random server-side filenames, no path traversal (`path.resolve` + prefix check), content-type allowlist, isolated upload directory, cleanup of partials.
5. **HTTP hardening:** `helmet` with a CSP that allows only what's needed (fonts self-hosted, no inline scripts, `connect-src` for the same origin and sockets, `media-src` self/blob), `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, `Permissions-Policy` (camera/mic self), strict CORS (tunnel origin allowlist, no `*` with credentials), no stack traces to clients.
6. **Output safety:** all user text rendered as text nodes; sanitise subtitle cues; escape in logs; safe linkify.
7. **Secrets and privacy:** no secrets in the repo; `.env.example` only; logs contain no chat text, IP addresses in plain text, or file contents; room codes from an unambiguous high-entropy alphabet; password hashes with scrypt/argon2; SSRF-safe URL handling for future link sources.
8. **Dependencies:** `npm audit` triaged, lockfile committed, no unused packages, pinned versions for CDN-free build.
9. **Tunnel:** document that anyone with the link can reach the server; the lock/approval/password features are the access control; show a banner in diagnostics when the tunnel is active.

---

## 9. PERFORMANCE BUDGET

Landing/Create/Join: Lighthouse performance ≥ 90, LCP < 2.0 s on a mid laptop profile, CLS < 0.02, TBT < 150 ms. Room route lazy-loaded; initial JS per route reported (target < 220 KB gzip for landing, room < 450 KB gzip excluding hls.js, loaded on demand). Fonts preloaded and subset; no layout shift on font load. Glass cost: dropped video frames with overlays must be within 1% of the glass-off baseline. Server: media serving CPU < 10% during direct-play streaming to 3 viewers on the M-series Mac.

---

## 10. ACCESSIBILITY AND INTERNATIONAL TEXT

axe-core: zero serious/critical on every page/state. Full keyboard operation; focus trapped in dialogs and sheets and returned on close; visible 2 px `:focus-visible` rings; ARIA for sliders, tabs, menus, live regions (toasts, waiting status, chat). Contrast AA including text on glass over worst-case frames (sampled). Respect `prefers-reduced-motion`, `prefers-reduced-transparency`, `prefers-contrast`, `forced-colors`. Touch targets ≥ 44 px on touch. Correct rendering of Hindi/Telugu text in subtitles and chat (font fallbacks, no tofu), `lang` attributes, no truncation of long names (ellipsis with title tooltip).

---

## 11. TEST STRATEGY AND QUALITY GATES

**Layers:** unit (parsers, clamps, sanitisers, sync math, permission rules), integration (server routes/sockets with real ffmpeg on generated fixtures), e2e (Playwright, installed Chrome `channel:'chrome'`, fake media flags `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --autoplay-policy=no-user-gesture-required`, separate contexts per user), visual regression (baseline screenshots, `maxDiffPixelRatio 0.01`), performance (Lighthouse + traces + `getVideoPlaybackQuality`), soak (10 min × 3 viewers), security negatives, cross-browser (Chromium, WebKit, Firefox on desktop; Pixel 9, iPhone 15 emulation).
**Fixtures** (generated by `scripts/make-fixtures.mjs`): MP4 H.264/AAC; MKV with 3 audio tones + 2 text subtitles + 1 image subtitle; HEVC MKV; 1080p high-bitrate test pattern with frame counter for sharpness/SSIM; corrupted file. Never real movies.
**Gates (all must pass; report numbers; never hide a failure):**
1. Console: zero errors/warnings from our code on every page/state (Playwright guard fails on `console.error`, `pageerror`, unexpected `console.warn`).
2. Layout: no horizontal overflow 320–2560; every child inside its container; no overlapping interactive elements; no duplicate ids; one sidebar mounted; stage ratio correct (mobile 16:9, ≤ 40dvh).
3. Stability: CLS < 0.02; no flash of fallback font; no glass flicker across 20 route changes; no scroll jank (long tasks < 50 ms).
4. Sync: median drift < 120 ms, p95 < 250 ms across play/pause/seek/rate/join/reload/camera events with host + 2 guests; seek-resume < 1.5 s locally.
5. Media: quality acceptance in §6.1; audio-language frequency test; subtitles visible above controls with and without controls; cleanup leaves directories empty in all five exit paths.
6. Calls: all peer connections `connected`; 60 s of `getStats()` shows RTT < 150 ms locally, loss < 1%; mute/camera toggles, peer reload, simultaneous joins without glare.
7. Permissions/security: crafted-event negatives rejected; waiting/banned users receive nothing; rate-limit and lockout tests; upload traversal/magic-byte tests; CSP active with no violations.
8. Accessibility: axe zero serious/critical; keyboard-only flows; contrast checks; reduced-motion/transparency/contrast emulation.
9. Responsive: mobile acceptance (scrollWidth ≤ innerWidth; targets ≥ 44 px; composer above keyboard; double-tap seek; rotation without reload) at 412×915, 393×852, 360×640, 320×568, 844×390, 768×1024.
10. Visual: baselines for every page/state/size committed; consistency scan fails on computed values outside the token set (radii, font sizes, icon sizes, colours).
11. Performance: budgets in §9 met.
12. `typecheck`, `build`, unit, integration, e2e, visual: all green with real output pasted.

---

## 12. GIT, DOCS AND HANDOFF

- Branching: `feature/ui-polish` from the current branch; keep `chore/pre-*` snapshot branches as rollbacks; conventional commit messages.
- `docs/PROGRESS.md`: dated entries (what, why, evidence, next); sections: "Root causes", "System changes made on this machine" (with undo commands), "Old code still in use", "Known limitations", "Next steps" (so a new session can resume).
- Docs: `docs/design-system.md`, `docs/screenshots/**`, `docs/quality/**`, `docs/audit/REPORT.md`, `docs/manual-test-checklist.md` (real devices, real tunnel, real friends: how to measure upload bandwidth and what it supports), `README.md` ("Movie night in 5 steps" for macOS, troubleshooting: ffmpeg, cloudflared, ports, Chrome autoplay, TURN, DNS).
- Remove dead code and unused dependencies; no TODO/FIXME left behind; no commented-out blocks.

---

## 13. EXECUTION ORDER AND STOP POINTS

1. Phase 0 audit → **STOP**.
2. Phase 1 design system + `/design-system` → **STOP**.
3. Phase 2 per page (Room desktop → Room mobile → Create → Join → Landing → other screens → modals) with before/after screenshots per page → **STOP after Room desktop+mobile**, then after the rest.
4. Phase 3 features in this order: 6.1 media quality → **STOP**; 6.2 audio/subtitles; 6.5 sync/buffering; 6.6 roles/lock/bans; 6.7 chat; 6.8 faces overlay; 6.9 calls; 6.10 cleanup (verify), each with tests → **STOP** after each pair.
5. §7–§11 gates run continuously; final gate run and report → **STOP** for final approval.

**Do not call any phase finished while a gate for it fails.** Report failures plainly with the evidence and a proposed fix.
