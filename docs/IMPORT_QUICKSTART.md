# Import Quickstart (FIT/GPX/TCX/ZIP)

This guide covers the fastest path to import activity files into PWRX.

## 1) Configure import settings
Set these variables in `.env` (root):

```env
WATCH_FOLDER_ENABLED=false
WATCH_FOLDER_SMB_PATH=
WATCH_FOLDER_RECURSIVE=true
WATCH_FOLDER_POLL_SECONDS=15
WATCH_FOLDER_STABLE_CHECKS=2
IMPORT_ZIP_MAX_ENTRIES=500
IMPORT_STRAVA_EXPORT_ZIP_MAX_ENTRIES=20000
IMPORT_ZIP_MAX_TOTAL_BYTES=314572800
IMPORT_QUEUE_API_ENABLED=true
IMPORT_QUEUE_ENABLED=true
IMPORT_QUEUE_POLL_MS=2000
IMPORT_QUEUE_CONCURRENCY=2
IMPORT_QUEUE_MAX_ATTEMPTS=3
IMPORT_QUEUE_RETRY_BASE_MS=5000
IMPORT_QUEUE_RETRY_MAX_MS=300000
IMPORT_QUEUE_HEALTH_STALE_MS=12000
IMPORT_QUEUE_ALERT_FAILED_24H=5
IMPORT_QUEUE_ALERT_READY=20
IMPORT_QUEUE_ALERT_MONITOR_ENABLED=true
IMPORT_QUEUE_ALERT_WEBHOOK_URL=
IMPORT_QUEUE_ALERT_POLL_MS=30000
IMPORT_QUEUE_ALERT_COOLDOWN_MS=300000
```

Docker defaults in this repo:
- `IMPORT_STORAGE_PATH=/imports/strava`
- `WATCH_FOLDER_PATH=/imports/watch`
- `WATCH_FOLDER_SMB_PATH=./data/imports/watch` (UI hint fallback in standard Docker install)

Host mounts in `docker-compose.yml`:
- `${DATA_HUB_DATA_DIR:-./data}/imports/strava:/imports/strava`
- `${DATA_HUB_DATA_DIR:-./data}/imports/watch:/imports/watch`

## 2) Start stack and run migrations

```bash
docker compose up -d
docker compose exec strava-tracker npm run db:migrate
docker compose exec strava-tracker npm run db:check
```

## 3) Import manually in UI
1. Open dashboard: `http://localhost:8088`
2. Open page `Import` in navigation.
3. Drag and drop files (`.fit`, `.gpx`, `.tcx`, `.zip`) or select files.
4. Start upload and watch per-file status:
   - `done`
   - `duplicate`
   - `failed`
5. Open import run detail for messages and links to created activities.

## 4) Optional: use watch folder
Enable in `.env`:

```env
WATCH_FOLDER_ENABLED=true
```

Then restart backend:

```bash
docker compose restart strava-tracker
```

Drop files into:
- `${DATA_HUB_DATA_DIR}/imports/watch` (host path)
- or the SMB share path you configured in `WATCH_FOLDER_SMB_PATH` (shown in the UI)

Backend scans periodically and imports stable files automatically.

## 5) API endpoints (for scripts/integration)
- `POST /api/import/file` (`multipart/form-data`, field `file`)
- `POST /api/import/batch` (`multipart/form-data`, field `files`)
- `GET /api/import/metrics?days=30`
- `GET /api/import/queue/status`
- `GET /api/import/queue/failed?limit=20`
- `POST /api/import/queue/jobs/:jobId/requeue`
- `POST /api/import/queue/requeue-failed`
- `GET /api/imports?limit=50`
- `GET /api/imports/:id`
- `POST /api/imports/:id/retry-failed`
- `GET /api/import/watch/status`
- `POST /api/import/watch/rescan`

API base in Docker setup: `http://localhost:3001/api`

## 6) Notes
- File dedupe uses `sha256`.
- Activity dedupe uses fingerprint (`start_time + duration + distance + sport`).
- Single upload file size limit is `100 MB`.
- ZIP imports only process supported activity files inside archive.
- With queue enabled, upload endpoints may return `queued` (HTTP `202`) and continue processing in background.
- Failed queue jobs are retried with exponential backoff until `IMPORT_QUEUE_MAX_ATTEMPTS` is reached.
- Failed jobs can be inspected and requeued from Import UI (`Failed queue jobs`) or via API.
- If `IMPORT_QUEUE_ALERT_WEBHOOK_URL` is set, critical/warning queue alerts are sent via webhook with cooldown control.
