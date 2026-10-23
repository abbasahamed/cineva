# Cineva — Step-by-Step Production Deployment Guide

This guide is designed for developers deploying **Cineva** to production for the first time. It provides exact, beginner-friendly instructions from zero to a live, multi-device synchronized watch-party platform.

---

## 🏗️ Recommended Beginner Architecture

To deploy Cineva reliably with minimal operational overhead and zero cost for initial testing, we recommend:

| Layer | Provider | Why This Provider? |
| :--- | :--- | :--- |
| **Frontend** | **Vercel** | Free global edge CDN, automatic SSL, native SPA routing, zero server maintenance. |
| **Backend** | **Railway** *(or Render)* | Runs persistent Node.js processes required for stateful Socket.IO WebSockets. |
| **Database** | **Supabase** *(or Neon)* | Managed PostgreSQL database with instant connection pooling and daily backups. |
| **Media Storage** | **Cloudflare R2** *(or AWS S3)* | S3-compatible object storage with **zero egress fees** for high-bandwidth video streaming. |

---

## 🔑 Environment Variables Reference

| Variable | Target Service | Example Format | Secret? | Purpose |
| :--- | :--- | :--- | :---: | :--- |
| **`NODE_ENV`** | Backend | `production` | No | Enables production security headers, CSP, and optimized caching. |
| **`PORT`** | Backend | `4000` | No | Port the Node.js server listens on (Railway/Render provide this automatically). |
| **`DATABASE_URL`** | Backend | `postgresql://postgres:pass@db.supabase.co:5432/postgres?sslmode=require` | **YES** | Connection string for PostgreSQL database. |
| **`SESSION_SECRET`** | Backend | `k8F2j... (48 chars)` | **YES** | Cryptographic key for server-side token signing and session validation. |
| **`STORAGE_DRIVER`** | Backend | `s3` | No | Instructs Cineva to use S3/R2 object storage instead of local disk. |
| **`S3_BUCKET`** | Backend | `cineva-media-prod` | No | Name of your Cloudflare R2 / AWS S3 storage bucket. |
| **`S3_REGION`** | Backend | `auto` *(R2)* or `us-east-1` *(S3)* | No | Region where your storage bucket is hosted. |
| **`S3_ENDPOINT`** | Backend | `https://<account_id>.r2.cloudflarestorage.com` | No | S3 API endpoint URL (Required for Cloudflare R2 / MinIO). |
| **`S3_ACCESS_KEY_ID`** | Backend | `d89a7f6c...` | **YES** | Object storage API access key. |
| **`S3_SECRET_ACCESS_KEY`** | Backend | `4b7e1a...` | **YES** | Object storage secret key. |
| **`MAX_FILE_SIZE_MB`** | Backend | `5120` | No | Maximum video upload size: 5 GB per file (default: 5120 MB = 5,368,709,120 bytes). |
| **`CLIENT_URL`** | Backend | `https://cineva.vercel.app` | No | Exact frontend production URL for CORS and share links. |
| **`ALLOWED_ORIGINS`** | Backend | `https://cineva.vercel.app` | No | Whitelisted domains permitted to make API calls and WebSocket connections. |
| **`VITE_API_URL`** | Frontend | `https://cineva-backend.up.railway.app` | **PUBLIC** | Backend REST API endpoint for the browser. |
| **`VITE_SOCKET_URL`** | Frontend | `https://cineva-backend.up.railway.app` | **PUBLIC** | Backend WebSocket endpoint for real-time synchronization. |

> [!CAUTION]
> **CRITICAL SECURITY RULE**: Never prefix server secrets (such as `DATABASE_URL`, `SESSION_SECRET`, or `S3_SECRET_ACCESS_KEY`) with `VITE_`. Any variable starting with `VITE_` is publicly exposed in the client bundle.

---

## 🛠️ Step-by-Step Deployment Instructions

---

### Step 1: Create PostgreSQL Database (Supabase)

