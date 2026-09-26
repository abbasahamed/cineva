# CINEVA STABLE BASELINE REPORT

**Baseline Date:** September 26, 2026  
**Tag Name:** `cineva-stable-pre-video`  
**Backup Branch:** `backup/cineva-stable-pre-video`  
**Target Branch:** `main`  

---

## Verification Status

| Check | Result | Details |
| :--- | :---: | :--- |
| **Typecheck** | **PASS** | `npm run typecheck` passed (0 errors across `@syncwatch/shared`, `@syncwatch/server`, `@syncwatch/web`) |
| **Unit & Integration Tests** | **PASS** | `npm test` passed (11 test files, 105 tests all passing: 80 server + 25 web) |
| **Production Build** | **PASS** | `npm run build` passed (Vite + TS compilation clean) |
| **Security Audit** | **PASS** | Zero CRITICAL, zero HIGH vulnerabilities, regression test suite verified |
| **Working Tree** | **CLEAN** | Sealed in git commit and tagged checkpoint |

---

## Major Features Frozen in this Baseline

1. **Synchronized Video Playback:**
   - Server-authoritative playback engine ([syncEngine.ts](file:///Users/abbas/Desktop/untitled%20folder/apps/server/src/services/syncEngine.ts))
   - Accurate duration formatting and boundary clamping
   - Timeline seeking with 350ms seek coalescing
   - Forward (+10s) and Rewind (-10s) controls
   - Dual-threshold drift correction (<0.3s tolerance, speed throttling 0.3s-1.5s, hard seek >1.5s)
   - NTP time offset calculation for clock skew compensation

2. **Cinema Chat & Activity Integration:**
   - Unified real-time room communication via Socket.IO
   - Participant join/leave system notices
   - Playback activity (play, pause, seek, forward, rewind) directly inside Cinema Chat
   - Server-resolved identity attribution preventing impersonation
   - Strict XSS escaping (`sanitizeHtml`) and React plain-text node rendering

3. **Room Authorization & Roles:**
   - Cryptographically secure 6-character room codes (`customAlphabet` without ambiguous `0, 1, I, O`)
   - Host vs Guest permission checks
   - Dynamic `allowGuestControl` toggle
   - Reconnect resilience without identity duplication

4. **Media Pipeline & Transcoding:**
   - 5 GB maximum upload limits enforced server-side
   - Whitelist validation for MP4, WebM, MKV, MOV, OGG
   - Automatic container and codec analysis via `ffprobe`
   - Fast remux/stream copy for compatible streams
   - Audio-only transcoding when video stream is browser-compatible
   - Hardware-accelerated video transcoding (Apple VideoToolbox / libx264)
   - Pre-flight disk capacity checks and automatic temporary file cleanup
   - HTTP 206 Partial Content byte-range streaming for seamless scrubbing

5. **Security Hardening:**
   - Production Helmet headers (CSP, HSTS, X-Content-Type-Options)
   - Strict CORS origin validation
   - Dedicated rate limiting on room creation and room joining
   - Child process argument array execution preventing shell injection

---

## Exact Rollback Instructions

To restore the repository to this exact stable checkpoint at any time:

```bash
# Option 1: Switch directly to the backup branch
git switch backup/cineva-stable-pre-video

# Option 2: Hard reset current branch back to the tagged checkpoint
git switch main
git reset --hard cineva-stable-pre-video
```
