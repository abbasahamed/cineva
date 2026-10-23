# Cineva — Production Architecture & Deployment Guide

This document specifies the technical architecture, deployment topology, data flows, security boundaries, and scaling strategy for **Cineva**.

---

## 1. Executive Architecture Summary

Cineva implements a **decoupled, server-authoritative watch-party architecture**:
- **Control Plane**: Lightweight, real-time WebSocket protocol (`Socket.IO`) responsible exclusively for playback synchronization, NTP clock alignment, presence, and chat.
- **Data Plane**: Direct HTTP/HTTPS byte-range streaming (`HTTP 206 Partial Content`) via local disk or cloud object storage (`AWS S3`, `Cloudflare R2`, `MinIO`). Large media payloads **never** pass through WebSocket channels.

```
                           ┌───────────────────────────┐
                           │   Browser / Client        │
                           └──────┬─────────────┬──────┘
                                  │             │
                Media HTTP Stream │             │ Socket.IO Real-time Events
          (206 Range Byte Chunks) │             │ (Play, Pause, Seek, NTP Sync, Chat)
                                  ▼             ▼
              ┌─────────────────────┐       ┌──────────────────────┐
              │ Cloud Object Store  │       │ Cineva Node.js    │
              │  (AWS S3 / R2)      │       │ Authoritative Server │
              └─────────────────────┘       └──────────┬───────────┘
                                                       │
                                                       │ Prisma ORM
                                                       ▼
                                            ┌──────────────────────┐
                                            │ Database             │
                                            │ (PostgreSQL / SQLite)│
                                            └──────────────────────┘
```

---

## 2. Development vs. Production Topology

| Concern | Development Environment | Production Environment |
| :--- | :--- | :--- |
| **Frontend Serving** | Vite Dev Server (`:5173`) with HMR & API Proxy | Pre-built static SPA (`dist/`) hosted on CDN (Vercel, Netlify, Cloudflare Pages, S3+CloudFront) |
| **Backend Runtime** | `tsx watch` on Node.js (`:4000`) | Compiled Node.js runtime (`node dist/index.js`) on long-lived instances (Railway, Render, Fly.io, ECS, EC2) |
| **Database** | SQLite (`file:./dev.db`) | PostgreSQL (Supabase, Neon, AWS RDS) via `DATABASE_URL` |
| **Media Storage** | `LocalMediaStorage` (`./uploads`) | `S3MediaStorage` (AWS S3, Cloudflare R2, MinIO) with pre-signed PUT and byte ranges |
| **CORS Policy** | Permissive for `localhost:5173`, `127.0.0.1` | Strict domain validation against `ALLOWED_ORIGINS` / `CLIENT_URL` (wildcard `*` disabled) |
| **Security Headers** | Basic CORS | Full Helmet CSP, HSTS (`max-age=31536000`), X-Content-Type-Options, X-Frame-Options |
| **Logging** | Console logging | Structured JSON logs with automated token and secret redaction |

---

## 3. Real-Time Synchronization Architecture

### Clock Synchronization (NTP Protocol)
Client device clocks vary significantly due to local skew and timezone differences. Cineva establishes a continuous authoritative time reference:
1. Client transmits `sync:ping` containing monotonic timestamp $T_1 = \text{performance.now()}$.
2. Server responds with `sync:pong` with monotonic timestamp $T_2$ and server wall-clock $T_{\text{server}}$.
3. Client receives response at $T_3 = \text{performance.now()}$.
4. Round-Trip Time:
   $$\text{RTT} = T_3 - T_1$$
5. Client-Server Offset:
   $$\text{Offset} = T_{\text{server}} - \left(T_1 + \frac{\text{RTT}}{2}\right)$$
6. Estimated Current Server Time:
   $$\hat{T}_{\text{server}} = \text{Date.now()} + \text{Offset}$$

### Authoritative State Machine
The server maintains the single source of truth for each room:
- **`anchorPosition`**: Media position in seconds at the moment of the last state change.
- **`anchorServerTime`**: Millisecond server timestamp when `anchorPosition` was recorded.
- **`isPlaying`**: Boolean indicating active playback.
- **`playbackRate`**: Playback rate multiplier ($0.25\times$ to $4.0\times$).
- **`version`**: Monotonically increasing sequence integer. Stale state updates ($V_{\text{client}} < V_{\text{server}}$) are discarded.