1. Open [supabase.com](https://supabase.com) and sign in.
2. Click **"New Project"**.
3. Fill in:
   - **Name**: `cineva-db`
   - **Database Password**: Click "Generate a password" and **copy this password immediately**.
   - **Region**: Choose a region close to your target users (e.g., `US East`).
4. Click **"Create new project"** (takes ~2 minutes).
5. Once created, navigate to **Project Settings** (gear icon) $\to$ **Database**.
6. Scroll down to **Connection String** $\to$ select the **URI** tab.
7. Copy the connection string. Replace `[YOUR-PASSWORD]` with the password you saved in step 3:
   ```
   postgresql://postgres.yourprojectid:yourpassword@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require
   ```
8. Save this string as your **`DATABASE_URL`**.

---

### Step 2: Create Object Storage Bucket (Cloudflare R2)

1. Open [dash.cloudflare.com](https://dash.cloudflare.com) and log in.
2. In the left sidebar, click **R2 Object Storage**.
3. Click **"Create bucket"**:
   - **Bucket name**: `cineva-media-prod`
   - **Location**: Automatic.
4. Click **"Create Bucket"**.
5. Configure Bucket CORS:
   - Click on your new bucket $\to$ **Settings** $\to$ scroll down to **CORS Policy** $\to$ click **"Add CORS policy"**.
   - Paste the following JSON:
     ```json
     [
       {
         "AllowedOrigins": ["https://cineva.vercel.app", "http://localhost:5173"],
         "AllowedMethods": ["GET", "PUT", "HEAD"],
         "AllowedHeaders": ["*"],
         "ExposeHeaders": ["ETag", "Content-Range", "Accept-Ranges"],
         "MaxAgeSeconds": 3600
       }
     ]
     ```
   - Click **"Save"**.
6. Generate R2 Access Keys:
   - Return to **R2 Overview** $\to$ in the right sidebar, click **"Manage R2 API Tokens"**.
   - Click **"Create API token"**.
   - **Token name**: `cineva-token`
   - **Permissions**: **Object Read & Write**
   - Click **"Create API Token"**.
   - Copy the **Access Key ID**, **Secret Access Key**, and **Endpoint URL** (`https://<account_id>.r2.cloudflarestorage.com`).

---

### Step 3: Generate Cryptographic Session Secret

Run the following command in your local terminal:

```bash
openssl rand -base64 48
```

*Example Output:*
```
x9QzK2pL8vN4mY1wT7rE5bC3hG6jF0sD+uI8aO2eW4kP9tU7vX1yZ3cA5fH7jL9m
```

Copy this output. This will be your **`SESSION_SECRET`**.

---

### Step 4: Deploy Backend Service (Railway)

1. Open [railway.com](https://railway.com) and log in.
2. Click **"New Project"** $\to$ select **"Deploy from GitHub repo"**.
3. Select your `cineva` repository.
4. Click on the newly created service card $\to$ **Settings**:
   - **Root Directory**: Leave blank (monorepo root) or `/`.
   - **Build Command**: `npm run build`
   - **Start Command**: `npm run start --workspace=@cineva/server`
   - **Healthcheck Path**: `/health`
5. Navigate to the **Variables** tab and add the following environment variables:
   ```env
   NODE_ENV=production
   PORT=4000
   DATABASE_URL=postgresql://postgres.xxx:pass@aws-0.pooler.supabase.com:6543/postgres?sslmode=require
   SESSION_SECRET=<your-openssl-generated-secret>
   STORAGE_DRIVER=s3
   S3_BUCKET=cineva-media-prod
   S3_REGION=auto
   S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
   S3_ACCESS_KEY_ID=<your-r2-access-key-id>
   S3_SECRET_ACCESS_KEY=<your-r2-secret-access-key>
   CLIENT_URL=https://cineva.vercel.app
   ALLOWED_ORIGINS=https://cineva.vercel.app
   ```
6. Generate a Public Domain:
   - In **Settings** $\to$ scroll down to **Networking** $\to$ click **"Generate Domain"**.
   - Copy the generated domain (e.g., `https://cineva-backend-production.up.railway.app`).

---

### Step 5: Initialize Production PostgreSQL Database

From your local machine, run the Prisma schema push targeting your production database:

```bash
DATABASE_URL="your-supabase-database-url" npm run db:push:prod --workspace=@cineva/server
```

*Expected Successful Output:*
```
Environment variables loaded from .env
Prisma schema loaded from prisma/schema.postgresql.prisma
Datasource "db": PostgreSQL database "postgres", schema "public"

🚀  Your database is now in sync with your Prisma schema. Done in 450ms
```

Generate the Prisma client:
```bash
npm run db:generate:prod --workspace=@cineva/server
```

---

### Step 6: Deploy Frontend (Vercel)

1. Open [vercel.com](https://vercel.com) and log in.
2. Click **"Add New..."** $\to$ **"Project"**.
3. Import your `cineva` repository.
4. In the Project Configuration screen:
   - **Framework Preset**: **Vite**
   - **Root Directory**: Click "Edit" and select **`apps/web`**.
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Expand **Environment Variables** and enter:
   - **`VITE_API_URL`**: `https://cineva-backend-production.up.railway.app` (your Railway backend domain from Step 4)
   - **`VITE_SOCKET_URL`**: `https://cineva-backend-production.up.railway.app` (your Railway backend domain from Step 4)
6. Click **"Deploy"**.
7. In ~60 seconds, Vercel will deploy your app and provide a public domain (e.g., `https://cineva.vercel.app`).

---

### Step 7: Finalize CORS Configuration

Now that you have your real frontend domain from Vercel:

1. Go back to your **Railway Backend** dashboard $\to$ **Variables**.
2. Update **`CLIENT_URL`** to: `https://cineva.vercel.app`
3. Update **`ALLOWED_ORIGINS`** to: `https://cineva.vercel.app`
4. If you used Cloudflare R2, update the **AllowedOrigins** in your R2 CORS policy with the same domain.
5. Railway will automatically redeploy the backend with the new origins.

---

### Step 8: Verify Live Backend Health Check

In your terminal or web browser, verify the live health endpoint:

```bash
curl https://cineva-backend-production.up.railway.app/health
```

*Expected Response:*
```json
{"status":"ok"}
```

---

## 📱 Two-Device Live Verification Test

Follow these steps to verify real-time frame synchronization between two separate devices over the internet:

1. **Host Setup (Device A — Laptop on Home Wi-Fi)**:
   - Open `https://cineva.vercel.app` in Chrome or Safari.
   - Click **"Create a Watch Room"**.
   - Enter your name (`Host`) and Room Title (`Movie Night`).
   - Drag and drop an authorized MP4 video or select the built-in demo video.
   - Click **"Create Room"**.
   - Copy the generated 6-character room code (e.g., `K7PX9Q`) or click **"Share"** to copy the join link.

2. **Guest Setup (Device B — Smartphone on Mobile Cellular 4G/5G)**:
   - Open mobile browser (Chrome or Safari) on cellular data.
   - Navigate to `https://cineva.vercel.app/join/K7PX9Q`.
   - Enter your name (`Friend 1`) and click **"Join Watch Room"**.

3. **Verify Synchronization Flow**:
   - **Presence**: Both devices should see `Host (Host)` and `Friend 1` in the participant list.
   - **Play**: Host clicks **Play**. Both devices should immediately begin video playback.
   - **Audio Unlock**: If mobile browser starts video silently due to browser autoplay policy, Device B will display: *"You're synchronized. Click to enable audio"*. Click **"Enable Audio"**; playback continues without resetting the timeline.
   - **Seek**: Host scrubs timeline forward by 30 seconds. Device B converges to the new timestamp in $<50\text{ms}$.
   - **Pause**: Host clicks **Pause**. Both screens freeze on the exact same frame.
   - **Chat**: Host sends a chat message; appears instantly on Device B with sanitized markup.

---

## 🔄 Alternative Cloud Providers

| Layer | Provider Option 2 | Provider Option 3 | Configuration Differences |
| :--- | :--- | :--- | :--- |
| **Frontend** | **Cloudflare Pages** | **Netlify** | Root: `apps/web`, Build: `npm run build`, Output: `dist`. SPA rewrite rule required. |
| **Backend** | **Render** | **Fly.io** | Web Service with `node dist/index.js`. Enable sticky sessions if scaling. |
| **Database** | **Neon** | **AWS RDS** | Provide serverless or standard connection string via `DATABASE_URL`. |
| **Media Storage**| **AWS S3** | **MinIO** | Set `STORAGE_DRIVER=s3`, provide AWS credentials, and configure S3 bucket CORS. |
