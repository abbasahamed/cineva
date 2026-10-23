# Cineva — Real-Time Synchronized Watch Party Web App

**Cineva** is a production-grade, real-time video watch party platform built with TypeScript, React, Vite, Node.js, Express, Socket.IO, and Prisma. It guarantees that multiple independent browser clients remain frame-accurate and playback-synchronized to the exact same timeline position regardless of network jitter, seeking, or joining late.

---

## 🌟 Key Features

- **Server-Authoritative Synchronization**: Authoritative server timeline eliminates client clock drift and desynchronization.
- **NTP-Style Clock Synchronization**: Continuous round-trip time (RTT) estimation and server clock offset calculations.
- **Gentle Drift Correction**:
  - **$\Delta < 0.25\text{s}$**: Normal playback without disruption.
  - **$0.25\text{s} \le \Delta < 1.0\text{s}$**: Sub-second playback rate tuning ($0.95\times$ / $1.05\times$) for smooth alignment without jarring jumps.
  - **$\Delta \ge 1.0\text{s}$**: Controlled seek to exact authoritative position.
- **Join-in-Progress Synchronization**: Late-joining guests compute their position relative to elapsed server time and join the exact frame automatically.
- **HTTP 206 Partial Content Range Streaming**: Native chunked byte-range video streaming for smooth seeking.
- **Local & S3-Ready Storage**: `IMediaStorage` abstraction supporting local directories out of the box with zero external storage requirements.
- **Instant Demo Room**: 1-click test environment pre-loaded with sample video.
- **Host Permission Controls**: Authoritative playback control by default with a toggle to allow guest playback control.
- **Real-Time Room Chat**: WebSocket room-scoped chat with HTML sanitization, rate limiting, and participant badges.
- **Participant Presence & Reconnection**: Session recovery across disconnects with grace period timeouts.
- **Responsive Cinema UI**: Sleek, distraction-free dark streaming interface with touch-friendly scrubbers, hover previews, and full keyboard shortcuts.

---

## 📁 Project Structure

