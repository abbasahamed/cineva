# CINEVA architecture

CINEVA is a self-hosted watch-party application. One long-running Node.js server manages rooms, synchronization, chat, and local media. The built React client is served by the server, and remote guests can reach it through a public tunnel or a reverse proxy.

## Requests and playback

- REST endpoints handle room lifecycle and media uploads.
- Socket.IO carries room presence, chat, signaling, and playback state changes.
- The server stores the authoritative playback timeline. Clients estimate server time from round-trip clock samples and correct drift with playback-rate adjustments or seeks.
- Video bytes use HTTP range requests. The server packages media into HLS when browser compatibility or track support requires it.
- FFmpeg and FFprobe support media inspection and processing. Child processes receive argument arrays rather than shell-built command strings.

## Media and persistence

Uploads, temporary processing files, and generated HLS output stay under the configured local media directory (`MEDIA_STORAGE_PATH`, default `uploads/`). Storage quota checks cover the local directory, and room cleanup removes room-specific files and database records. The built-in demo media is shared and is excluded from room cleanup.

CINEVA does not upload movie files to S3-compatible object storage. Cloudflare Quick Tunnel and Pinggy are optional network tunnels only; they provide guest connectivity to the host server.

SQLite is the default for local development. PostgreSQL can be configured with `DATABASE_URL` and the corresponding Prisma schema setup. Keep the database and media directory on persistent storage and back them up together.

## Deployment shape

The host runs a persistent Node process. The frontend, REST API, sockets, and media routes share the server origin by default. A reverse proxy can terminate TLS and forward HTTP and WebSocket traffic. Alternatively, `npm run start:share` starts the server with a Cloudflare Quick Tunnel and falls back to Pinggy when needed.

The host must remain online, and its upload bandwidth and disk space limit the watch party. A tunnel does not increase media capacity or provide media backups.

## Security boundaries

Room codes are join identifiers, and session IDs are bearer credentials. Do not share them publicly. The server checks host permissions and validates incoming room and chat data. Upload handling enforces extension, size, quota, and room authorization checks. Deploy behind HTTPS, set explicit allowed origins, and keep local media and database backups private.

See [SECURITY.md](../SECURITY.md) for vulnerability reporting and [SECURITY_AUDIT.md](SECURITY_AUDIT.md) for the implementation's security notes and limitations.
