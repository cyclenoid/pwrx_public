# PWRX - Power Explorer for Training Data

Self-hosted Strava hub with PostgreSQL (schema separation) and a React dashboard.

## Requirements
- Docker + Docker Compose
- Strava API app + refresh token

German version: `README.de.md`

## Quick Start (Docker)
1. Copy `.env.example` to `.env`
```bash
cp .env.example .env
```

2. Fill required variables in `.env`
- `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REFRESH_TOKEN`
- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
- Optional: `DATA_HUB_DATA_DIR` (default: `./data`)
- Optional: `WATCH_FOLDER_SMB_PATH` (UI hint for self-hosted watch-folder users; default install shows `./data/imports/watch`)
Note: The Postgres password is set only on first initialization of the DB volume. If you change it later, you must either update the DB user password inside Postgres or reset the volume.

3. Start services
```bash
docker compose up -d
```

4. Open services
```text
Dashboard: http://localhost:8088
API health: http://localhost:3001/api/health
pgAdmin: http://localhost:5050
```

## Public-Core Test Mode (No Strava API)
Use this mode to test the app like a public user with file import only.

Set in `.env`:
```env
ADAPTER_FILE_ENABLED=true
ADAPTER_STRAVA_ENABLED=false
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
STRAVA_REFRESH_TOKEN=
```

Then restart backend + dashboard:
```bash
docker compose up -d --force-recreate strava-tracker strava-dashboard
```

This mode does not require private adapter deploy keys (`PWRX_ADAPTER_DEPLOY_KEY` / `PWRX_SSH_DIR`).

## First Sync
On first start, PWRX runs an initial sync automatically (default: last 180 days). This can take time depending on data size and Strava rate limits.

## Sync (Auto + Manual)
- Auto sync runs daily at the configured time.
- Optional: catch-up after startup if the machine was offline.
- Manual sync is available in the UI (Settings/Dashboard).

API endpoints:
- Full sync (activity + backfill): `POST /api/sync` (alias: `POST /api/sync/full`)
- Backfill only (gaps): `POST /api/sync/backfill`

## Non-24/7 Machines
If the device is off during the scheduled time, enable "Catch-up after startup" in Settings. The next start will run the missed sync.

## Update
```bash
git pull
docker compose up -d
```

## Database Migrations
If a release adds DB columns/tables, you must run migrations after updating:
```bash
docker compose exec strava-tracker npm run db:migrate
```

Local dev:
```bash
cd apps/strava
npm run db:migrate
```

Optional auto-migrate on startup:
- Set `MIGRATE_ON_START=1` in `.env`.

Check status:
```bash
docker compose exec strava-tracker npm run db:check
```

## Data & Storage
Exports, logs, and photos are stored in `DATA_HUB_DATA_DIR` (default: `./data`).

## Activity File Import
- Quickstart: `docs/IMPORT_QUICKSTART.md`
- Provider guide (Zwift/Wahoo/Garmin/Apple Health): `docs/IMPORT_PROVIDER_GUIDE.md`
- Docker release test runbook: `docs/DOCKER_RELEASE_TEST_PLAN.md`
- PowerShell smoke script: `scripts/docker-release-smoke.ps1`

### Watch Folder (Self-hosted / SMB)
- PWRX watches the container path `/imports/watch`.
- Standard Docker install exposes the corresponding host path `./data/imports/watch` and shows it in the UI as copy target.
- Optional: set `WATCH_FOLDER_SMB_PATH` in `.env` to show a network share path in the UI (for example `\\\\unraid\\pwrx-import`).

## Private Strava Adapter in CI
If backend dependencies include the private package `@cyclenoid/pwrx-adapter-strava`, the backend CI job needs repository secret:
- `PWRX_ADAPTER_DEPLOY_KEY`

Secret value:
- full private SSH key (OpenSSH format) that matches a read-only deploy key on `cyclenoid/pwrx-adapter-strava`.
- keep OpenSSH key formatting intact (multi-line):
  - `-----BEGIN OPENSSH PRIVATE KEY-----`
  - base64 lines
  - `-----END OPENSSH PRIVATE KEY-----`

Without this secret, `npm ci` in `apps/strava` will fail in GitHub Actions.

For local Docker tests with the private adapter on Windows/Linux:
- set `PWRX_SSH_DIR` in `.env` (for example `C:/Users/<you>/.ssh` on Windows)
- ensure `pwrx_adapter_deploy` exists in that directory and validates:
```bash
ssh-keygen -y -f ~/.ssh/pwrx_adapter_deploy
```

## Security
- Security policy and vulnerability reporting: `SECURITY.md`

## FAQ
**What do the photo sync and download numbers mean?**  
Photo sync = metadata from Strava (URLs/captions). Downloads = local files saved to disk. Both are per-run counts.

**Why is the first sync slow?**  
Large histories and Strava rate limits can slow down the initial import. It will continue in the background.

**Why are segments still pending?**  
Segments are filled in chunks during backfill. If you hit rate limits, run manual sync again later.

**Can I run without auto sync?**  
Yes. Disable Auto Sync in Settings and use the manual sync button when needed.

**Laptop or machine not always on?**  
Enable catch-up after startup. It will run once the machine is back online.

**Do I need migrations after updating?**  
Only when a release adds DB schema changes. Then run `npm run db:migrate`.

## License
Apache-2.0 (see `LICENSE`).

## Support
Buy me a coffee: `https://buymeacoffee.com/cyclenoid`
