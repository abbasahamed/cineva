# SyncWatch — Production Deployment Checklist

This document provides a step-by-step checklist to ensure a safe, secure, and fully verified deployment of **SyncWatch**.

---

## 📋 Pre-Deployment Verification

- [x] **Repository Cleanliness**: `.gitignore` verified. Build artifacts, SQLite databases (`dev.db`), and media uploads excluded.
- [x] **Secret Audit**: Zero hardcoded API keys, passwords, database URIs, or session secrets in git-tracked files.
- [x] **Typecheck Status**: `npm run typecheck` passes with 0 errors across all workspaces.
- [x] **Automated Test Suite**: All 34 automated unit, integration, and multi-client E2E tests pass (`npm run test`).
- [x] **Production Bundle**: `npm run build` generates clean production artifacts (`apps/web/dist` and `apps/server/dist`).
- [x] **Frontend Bundle Audit**: Inspected `dist/assets/*.js`; zero server secrets (`DATABASE_URL`, `SESSION_SECRET`, `S3_SECRET`) leaked.

---

## 🚀 Infrastructure & Platform Setup

- [ ] **Domain Configuration**: Production domains configured for frontend (e.g., `https://syncwatch.app`) and backend API (e.g., `https://api.syncwatch.app`).
- [ ] **HTTPS / WSS SSL**: TLS certificates issued and active for all domains (`https://` and `wss://`).
- [ ] **Frontend Hosting**: Deployed to Vercel, Netlify, Cloudflare Pages, or AWS S3+CloudFront with SPA rewrite to `/index.html`.
- [ ] **Backend Hosting**: Deployed to long-lived stateful Node.js runtime (Railway, Render, Fly.io, AWS ECS/EC2, DigitalOcean App Platform).
- [ ] **PostgreSQL Database**: Managed database instance (Supabase, Neon, AWS RDS, Railway Postgres) active.
- [ ] **Object Storage Bucket**: S3 / Cloudflare R2 bucket created with proper CORS rules for the frontend domain.

---

## 🔐 Environment Configuration Checklist

- [ ] `NODE_ENV=production` set on server environment.
- [ ] `PORT=4000` (or platform default) set on server environment.
- [ ] `CLIENT_URL` & `ALLOWED_ORIGINS` set to match exact production frontend domain.
- [ ] `DATABASE_URL` configured with production PostgreSQL connection string (`postgresql://...`).
- [ ] `STORAGE_DRIVER=s3` set with `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`.
- [ ] `SESSION_SECRET` generated using `openssl rand -base64 48` and set on server.
- [ ] `VITE_API_URL` & `VITE_SOCKET_URL` configured during frontend build.

---

## 🧪 Post-Deployment Verification Checklist

- [ ] **Health Endpoint**: `GET https://api.yourdomain.com/api/health` returns `{"status":"ok"}`.
- [ ] **Security Headers**: Verified Helmet headers (`CSP`, `HSTS`, `X-Content-Type-Options`, `X-Frame-Options`).
- [ ] **Room Creation**: Create room on live deployment; unique 6-character room code generated.
- [ ] **Room Joining**: Join room via share link `https://yourdomain.com/join/:roomCode` from a second device or incognito window.
- [ ] **Video Upload**: Upload video via S3 pre-signed upload or server endpoint; metadata records cleanly.
- [ ] **Play Synchronization**: Host clicks Play; all connected guests start playback within <100ms.
- [ ] **Pause Synchronization**: Host clicks Pause; all connected guests pause on the exact same frame.
- [ ] **Seek Synchronization**: Host seeks to new playhead position; all guests update instantly.
- [ ] **Real-Time Chat**: Send chat message; arrives cleanly across clients with XSS sanitization.
- [ ] **Autoplay Audio UX**: Verify guest joining playing video displays *"You're synchronized. Click to enable audio"* without breaking playhead alignment.
- [ ] **Reconnection**: Briefly disconnect network; Socket.IO automatically reconnects and reclaims participant state.
- [ ] **Mobile Responsiveness**: Test on mobile browser (320px–430px); controls remain accessible and sidebar shifts to bottom tabs.
