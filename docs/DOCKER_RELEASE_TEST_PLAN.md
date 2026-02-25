# Docker Release Test Plan (Public Beta)

This runbook defines a repeatable Docker test flow for validating PWRX before beta updates and stable releases.

Goals:
- verify core import and analytics behavior in a clean Docker environment
- validate file-import workflows (including large export ZIPs)
- keep release decisions explicit with pass/fail gates

## Current status snapshot (2026-02-25)

- Public repo: `cyclenoid/pwrx_public` published
- Public release: `v0.9.0-beta.1` (pre-release)
- CI status: green (`Backend Build and Import Tests`, `Frontend Lint and Build`, `Docker Build Smoke`)
- Core product mode: file-import-first (no direct API integration required in standard setup)
- Validation status:
  - Zwift file import: executed successfully (metadata-only FIT files correctly skipped)
  - Apple bridge export: pending dataset execution
  - Strava account export ZIP: available and manually validated in local Docker

## 1) Test Scope

In scope:
- Backend API health and capabilities
- Frontend build/runtime and core pages
- File import pipeline (`fit/gpx/tcx/csv/zip`, including `.gz` variants)
- Strava account export ZIP import (chunked/resumable upload)
- Dedupe behavior (sha256 + fingerprint)
- Queue visibility / retry / delete failed jobs
- Watch-folder behavior (self-hosted optional path)
- Segment generation and segment list/detail UX

Out of scope (for this runbook):
- direct provider OAuth/API integrations (not part of the public default distribution)
- Apple Health raw XML parsing (not part of current MVP)

## 2) Provider Matrix (Current)

Use this matrix as the planning baseline for release validation:

| Provider | Data Source | Format(s) | Status | Notes |
|---|---|---|---|---|
| Zwift | Exported activity files | FIT (preferred), TCX/GPX | Validated | Metadata-only FIT files may be skipped |
| Apple (via bridge app) | HealthFit / RunGap exports | FIT/TCX/GPX | Planned | Prefer FIT/TCX where possible |
| Strava | Account export | ZIP (activities + CSV, optional media) | Validated (manual) | Test both with/without media import |
| Garmin | Account export | FIT/TCX/GPX | Not available | Skip until fixtures are available |

## 3) Environment Profile (Public Default)

Use file import only (recommended release baseline):

```env
ADAPTER_FILE_ENABLED=true
ADAPTER_STRAVA_ENABLED=false
```

Notes:
- no Strava API credentials required
- no deploy key / private adapter package required

## 4) Setup (Clean Docker Test Environment)

1. Create test `.env` from `.env.example`.
2. Set database and pgAdmin credentials.
3. Confirm public-default profile:
   - `ADAPTER_FILE_ENABLED=true`
   - `ADAPTER_STRAVA_ENABLED=false`
4. Start stack:

```bash
docker compose up -d --build
```

5. Initialize/check DB (if not already auto-run by container startup):

```bash
docker compose exec -T strava-tracker npm run db:migrate
docker compose exec -T strava-tracker npm run db:check
```

6. Verify health:

```bash
curl http://localhost:3001/api/health
curl http://localhost:3001/api/capabilities
curl -I http://localhost:8088/
```

Optional shortcut (PowerShell smoke runner):

```powershell
pwsh ./scripts/docker-release-smoke.ps1
```

With provider fixture:

```powershell
pwsh ./scripts/docker-release-smoke.ps1 -SkipStart -ImportFixturePath "C:\path\to\provider-file.fit"
```

## 5) Automated Preflight Checks

Run before manual provider tests:

```bash
# backend
cd apps/strava
npm ci
npm run lint
npm run build
npm run test:import
npm run test:segments

# frontend
cd ../../dashboards/strava
npm ci
npm run lint
npm run build
```

Notes:
- Frontend lint warnings may appear as GitHub annotations while the CI job still passes.
- Treat warnings as cleanup backlog unless they indicate a real regression.

