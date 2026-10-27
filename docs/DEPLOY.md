# Self-hosting CINEVA

CINEVA runs on a host that stores and serves the selected media. Keep the server process and its storage online for the duration of a watch party. Remote-access tunnels expose the server to guests; they do not store media.

## Requirements

- Node.js 20 or newer and npm
- FFmpeg and FFprobe installed on the host and available on `PATH`
- A persistent local directory with enough space for uploaded files and generated HLS output
- A reachable host and sufficient upload bandwidth for the number of viewers

## Install and configure

```bash
git clone <repository-url> cineva
cd cineva
npm ci
cp .env.example apps/server/.env
```

Edit `apps/server/.env`. Set a private `DATABASE_URL` if using PostgreSQL, and choose a persistent `MEDIA_STORAGE_PATH`. The default database is SQLite and the default media directory is `uploads/`.

Initialize the database and build the workspaces:

```bash
npm run db:push --workspace=@cineva/server
npm run build
```

Start CINEVA with a public tunnel:

```bash
npm run start:share
```

The script starts the server and attempts a Cloudflare Quick Tunnel, with Pinggy as a fallback. Keep the printed guest URL private to the people you invite. For a custom reverse proxy or tunnel, run `npm start --workspace=@cineva/server` and configure HTTPS, WebSocket forwarding, and the allowed origins in the server environment.

## Operations

- Keep the database and `MEDIA_STORAGE_PATH` on persistent storage. Back up both before upgrades.
- Ensure the host has enough free disk space for the original file and processed media.
- `CLIENT_URL` and `ALLOWED_ORIGINS` must match the public client origin when using a custom domain.
- Set public client URLs with `VITE_API_URL`, `VITE_SOCKET_URL`, and `VITE_APP_URL` only when they differ from the default same-origin setup.
- Do not expose the server directly without HTTPS and an origin policy appropriate to your deployment.

See the [production architecture](PRODUCTION_ARCHITECTURE.md), [security notes](SECURITY_AUDIT.md), and [rollback guide](ROLLBACK.md) for more detail.