When playing, the expected playback position at any server time $T$ is:
$$\text{ExpectedPosition}(T) = \text{anchorPosition} + \frac{(T - \text{anchorServerTime}) \times \text{playbackRate}}{1000}$$

### Client Drift Correction Loop
Clients run a $250\text{ms}$ drift correction interval comparing actual `<video>.currentTime` with $\text{ExpectedPosition}(\hat{T}_{\text{server}})$:
- **$|\text{Drift}| \le 100\text{ms}$**: In sync. Normal playback rate ($1.0\times$).
- **$100\text{ms} < |\text{Drift}| \le 1000\text{ms}$**: Micro-rate adjustment ($0.95\times$ or $1.05\times$) smoothly eliminates drift without audio clicks or pitch shifts.
- **$|\text{Drift}| > 1000\text{ms}$**: Direct authoritative hard seek to align the playhead immediately.

---

## 4. Media Storage Architecture

The `MediaStorage` abstraction provides two decoupled implementations:

```ts
export interface MediaStorage {
  saveFile(roomId: string, originalName: string, buffer: Buffer, mimeType: string): Promise<SavedMediaResult>;
  deleteFile(storageKey: string): Promise<void>;
  streamFile(storageKey: string, req: Request, res: Response): Promise<void> | void;
  getUrl(storageKey: string): string;
  ensureDemoMedia(): SavedMediaResult;
  getSignedUploadUrl?(roomId: string, originalName: string, mimeType: string): Promise<SignedUploadResult>;
}
```

### Local Storage (`LocalMediaStorage`)
- Writes files to `./uploads/{roomId}/{timestamp}_{sanitizedName}`.
- Enforces strict path traversal defenses (`safeKey = path.normalize(key).replace(/^(\.\.[\/\\])+/, '')`).
- Implements RFC 7233 byte-range parsing returning `206 Partial Content` with `Content-Range: bytes start-end/total`.

### Cloud Object Storage (`S3MediaStorage`)
- Interfaces with AWS S3, Cloudflare R2, MinIO, or Wasabi using `@aws-sdk/client-s3`.
- Generates pre-signed upload PUT URLs (`getSignedUploadUrl`) valid for 15 minutes, allowing browsers to upload videos up to 5 GB (5,368,709,120 bytes) directly to cloud storage without burdening Node.js memory.
- Supports byte-range requests for seeking by issuing `GetObjectCommand` with `Range` headers.

---

## 5. Database Architecture

Cineva uses **Prisma ORM** with parallel schemas for SQLite (dev) and PostgreSQL (prod):

```
┌────────────────────────────────────────────────────────┐
│                          Room                          │
├────────────────────────────────────────────────────────┤
│ id: String (cuid) [PK]                                 │
│ roomCode: String [Unique, Indexed]                     │
│ name: String                                           │
│ hostParticipantId: String                              │
│ hostSessionId: String                                  │
│ status: String ("active" | "ended" | "expired")        │
│ allowGuestControl: Boolean (default: false)            │
│ maxParticipants: Int (default: 20)                     │
│ createdAt: DateTime, updatedAt: DateTime               │
│ expiresAt: DateTime?                                   │
└──────────────────────────┬─────────────────────────────┘
                           │ 1:N
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
   │ Participant │  │    Media    │  │ ChatMessage │
   └─────────────┘  └─────────────┘  └─────────────┘
```

- **`Room`**: Holds room metadata, security policy, host session link, and expiration.
- **`Participant`**: Tracks presence, display names, host flags, and join timestamps. Compound unique index `[roomId, sessionId]`.
- **`Media`**: Stores media metadata, MIME type, size, duration, and cloud storage key.
- **`ChatMessage`**: Persists room chat history for late-joining guests.

---

## 6. State Lifecycle: Persistent vs. Ephemeral

