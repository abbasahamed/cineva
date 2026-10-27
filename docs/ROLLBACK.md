# CINEVA recovery

Before upgrading, back up the database and the configured `MEDIA_STORAGE_PATH`. They contain room state and media needed by the running installation.

## Application rollback

1. Stop the CINEVA server and tunnel process.
2. Restore the previous application revision or deployment artifact.
3. Reinstall dependencies with `npm ci` and rebuild with `npm run build`.
4. Restart the server and check `/health`.

Do not reset the production database to roll back application code. If a schema change is incompatible with the previous version, restore a tested database backup or use a reviewed forward migration.

## Media or database recovery

Restore the database and media directory from backups taken at compatible points in time. Keep the restored files private and verify that `MEDIA_STORAGE_PATH` points to the restored directory before restarting.

For a playback or connectivity incident, check server logs, disk space, the media processing status, `CLIENT_URL`, `ALLOWED_ORIGINS`, and the tunnel or reverse-proxy connection. See the [deployment guide](DEPLOY.md) for configuration details.