## 6) Manual Import Test Flow (Per Provider)

For each provider dataset (Zwift, Apple, Strava export):

1. Open dashboard: `http://localhost:8088`.
2. Open Import page (`/import`).
3. Upload a small batch first (3-10 files) or a smaller ZIP slice.
4. Verify statuses:
   - `done` / `ok` for valid files
   - `duplicate` for reruns
   - `failed` only for intentionally invalid samples
5. For Strava exports:
   - preferred: upload the full Strava account export ZIP
   - alternative: upload `activities.csv` together with activity files so names/gear mapping are applied
   - test media import checkbox on/off
6. Verify imported activities appear in Activities and Detail pages.
7. Verify segment pages:
   - `/segments` list loads
   - sorting works (`difficulty`, `distance`, `bestTime`, etc.)
   - segment detail opens and shows efforts/trend where available

## 7) Watch-Folder Validation (Optional / Self-hosted)

1. Enable:

```env
WATCH_FOLDER_ENABLED=true
WATCH_FOLDER_SMB_PATH=\\\\unraid\\pwrx-import   # optional UI hint for Finder/Explorer users
```

2. Restart backend:

```bash
docker compose restart strava-tracker
```

3. Drop files in the watch-folder host path (or via SMB share that points to the same path):
- `${DATA_HUB_DATA_DIR}/imports/watch`

4. Verify:
- stable-file handling (no partial-file import)
- queue state and final import results
- duplicate handling on re-copy

## 8) Dedupe and Regression Checks

Run these explicit checks:
- re-upload same file set -> must produce duplicates, not duplicate activities
- upload mixed ZIP (supported + unsupported files) -> unsupported files should fail safely
- requeue and delete failed queue jobs from Import UI -> no API errors, queue state updates correctly
- run segment rebuild / local segment rename tools from Settings -> no API errors

## 9) Release Gate (Pass Criteria)

All must pass for a beta update release:
- CI green (`backend`, `frontend`, `docker-smoke`)
- Docker stack healthy (`/api/health`, dashboard reachable)
- Import tests passed for available datasets:
  - Zwift sample set
  - Apple bridge-export sample set (when available)
  - Strava export sample set
- No blocking UI regressions on:
  - Dashboard
  - Activities + Activity Detail
  - Segments list + Segment Detail
  - Settings / Import

Additional gate for stable `v1.0`:
- Apple + Strava datasets both validated and documented
- storage/backup guidance reviewed
- no critical open bugs in import/queue/segments

## 10) Execution Log Template

For each release candidate, keep a short log:

- Date:
- Commit/Tag:
- Profile: `public-default` (`ADAPTER_STRAVA_ENABLED=false`)
- Datasets used:
  - Zwift:
  - Apple:
  - Strava export:
- Result summary:
- Open issues:
- Go/No-Go decision:

### Latest execution log (Public Beta baseline)

- Date: 2026-02-25
- Commit/Tag: `v0.9.0-beta.1`
- Profile: `public-default` (`ADAPTER_STRAVA_ENABLED=false`)
- Datasets used:
  - Zwift: validated previously (metadata-only FIT files skipped)
  - Apple: pending local fixture execution
  - Strava export: validated (ZIP upload, names/gear/media import flow)
- Result summary:
  - Public CI green on `main`
  - Public repo + pre-release published
  - Core Docker/file-import workflow validated
- Open issues:
  - Apple dataset validation still pending
  - frontend lint warnings remain (non-blocking)
- Go/No-Go decision:
  - Go for Public Beta
  - No-Go for stable `v1.0` yet

## 11) Planned execution order (next validation cycle)

1. Run baseline smoke in public-default profile (`ADAPTER_STRAVA_ENABLED=false`).
2. Execute Zwift dataset import run and record result.
3. Execute Apple bridge-export dataset import run and record result.
4. Execute Strava account-export ZIP regression run (with/without media import).
5. Reassess stable `v1.0` gate.
