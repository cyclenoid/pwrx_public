# Import Quickstart (Normal User Path)

This guide is the easiest way to get your activities into PWRX.

Use this if you just want to train and analyze your data, without complex setup.

## What you need

- running PWRX stack (`docker compose up -d`)
- activity files (`.fit`, `.gpx`, `.tcx`) or a ZIP export

Supported file types:
- `.fit`, `.fit.gz`
- `.gpx`, `.gpx.gz`
- `.tcx`, `.tcx.gz`
- `.zip` (containing supported files)
- `.csv` / `.csv.gz` (`activities.csv` from Strava export for name + gear hints)

## Fastest path: import in the dashboard

1. Open: `http://localhost:8088`
2. Go to **Import**
3. Drag and drop files (or choose files)
4. Start upload
5. Wait for per-file result:
   - `done`
   - `duplicate`
   - `failed`
6. Open import details for error messages and links to created activities

This is the recommended default path for most users.

## Bulk import (ZIP) for first migration

If you have years of history:
1. export data from your source platform/tool
2. upload ZIP in the Import page
3. let PWRX process in background

Notes:
- first full import can take time
- duplicates are skipped automatically

## Optional: watch folder (hands-off imports)

Use this if you regularly drop files from another device/tool.

1. In `.env` set:
```env
WATCH_FOLDER_ENABLED=true
```
2. Restart backend:
```bash
docker compose restart strava-tracker
```
3. Copy files into host watch folder:
- `${DATA_HUB_DATA_DIR}/imports/watch`
- if you configured a network share path, use that share path

PWRX will detect and import files automatically.

## Troubleshooting

**Import says `duplicate`**  
Normal behavior. Activity already exists.

**Import says `failed`**  
Open import details and check `error_message`.  
Fix file set, then retry.

**Watch folder does nothing**  
- verify `WATCH_FOLDER_ENABLED=true`
- verify backend restart
- verify files are copied into the correct watch folder path

## Advanced settings (optional)

Most users can skip this section.

### Important environment flags

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
IMPORT_QUEUE_CONCURRENCY=2
IMPORT_QUEUE_MAX_ATTEMPTS=3
```

Docker defaults in this repository:
- `IMPORT_STORAGE_PATH=/imports/strava`
- `WATCH_FOLDER_PATH=/imports/watch`
- `WATCH_FOLDER_SMB_PATH=./data/imports/watch` (UI hint fallback)

Host mounts in `docker-compose.yml`:
- `${DATA_HUB_DATA_DIR:-./data}/imports/strava:/imports/strava`
- `${DATA_HUB_DATA_DIR:-./data}/imports/watch:/imports/watch`

### API endpoints (scripts/integration)

API base in Docker setup: `http://localhost:3001/api`

- `POST /api/import/file` (`multipart/form-data`, field `file`)
- `POST /api/import/batch` (`multipart/form-data`, field `files`)
- `GET /api/imports?limit=50`
- `GET /api/imports/:id`
- `POST /api/imports/:id/retry-failed`
- `GET /api/import/watch/status`
- `POST /api/import/watch/rescan`

