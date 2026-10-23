# Cineva — Security & Hardening Audit Report

This report outlines the **security measures implemented**, threat mitigation controls, secret management policies, and **known security limitations** of **Cineva**.

---

## 1. Authentication & Session Model

- **Session Identification**: Cineva issues cryptographically random, collision-resistant 128-bit session identifiers (`sessionId`) generated via `nanoid` on client initialization.
- **Host Session Token**: When a user creates a room, their `sessionId` is recorded as `hostSessionId` in the database.
- **Stateful Verification**: Every state-changing request (play, pause, seek, rate change, settings edit, kick participant, end room) requires passing the user's `sessionId`.
- **No Third-Party Cookies / Credentials Leakage**: Cineva does not store sensitive PII (Personally Identifiable Information), passwords, or third-party OAuth tokens in client cookies.

---

## 2. Authorization & Permission Model

- **Server-Authoritative Enforcement**: Host privileges are verified against the database record (`room.hostSessionId === sessionId`) on the server before executing any command. Client-side claims are **never** trusted.
- **Guest Control Lock**: By default, guest playback control commands are rejected by the server (`Only the host can control playback`). The host must explicitly toggle `allowGuestControl: true` in room settings to allow guests to control playback.
- **Host Moderation**: Only the verified host can kick participants, edit the media title, toggle room settings, or end the room for all connected clients.

---

## 3. Media Upload Security

- **Extension Whitelisting**: Uploads are validated against a strict whitelist of safe video extensions (`.mp4`, `.webm`, `.mkv`, `.mov`, `.ogg`, `.ogv`).
- **MIME Type Inspection**: Content types are validated against allowed video MIME types (`video/mp4`, `video/webm`, `video/x-matroska`, `video/quicktime`, `video/ogg`).
- **Filename Sanitization**: Uploaded filenames are stripped of control characters, directory traversal markers (`../`), and special symbols. Filename length is capped at 80 characters.
- **Path Traversal Protection**: File paths are strictly bound to designated media storage paths. Any storage key attempting path escape is rejected with a `403 Access Denied`.
- **Storage Key Isolation**: Each uploaded file is assigned a unique storage key structured as `media/{roomId}/{timestamp}_{sanitizedFilename}`, keeping tenant media isolated.
- **File Size Limits**: Maximum video upload size: 5 GB per file (5,368,709,120 bytes, configurable via `MAX_FILE_SIZE_MB=5120`). Disk streaming and pre-signed direct S3 uploads prevent server RAM exhaustion.

---

## 4. WebSocket & Realtime Security

- **Event Validation**: Every incoming Socket.IO payload is validated against strict Zod schemas (`JoinRoomSchema`, `SendChatMessageSchema`, `SeekPayloadSchema`, `RatePayloadSchema`). Malformed payloads are discarded instantly.
- **No Media Data over Sockets**: Large video binary data **never** travels across WebSocket connections; WebSockets handle lightweight control events exclusively.
- **Chat Sanitization**: User-submitted chat messages are sanitized using `sanitizeHtml` to strip embedded `<script>`, `<iframe>`, and malicious HTML attributes before broadcasting.
- **Chat Rate Limiting**: Per-socket rate limiting throttles user messaging to a maximum of 5 messages per 3 seconds.

---

## 5. Network & Infrastructure Defenses

### CORS (Cross-Origin Resource Sharing)
- In production (`NODE_ENV=production`), wildcard `*` origins are strictly rejected.
- HTTP requests and WebSocket upgrade handshakes validate incoming `Origin` headers against the explicit `ALLOWED_ORIGINS` / `CLIENT_URL` whitelist.

### Content Security Policy (CSP) & Security Headers
Configured via `helmet`:
- **Content-Security-Policy**: Restricts resources to trusted origins (`default-src 'self'`, `script-src 'self' 'unsafe-inline'`, `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`, `connect-src 'self' ws: wss: http: https:`).
- **Strict-Transport-Security (HSTS)**: Forces HTTPS in production (`max-age=31536000`, `includeSubDomains`).
- **X-Content-Type-Options**: `nosniff` prevents MIME-type sniffing.
- **X-Frame-Options**: `SAMEORIGIN` prevents clickjacking framing attacks.
- **Referrer-Policy**: `strict-origin-when-cross-origin`.

### Rate Limiting
- **Global API Rate Limiter**: 1,000 requests per 15 minutes per IP.
- **Room Creation Limiter**: 30 rooms per 10 minutes per IP (prevents room code spamming).
- **Media Upload Limiter**: 30 uploads per 15 minutes per IP.

---

## 6. Secret Management

- **Zero Tracked Secrets**: Scanned codebase and verified zero database passwords, AWS secret access keys, or private tokens exist in tracked repository files.
- **Environment Separation**: Public variables compiled into the client bundle are prefixed with `VITE_` (`VITE_API_URL`, `VITE_SOCKET_URL`). Server-only credentials (`DATABASE_URL`, `SESSION_SECRET`, `S3_SECRET_ACCESS_KEY`) remain strictly confidential on the backend.
- **Frontend Bundle Audit**: Inspected built production bundle (`apps/web/dist/assets/*.js`) to verify server secrets do not exist in client JavaScript.

---

## 7. Known Security Limitations

While substantial security controls are in place, administrators should be aware of the following design limitations:

1. **Unauthenticated Watch Parties**: Cineva is designed as an open private watch-party platform without forced user account registration. Anyone with a valid 6-character room code can join the room unless max capacity is reached.
2. **S3 Direct Upload Permissions**: Pre-signed S3 upload URLs grant temporary PUT access to a specific storage key for 15 minutes. Bucket CORS policies must be explicitly restricted to the production frontend domain.
3. **In-Memory Rate Limiting**: Default rate limiters use in-memory stores. If running multiple backend instances behind a load balancer without Redis, rate limits are enforced per instance rather than globally across the cluster.
