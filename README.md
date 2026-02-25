# PWRX - Power Explorer for Training Data

Self-hosted training data dashboard with PostgreSQL (schema separation) and a React UI.

> Public Beta (`v0.9.0-beta.1`)
> The default setup is file-import-first (FIT/GPX/TCX + Strava export ZIP). Optional integrations are not part of the standard distribution and must be configured independently by the user.

## Requirements
- Docker + Docker Compose
- Git (to clone the repository)
- Free disk space for database/imports/photos (depending on usage)

German version: `README.de.md`
Release notes: `docs/RELEASE_NOTES_v0.9.0-beta.1.en.md` / `docs/RELEASE_NOTES_v0.9.0-beta.1.de.md`

## Quick Start (Docker)
1. Copy `.env.example` to `.env`
```bash
cp .env.example .env
```

2. Fill required variables in `.env`
- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
- `PGADMIN_DEFAULT_EMAIL`, `PGADMIN_DEFAULT_PASSWORD`
- Optional: `DATA_HUB_DATA_DIR` (default: `./data`)
- Optional: `WATCH_FOLDER_SMB_PATH` (UI hint for self-hosted watch-folder users; default install shows `./data/imports/watch`)
Note: PWRX works out of the box with file imports. Direct third-party API integrations are not part of the default setup and must be configured independently by the user.
Note: The Postgres password is set only on first initialization of the DB volume. If you change it later, you must either update the DB user password inside Postgres or reset the volume.

3. Start services
```bash
docker compose up -d
```

Optional (self-hosted addon): enable direct Strava sync features on top of the same public base:
```bash
docker compose -f docker-compose.yml -f docker-compose.strava-addon.yml up -d
```
The built-in addon mode uses your own Strava credentials from `.env`. External/private adapter modules remain optional and self-managed.

4. Open services
```text
Dashboard: http://localhost:8088
API health: http://localhost:3001/api/health
pgAdmin: http://localhost:5050
```

Note: `strava-tracker` in Docker commands below is a legacy internal service name. The public default setup remains file import only.

## First Start (Recommended Flow)
1. Open `http://localhost:8088`
2. Use the import button to upload FIT/GPX/TCX files or a Strava account export ZIP
3. Open Settings and set at least body weight (FTP optional but recommended)
4. Review gear and segment settings if needed

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
- Core path for Public Beta: manual import of FIT/GPX/TCX files and Strava account export ZIPs (including names/gear mapping and optional media import from the export).
- Quickstart: `docs/IMPORT_QUICKSTART.md`
- Provider guide (Zwift/Wahoo/Garmin/Apple Health): `docs/IMPORT_PROVIDER_GUIDE.md`
- Docker release test runbook: `docs/DOCKER_RELEASE_TEST_PLAN.md`
- PowerShell smoke script: `scripts/docker-release-smoke.ps1`

### Watch Folder (Self-hosted / SMB)
- PWRX watches the container path `/imports/watch`.
- Standard Docker install exposes the corresponding host path `./data/imports/watch` and shows it in the UI as copy target.
- Optional: set `WATCH_FOLDER_SMB_PATH` in `.env` to show a network share path in the UI (for example `\\\\unraid\\pwrx-import`).

## Public Base + Optional Add-on (Unraid / Self-hosted)
- Recommended for testing and daily use: run the same public base as all users (`docker-compose.yml`).
- Add optional direct Strava sync only on your own instance with `docker-compose.strava-addon.yml`.
- Repo strategy and workflow: `docs/REPO_STRATEGY.md`
- Unraid example flow: `docs/UNRAID_PUBLIC_BASE_PRIVATE_ADDON.md`

## Optional Integrations (Advanced / Self-managed)
The public default setup is file-import-first and does not require direct API integrations.

If users build their own integrations (for example via external adapter modules), this is outside the standard distribution and must be configured and operated independently.

## Security
- Security policy and vulnerability reporting: `SECURITY.md`

## FAQ
**What do the photo sync and download numbers mean?**  
For optional sync integrations, photo sync = imported photo metadata (URLs/captions). Downloads = local files saved to disk. Both are per-run counts.

**Why is the first import slow?**  
Large ZIP exports, media import, and many activities can slow down the first import. Background queue processing continues after upload.

**Why are segments still pending?**  
Segments are filled in chunks during backfill. If you hit rate limits, run manual sync again later.

**Can I run without auto sync?**  
Yes. The public default setup works with file imports only. If you use an optional sync integration, you can disable Auto Sync in Settings and run sync manually when needed.

**Laptop or machine not always on?**  
Use manual imports or (self-hosted) the watch folder. Imports continue once the machine is back online.

**Do I need migrations after updating?**  
Only when a release adds DB schema changes. Then run `npm run db:migrate`.

## License
Apache-2.0 (see `LICENSE`).

## Support
Buy me a coffee: `https://buymeacoffee.com/cyclenoid`

## Public Beta Feedback
- Use GitHub Issues for bug reports and feature requests (templates included).
- If you enable GitHub Discussions for the repo, use it for setup questions and UX feedback to keep issues actionable.
- Please include version (`v0.9.0-beta.1`), environment (OS/Docker/browser/proxy), and reproduction steps for import/queue issues.
