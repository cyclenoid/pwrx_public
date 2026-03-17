# PWRX - Power Explorer for Training Data

Self-hosted Strava hub with PostgreSQL (schema separation) and a React dashboard.

## Deployment model

PWRX is intended to run as a standalone app from this repository.

- End users only need this repo, Docker, and PostgreSQL.
- No separate `data-hub` repository or multi-app platform is required.
- Shared-host setups are optional operator variants, not the product baseline.

## Requirements
- Docker + Docker Compose
- PostgreSQL
- Optional, private-only: Strava connector access by separate arrangement

German version: `README.de.md`

## Quick Start (Docker)
1. Copy `.env.example` to `.env`
```bash
cp .env.example .env
```

2. Fill required variables in `.env`
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

## Public-Core Mode (Official Public Baseline)
This is the official public baseline for this repository.

- file import works without Strava API access
- no private adapter package access is required
- no SSH deploy key is required

Set in `.env`:
```env
ADAPTER_FILE_ENABLED=true
ADAPTER_STRAVA_ENABLED=false
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
STRAVA_REFRESH_TOKEN=
ADAPTER_STRAVA_PACKAGE=
ADAPTER_STRAVA_MODULE=
PWRX_SSH_DIR=
```

Then restart backend + dashboard:
```bash
docker compose up -d --force-recreate strava-tracker strava-dashboard
```

## Private Strava Connector (Not Part of the Public Offering)
The public repository does not officially ship or support a Strava connector for end users.

Reason:
- Strava API access is subject to Strava's developer review and athlete-capacity restrictions.
- New apps start in a single-athlete mode until reviewed by Strava.
- Because of that, PWRX public docs must not present Strava API enablement as a standard public feature.

Official Strava sources:
- https://developers.strava.com/docs/rate-limits/
- https://developers.strava.com/docs/getting-started/

If you enable:
```env
ADAPTER_STRAVA_ENABLED=true
```

you are explicitly entering a private maintainer/operator setup that requires:
- private adapter access
- Strava credentials
- a host SSH directory containing `pwrx_adapter_deploy`

In this private mode, the Docker runtime injects the private adapter package during container startup. The public `package.json` intentionally does not depend on it by default.

Recommended private settings:
```env
ADAPTER_STRAVA_PACKAGE=git+ssh://git@github.com/cyclenoid/pwrx-adapter-strava.git
ADAPTER_STRAVA_MODULE=@cyclenoid/pwrx-adapter-strava
```

Important:
- `ADAPTER_STRAVA_PACKAGE` is the install source used by Docker/npm
- `ADAPTER_STRAVA_MODULE` is the runtime module id used by Node
- keep those separate; a Git URL is not a valid `require()` module id

If that key is missing, backend startup will fail with:
```text
Missing /root/.ssh/pwrx_adapter_deploy for private adapter install
```

Important:
- `PWRX_SSH_DIR` must be a host path, not the container path `/root/.ssh`
- example Windows host path: `C:/Users/<you>/.ssh`
- example Linux host path: `/home/<you>/.ssh`
This private connector path is maintainer-only and not part of the official public support contract.

Important technical rule:
- public-core no longer falls back to local Strava modules
- if the private adapter cannot be installed or loaded, Strava stays disabled
- this is intentional

## First Sync
On first start, PWRX runs an initial file-import/sync initialization. In private Strava operator setups, a Strava-backed initial sync can take time depending on data size and Strava rate limits.

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

## Workshop App (Optional, dedicated DB on shared PostgreSQL)
The bike workshop app can run on the same PostgreSQL server, but should use its own database and app user.

1. Set optional variables in `.env`:
```env
WORKSHOP_APP_PATH=../workshop
WORKSHOP_APP_PORT=8096
WORKSHOP_DB_NAME=workshop
WORKSHOP_DB_USER=workshop_app
WORKSHOP_DB_PASSWORD=...
WORKSHOP_DB_SCHEMA=
```

2. Start the overlay service:
```bash
docker compose -f docker-compose.yml -f docker-compose.workshop.yml up -d workshop-app
```

3. Open:
```text
Workshop App: http://localhost:8096
```

The service uses the same PostgreSQL server, but not the same application database.
Recommended runtime:
- DB: `workshop`
- User: `workshop_app`
- Schema: `public` (leave `WORKSHOP_DB_SCHEMA` empty)

Optional reminder channels for workshop appointments:
- SMTP: `WORKSHOP_SMTP_*`
- Telegram Bot: `WORKSHOP_TELEGRAM_BOT_TOKEN`, `WORKSHOP_TELEGRAM_CHAT_ID`

## Activity File Import
- Quickstart: `docs/IMPORT_QUICKSTART.md`
- Provider guide (Zwift/Wahoo/Garmin/Apple Health): `docs/IMPORT_PROVIDER_GUIDE.md`
- Docker release test runbook: `docs/DOCKER_RELEASE_TEST_PLAN.md`
- Deployment runbook (public repo -> Unraid + Strava override): `docs/DEPLOYMENT_RUNBOOK.md`
- PowerShell smoke script: `scripts/docker-release-smoke.ps1`

### Watch Folder (Self-hosted / SMB)
- PWRX watches the container path `/imports/watch`.
- Standard Docker install exposes the corresponding host path `./data/imports/watch` and shows it in the UI as copy target.
- Optional: set `WATCH_FOLDER_SMB_PATH` in `.env` to show a network share path in the UI (for example `\\\\unraid\\pwrx-import`).

## Private Strava Adapter in CI
Public backend checks now run without the private adapter.

Optional private-adapter access validation in CI can still use repository secret:
- `PWRX_ADAPTER_DEPLOY_KEY`

Secret value:
- full private SSH key (OpenSSH format) that matches a read-only deploy key on `cyclenoid/pwrx-adapter-strava`.
- keep OpenSSH key formatting intact (multi-line):
  - `-----BEGIN OPENSSH PRIVATE KEY-----`
  - base64 lines
  - `-----END OPENSSH PRIVATE KEY-----`

Without this secret, public backend lint/build/tests still run. Only the optional private-adapter access check is skipped.

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
