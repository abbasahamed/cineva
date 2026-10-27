# CINEVA security notes

This document describes security controls visible in the current implementation. It is not a certification or a substitute for a deployment-specific security review.

## Application controls

- Room membership and host actions are checked by the server using room session IDs.
- API and socket payloads use shared validation schemas; chat content is sanitized before it is broadcast.
- Upload routes check room authorization, accepted file types, file size, and local disk quota.
- Media paths are resolved within the configured storage directory.
- HTTP responses use Helmet, CORS uses configured origins, and API routes have rate limits.
- FFmpeg and FFprobe are invoked with argument arrays.

## Deployment responsibilities

- Serve public traffic over HTTPS and configure `CLIENT_URL` and `ALLOWED_ORIGINS` for the intended client origin.
- Keep `.env`, the database, logs, and uploaded media private. Use a persistent, access-controlled media directory.
- Room codes and session IDs grant access. Share guest links only with intended participants.
- The default rate-limit store is in memory, so limits are per server process.
- Public tunnels expose the host server to the internet. They provide connectivity only and do not add authentication or media storage.

Report vulnerabilities through the process in [SECURITY.md](../SECURITY.md). Do not include real credentials or private media in reports.
