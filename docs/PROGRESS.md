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