| State Element | Storage Medium | Lifecycle & Behavior across Server Restart |
| :--- | :--- | :--- |
| **Room Definition** | PostgreSQL DB | Persistent. Remains valid until `expiresAt` or host ends room. |
| **Host Session Token** | PostgreSQL DB | Persistent. Host can reload or change network and retains authority. |
| **Participant Identity** | PostgreSQL DB | Persistent. Users rejoining with matching `sessionId` reclaim their presence. |
| **Chat History** | PostgreSQL DB | Persistent. Delivered to reconnecting clients via `chat:history`. |
| **Media Record** | PostgreSQL DB | Persistent. Storage key remains valid for streaming. |
| **Active Sockets** | In-Memory (Node) | Ephemeral. Cleared on restart; clients reconnect automatically within 1–5 seconds. |
| **NTP Clock Offsets** | In-Memory (Client) | Ephemeral. Re-established automatically via continuous ping/pong loop. |
| **Realtime Playhead** | In-Memory (Engine) | Ephemeral. Pauses at last position on unexpected crash; host resumes timeline upon reconnection. |

---

## 7. Security Model & Audit

1. **Authentication & Authorization**:
   - Host identity is verified against `room.hostSessionId` on every state-altering event (play, pause, seek, rate, settings, kick, end).
   - Guest control is prohibited by default unless explicitly toggled by the host (`allowGuestControl: true`).
2. **Input Sanitization & Injection Defense**:
   - Room codes are strictly alphanumeric (`nanoid` custom alphabet without ambiguous characters `0, O, I, 1`).
   - Chat messages are parsed through strict Zod schemas and HTML-escaped before broadcast to prevent XSS.
3. **Upload Security**:
   - MIME types and file extensions are checked against an explicit whitelist (`.mp4`, `.webm`, `.mkv`, `.mov`, `.ogg`).
   - Filenames are sanitized (non-alphanumeric characters stripped) and scoped into isolated subdirectories.
   - Filesystem traversal markers (`../`) are systematically rejected.
4. **Rate Limiting**:
   - General API: 1,000 requests per 15 minutes per IP.
   - Room Creation: 30 rooms per 10 minutes per IP.
   - Media Uploads: 30 uploads per 15 minutes per IP.
   - WebSocket Chat: 5 messages per 3 seconds per socket.
5. **Security Headers**:
   - `Content-Security-Policy`: Restricts scripts, styles, frames, and connects to authorized origins.
   - `Strict-Transport-Security` (HSTS): Enabled in production (`max-age=31536000`).
   - `X-Content-Type-Options: nosniff`.
   - `X-Frame-Options: SAMEORIGIN`.
   - `Referrer-Policy: strict-origin-when-cross-origin`.

---

## 8. Horizontal Scaling Architecture (Redis Cluster)

For multi-server horizontal scaling across load-balanced Node.js instances:

```
                      ┌──────────────────────┐
                      │    Load Balancer     │
                      │ (Nginx / Cloudflare) │
                      │   (Sticky Session)   │
                      └──────────┬───────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
      ┌──────────────────────┐       ┌──────────────────────┐
      │  Cineva Server A  │       │  Cineva Server B  │
      └──────────┬───────────┘       └──────────┬───────────┘
                 │                              │
                 └───────────────┬──────────────┘
                                 ▼
                      ┌──────────────────────┐
                      │    Redis Pub/Sub     │
                      │ Socket.IO Redis Adpt │
                      └──────────────────────┘
```

1. **Socket.IO Redis Adapter**: Configure `@socket.io/redis-adapter` with `REDIS_URL`. Broadcasts emit across all cluster instances.
2. **Sticky Sessions**: Load balancers (e.g. AWS ALB, Nginx) must enable cookie-based session stickiness during the HTTP long-polling upgrade handshake before establishing the WebSocket connection.
3. **Authoritative State Distribution**: Playback state snapshots can be stored in Redis keys (`room:{id}:playback`) with TTL matching room expiration.

---

## 9. Known Operational Caveats

1. **Browser Autoplay Policies**: Modern browsers (Chrome, Safari) reject unmuted autoplay without user interaction. Cineva automatically starts video muted to preserve visual synchronization and presents an intuitive *"You're synchronized. Click to enable audio"* overlay.
2. **Persistent WebSocket Requirement**: Serverless platforms (e.g. AWS Lambda without API Gateway WebSockets, standard Vercel serverless functions) cannot sustain long-lived Socket.IO connections. A stateful runtime (Render, Railway, Fly.io, ECS) is required.
3. **Media Copyright Notice**: Cineva provides synchronization tooling for personal or authorized media. It does not provide licensed video content.