```
/
├── apps/
│   ├── web/                    # React + Vite + Tailwind CSS Frontend
│   │   ├── src/
│   │   │   ├── components/     # VideoPlayer, Navbar, ChatPanel, ParticipantsList, Modals
│   │   │   ├── hooks/          # useSyncWatch (Drift correction loop, socket listener)
│   │   │   ├── pages/          # LandingPage, CreateRoomPage, JoinRoomPage, WatchRoomPage
│   │   │   ├── services/       # REST API client & Socket.IO client
│   │   │   └── __tests__/      # Frontend sync & drift calculation tests
│   │   └── vite.config.ts
│   │
│   └── server/                 # Node.js + Express + Socket.IO Backend
│       ├── prisma/             # Prisma schema & SQLite / Postgres migrations
│       ├── src/
│       │   ├── routes/         # REST API (/api/rooms, /api/media)
│       │   ├── services/       # syncEngine, roomManager, mediaStorage
│       │   ├── sockets/        # Real-time event handlers & clock sync
│       │   └── __tests__/      # Backend sync & room management unit tests
│       └── .env.example
│
└── packages/
    └── shared/                 # Shared TypeScript models, Zod schemas, socket events
        └── src/index.ts
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### 1. Installation

Clone the repository and install all workspace dependencies:

```bash
git clone <repository_url> cineva
cd cineva
npm install
```

### 2. Environment Configuration

Copy the sample environment configuration:

```bash
cp .env.example apps/server/.env
```

Default `.env` settings:
```env
PORT=4000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
DATABASE_URL="file:./dev.db"
MEDIA_STORAGE_PATH=./uploads
MAX_FILE_SIZE_MB=5120 # 5 GB per file
SESSION_SECRET=cineva_dev_session_secret_key_123
```

### 3. Database Migration

Generate the Prisma Client and initialize the database schema:

```bash
npm run db:push --workspace=@cineva/server
```

*(Note: SQLite is configured by default for zero-setup local development. To use PostgreSQL, update `DATABASE_URL` in `.env` and `provider = "postgresql"` in `apps/server/prisma/schema.prisma`).*

### 4. Build Shared Package

```bash
npm run build --workspace=@cineva/shared
```

---

## 💻 Development Commands

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts both backend (`localhost:4000`) and frontend (`localhost:5173`) concurrently |
| `npm run dev:server` | Starts Express & Socket.IO server with hot reloading via `tsx watch` |
| `npm run dev:web` | Starts Vite React frontend dev server |
| `npm run build` | Compiles all packages and bundles frontend assets |
| `npm run test` | Runs the full Vitest automated test suite across all workspaces |
| `npm run typecheck` | Typechecks all TypeScript files across the monorepo |
| `npm run lint` | Runs TypeScript linting checks |

---

## ⏱️ Synchronization Algorithm Details

### 1. Server Authoritative State

The server tracks a single authoritative state for each room:

$$\text{Position}_{\text{current}} = \text{StoredPosition} + \left(\frac{\text{ServerNow} - \text{LastUpdatedAt}}{1000}\right) \times \text{PlaybackRate}$$

When any host action occurs (`PLAY`, `PAUSE`, `SEEK`, `RATE`), the server increments the `version` counter and broadcasts the new state with the current server timestamp.

### 2. NTP Client-Server Clock Offset Estimation

To account for latency and clock drift between client devices and the server:
1. Client sends a timestamped `PING` ($t_0$).
2. Server responds with `PONG` containing the server's clock timestamp ($t_1$).
3. Client receives response ($t_2$) and estimates:
   $$\text{RTT} = t_2 - t_0$$
   $$\text{ServerOffset} = t_1 - \left(t_0 + \frac{\text{RTT}}{2}\right)$$
   $$\text{EstimatedServerNow} = \text{ClientNow} + \text{ServerOffset}$$

### 3. Client Drift Correction Loop

Every 500ms, each active client calculates:
$$\text{ExpectedPosition} = \text{PlaybackState.position} + \left(\frac{\text{EstimatedServerNow} - \text{PlaybackState.lastUpdatedAt}}{1000}\right) \times \text{PlaybackState.playbackRate}$$
$$\text{Drift} = \text{ExpectedPosition} - \text{video.currentTime}$$

- **$|\text{Drift}| < 0.25\text{s}$**: Video is in sync.
- **$0.25\text{s} \le |\text{Drift}| < 1.0\text{s}$**: Temporary gentle acceleration ($1.05\times$) or deceleration ($0.95\times$) smoothly brings the video into alignment without audio distortion or buffering.
- **$|\text{Drift}| \ge 1.0\text{s}$**: Direct controlled seek to `ExpectedPosition`.

---

## 📡 WebSocket Event Architecture & Audit

| Event Name | Direction | Sender | Receiver | Authoritative? | Description |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `sync:ping` | Client $\to$ Server | Client | Server | N/A | NTP ping containing client timestamp |
| `sync:pong` | Server $\to$ Client | Server | Client | Yes | NTP pong with server timestamp for offset estimation |
| `room:join` | Client $\to$ Server | Client | Server | N/A | Authenticates session and enters room channel |
| `room:state` | Server $\to$ Client | Server | Client | Yes | Initial snapshot with calculated position & timestamp |
| `playback:play` | Client $\to$ Server | Host / Guest* | Server | Yes | Requests authoritative playback start |
| `playback:pause` | Client $\to$ Server | Host / Guest* | Server | Yes | Requests authoritative playback pause |
| `playback:seek` | Client $\to$ Server | Host / Guest* | Server | Yes | Requests authoritative timeline seek |
| `playback:rate` | Client $\to$ Server | Host / Guest* | Server | Yes | Requests authoritative playback speed adjustment |
| `playback:state` | Server $\to$ Room | Server | All Clients | Yes | Broadcasts authoritative state & incremented version |
| `room:updateSettings` | Client $\to$ Server | Host | Server | Yes | Toggles guest control or participant capacity |
| `room:updateTitle` | Client $\to$ Server | Host | Server | Yes | Updates display title for room media |
| `room:kickParticipant`| Client $\to$ Server | Host | Server | Yes | Removes a guest participant from room |
| `room:end` | Client $\to$ Server | Host | Server | Yes | Host ends room for all participants |
| `room:ended` | Server $\to$ Room | Server | All Clients | Yes | Signals all clients that room has terminated |
| `participant:joined` | Server $\to$ Room | Server | All Clients | Yes | Notifies presence of newly joined participant |
| `participant:left` | Server $\to$ Room | Server | All Clients | Yes | Notifies participant disconnect after grace timeout |
| `participant:kicked` | Server $\to$ Room | Server | All Clients | Yes | Notifies clients that a user was removed |
| `chat:send` | Client $\to$ Server | Client | Server | No | User submits a text chat message |
| `chat:message` | Server $\to$ Room | Server | All Clients | No | Broadcasts sanitized chat message to room |
| `chat:history` | Server $\to$ Client | Server | Client | No | Delivers recent chat log on join |

*\* Guest control is only permitted when the Host enables "Allow Guest Controls" in room settings.*

---

## 🔒 Security & Validation

- **No Binary Media in WebSockets**: Media files are transmitted via HTTP Range requests; WebSockets only carry state updates and chat.
- **Server Authority Verification**: `isHost` status is verified directly against the database session token on every action. Client-supplied flags are never trusted.
- **Upload Limits & MIME Inspection**: Maximum video upload size: 5 GB per file (5,368,709,120 bytes) with strict MIME and extension validation.
- **Path Traversal Protection**: Media file paths are strictly validated against the upload directory boundary.
- **Input Sanitization**: Chat messages and user display names are escaped to prevent XSS injection.
- **Zod Validation**: All REST inputs and Socket.IO payloads are validated with strict schemas.
- **Rate Limiting**: Express API rate limiter and WebSocket chat throttling prevent spam.
- **Collision-Resistant Room Codes**: Short 6-character uppercase codes (`A7K9PX`) using unambiguous character sets.

---

## 🧪 Testing

Execute automated unit and integration tests:

```bash
npm run test
```

### Tested Scenarios:
- Room creation and unique code validation
- Host vs guest permission boundaries
- Play/Pause state transitions and version increments
- Late-joining guest synchronization accuracy
- NTP clock offset calculation under simulated network latency
- Drift correction boundary conditions
- Section 25 Deterministic Synchronization test
- Reconnection session recovery
- HTTP range header responses

---

## 🚢 Production Deployment

Cineva is architected for seamless separation between static frontend assets, stateful Node.js WebSocket backend processes, relational database storage, and scalable object storage.

### 1. Architectural Requirements

| Layer | Recommended Hosting Platforms | Deployment Requirements |
| :--- | :--- | :--- |
| **Frontend** | Vercel, Netlify, Cloudflare Pages, AWS S3+CloudFront | Static SPA hosting; rewrite all routes to `/index.html`. |
| **Backend** | Railway, Render, Fly.io, AWS ECS / EC2, DigitalOcean | **Must run long-lived, stateful Node processes**. Serverless function platforms (AWS Lambda, Vercel Serverless) are **not supported** for the Socket.IO server without external WebSocket gateways. |
| **Database** | Supabase, Neon, AWS RDS PostgreSQL, Railway Postgres | PostgreSQL for production. Set `DATABASE_URL` with connection pooling or SSL parameters. |
| **Media Storage** | AWS S3, Cloudflare R2, MinIO, Wasabi | S3-compatible object storage with `STORAGE_DRIVER=s3`. Supports direct pre-signed PUT uploads and HTTP byte-range streaming. |

---

### 2. Database Setup & Migration

Cineva supports zero-configuration **SQLite** for development and **PostgreSQL** for production.

1. Configure your production connection string in `.env`:
   ```bash
   DATABASE_URL="postgresql://postgres:yourpassword@db.yourproject.supabase.co:5432/postgres?sslmode=require"
   ```
2. Push the PostgreSQL schema:
   ```bash
   npm run db:push:prod --workspace=@cineva/server
   ```
3. Generate the Prisma client:
   ```bash
   npm run db:generate:prod --workspace=@cineva/server
   ```

---

### 3. Object Storage Setup (AWS S3 / Cloudflare R2)

To avoid storing large media files on the application server disk in production:

1. Create a private bucket (e.g., `cineva-media-prod`).
2. Configure bucket CORS policy:
   ```json
   [
     {
       "AllowedHeaders": ["*"],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedOrigins": ["https://your-frontend-domain.com"],
       "ExposeHeaders": ["ETag", "Content-Range", "Accept-Ranges"]
     }
   ]
   ```
3. Supply S3 environment variables:
   ```bash
   STORAGE_DRIVER=s3
   S3_BUCKET=cineva-media-prod
   S3_REGION=us-east-1
   S3_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
   S3_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
   # Optional: S3_PUBLIC_BASE_URL=https://media.cineva.app
   ```

---

### 4. Backend Deployment (Docker / VPS / PaaS)

1. Build the monorepo:
   ```bash
   npm run build
   ```
2. Run backend production server:
   ```bash
   NODE_ENV=production npm run start --workspace=@cineva/server
   ```
3. Verify health status:
   ```bash
   curl https://api.yourdomain.com/api/health
   # Returns: {"status":"ok"}
   ```

---

### 5. Frontend Deployment

1. Set the production backend URL during build:
   ```bash
   VITE_API_URL=https://api.yourdomain.com
   VITE_SOCKET_URL=https://api.yourdomain.com
   ```
2. Build static artifacts:
   ```bash
   npm run build --workspace=@cineva/web
   ```
3. Deploy the resulting `apps/web/dist/` directory to your static hosting provider.

---

### 6. Security & HTTPS

- **HTTPS / WSS**: In production, serve the frontend over `https://` and WebSocket connections over `wss://`.
- **CORS Protection**: The server automatically validates incoming origins against `ALLOWED_ORIGINS` / `CLIENT_URL`. Wildcard `*` origins are rejected in production mode.
- **Security Headers**: Helmet enables `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, and `HSTS` (HTTP Strict Transport Security).

---

### 7. Rollback Procedure & Operations

If a production deployment requires rollback:
1. **Frontend Rollback**: In Vercel / Netlify dashboard, promote the previous successful deployment build to Instant Production.
2. **Backend Rollback**: Revert to the prior release image or tag in Railway / Render / ECS dashboard.
3. **Database Rollback**: If schema changes occurred, run `prisma migrate resolve --applied <previous_migration>` or restore from automated daily database snapshot in Supabase / Neon dashboard.

---

### 8. Observability & Log Access

Cineva streams structured JSON logs to `stdout` / `stderr`:
- **Event Log Format**: `{"timestamp":"2026-09-25T18:00:00.000Z","level":"INFO","event":"participant_joined","roomCode":"ABC123","displayName":"User","isHost":false}`
- **Redaction Policy**: Session tokens, database connection strings, S3 secret access keys, and user chat text are automatically stripped before log output.
- **Log Aggregation**: Native compatibility with CloudWatch, Datadog, Papertrail, or Railway / Render log viewers.

---

### ⚠️ Media & Copyright Compliance

> **Cineva is designed for watching user-authorized media with friends. Users are responsible for having the necessary rights to upload and share media.**

- Cineva provides real-time synchronization infrastructure. It does not package, distribute, or host copyrighted movies or television programming.
- The included sample trailer (`sample_video.mp4`) is provided strictly for demonstration and testing.
- Users and administrators must upload or stream only media they own or are legally authorized to view and share.

---

## 📚 Production Documentation Directory

- 🚀 [**Beginner Deployment Guide** (`docs/DEPLOY.md`)](file:///Users/abbas/Desktop/untitled%20folder/docs/DEPLOY.md): Step-by-step launch guide for Vercel, Railway, Supabase & Cloudflare R2.
- 📋 [**Live Verification Checklist** (`docs/LIVE_TEST_CHECKLIST.md`)](file:///Users/abbas/Desktop/untitled%20folder/docs/LIVE_TEST_CHECKLIST.md): Production smoke test and live measurement table.
- 🔄 [**Rollback & Incident Recovery** (`docs/ROLLBACK.md`)](file:///Users/abbas/Desktop/untitled%20folder/docs/ROLLBACK.md): Procedures for rolling back frontend, backend, or database changes.
- 🛡️ [**Security & Hardening Audit** (`docs/SECURITY_AUDIT.md`)](file:///Users/abbas/Desktop/untitled%20folder/docs/SECURITY_AUDIT.md): Comprehensive security model and threat mitigations.
- 🏗️ [**Production Architecture Specification** (`docs/PRODUCTION_ARCHITECTURE.md`)](file:///Users/abbas/Desktop/untitled%20folder/docs/PRODUCTION_ARCHITECTURE.md): Control vs. data plane, NTP clock sync, and S3 streaming topology.

---

## 📄 License

MIT. Built for authorized personal and collaborative media viewing.

