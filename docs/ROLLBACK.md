# SyncWatch — Production Rollback & Incident Recovery Guide

This document outlines standard operating procedures for rolling back deployments, diagnosing failures, and recovering from production incidents.

---

## 1. Frontend Rollback (Vercel / Netlify / Cloudflare Pages)

If a bad frontend release breaks UI rendering, client routing, or asset loading:

### Procedure in Vercel:
1. Open the [Vercel Dashboard](https://vercel.com).
2. Select your `syncwatch` project $\to$ navigate to the **Deployments** tab.
3. Locate the last known good deployment.
4. Click the three dots (`...`) on the right side $\to$ select **"Instant Rollback"** (or **"Promote to Production"**).
5. Vercel will instantly switch edge traffic to the previous build within 5 seconds.

---

## 2. Backend Rollback (Railway / Render / Fly.io)

If a new backend release causes crashes, unhandled exceptions, or broken endpoints:

### Procedure in Railway:
1. Open the [Railway Dashboard](https://railway.com).
2. Click your `syncwatch-backend` service $\to$ navigate to the **Deployments** tab.
3. Find the previous stable deployment.
4. Click the options menu (`...`) $\to$ select **"Rollback to this deployment"**.
5. Railway restarts the container using the prior verified image.

### Procedure in Render:
1. Open [dashboard.render.com](https://dashboard.render.com).
2. Click your backend Web Service $\to$ **Events** tab.
3. Locate the previous successful deploy $\to$ click **"Rollback"**.

---

## 3. Database Migration Recovery

> [!WARNING]
> **NEVER** run destructive reset commands like `prisma migrate reset` or `DROP TABLE` in a production environment. Doing so will permanently destroy active rooms, participant records, and chat history.

### Safe Migration Recovery:
1. **Schema Check**: If a migration script failed partway through execution, check the database status:
   ```bash
   npx prisma migrate status --schema=prisma/schema.postgresql.prisma
   ```
2. **Marking Failed Migrations**: If a migration was recorded as failed but changes were reverted manually in the database dashboard:
   ```bash
   npx prisma migrate resolve --rolled-back <migration_name> --schema=prisma/schema.postgresql.prisma
   ```
3. **Database Point-in-Time Restore**:
   - In Supabase: Navigate to **Project Settings** $\to$ **Backups** $\to$ select an automated daily backup or Point-in-Time snapshot $\to$ click **"Restore"**.
   - In Neon: Select **Branches** $\to$ create a new branch from a historical point in time before the failure.

---

## 4. Troubleshooting Common Incidents

### A. WebSockets Failing to Connect (`reconnecting` or `connection error`)
1. **Verify Runtime**: Confirm the backend is running as a **stateful Web Service** on Railway/Render and NOT as a serverless function.
2. **Verify Protocol**: Ensure the client is attempting connection via `wss://` over HTTPS.
3. **Verify CORS**: Check that the backend's `CLIENT_URL` and `ALLOWED_ORIGINS` environment variables match the exact frontend URL (including `https://` and no trailing slash).
4. **Inspect Server Logs**: Look for `cors_rejection` events in backend logs.

### B. Video Fails to Stream or Range Requests Return 404 / 500
1. **Verify Storage Driver**: If using cloud storage, ensure `STORAGE_DRIVER=s3` is set on the backend.
2. **Verify R2 / S3 CORS**: Open Cloudflare R2 / AWS S3 console and verify the bucket's CORS JSON includes your frontend domain in `AllowedOrigins` and allows `GET`, `PUT`, `HEAD`.
3. **Verify Credentials**: Check that `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` have not expired or been deleted.

### C. Autoplay Audio Blocked on Mobile
- This is standard browser security policy for unmuted audio.
- Ensure the user sees the synchronized *"You're synchronized. Click to enable audio"* overlay and clicks **"Enable Audio"**.

---

## 5. Observability & Log Inspection

### Where to Find Logs:
- **Backend Logs**: Railway Dashboard $\to$ select backend service $\to$ **Deploy Logs** or **Runtime Logs**.
- **Frontend Logs**: Vercel Dashboard $\to$ select project $\to$ **Runtime Logs**.
- **Database Logs**: Supabase / Neon Dashboard $\to$ **Logs** $\to$ **Postgres Logs**.

### Incident Debugging Data Collection:
Before investigating an issue, collect:
1. **Timestamp** of the incident.
2. **Room Code** where the failure occurred.
3. **Client User-Agent & Browser Version** (e.g. Chrome on macOS vs Safari on iOS).
4. **Console Log Output** from browser DevTools (`F12` $\to$ Console).
5. **Backend Error Events** from the structured JSON server logs.

> [!CAUTION]
> **CONFIDENTIALITY NOTICE**: When sharing logs for debugging, **NEVER** share:
> - `DATABASE_URL` (contains database password)
> - `SESSION_SECRET` (cryptographic key)
> - `S3_SECRET_ACCESS_KEY` (storage credentials)
> - User session tokens or raw authorization cookies
