# Deployment checklist

Use this checklist for the host that stores and serves media. The items are intentionally unchecked; complete them for each deployment.

## Before starting

- [ ] Install Node.js 20 or newer and run `npm ci`.
- [ ] Configure a persistent database and `MEDIA_STORAGE_PATH`.
- [ ] Set `CLIENT_URL` and `ALLOWED_ORIGINS` to the expected client origin.
- [ ] Keep `.env` and the database outside public static directories.
- [ ] Confirm there is enough free disk space for uploads and generated HLS files.
- [ ] Configure HTTPS through a reverse proxy or use the tunnel started by `npm run start:share`.
- [ ] Back up the database and media directory.

## Verify

- [ ] Run `npm run typecheck`, `npm test`, and `npm run build`.
- [ ] Check `/health` after startup.
- [ ] Create and join a room from a second browser or device.
- [ ] Upload a video and confirm it processes and streams from the host.
- [ ] Check play, pause, seek, chat, and reconnect behavior.
- [ ] Confirm guests can reach the server through the configured tunnel or proxy.

Do not mark a live or security check complete based only on a local build or automated test.
