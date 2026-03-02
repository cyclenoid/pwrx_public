# Docker Release Test Plan (Pre-Public)

This runbook defines a repeatable test flow before publishing the repository.

Goals:
- verify core import and analytics behavior in a clean Docker environment
- validate provider file imports (Apple + Zwift now, Strava export when available)
- ensure release readiness with explicit pass/fail gates

## Current status snapshot (2026-02-21)

- CI status: green (`backend`, `frontend`, `docker-smoke` configured; frontend lint now blocking in workflow)
- Deploy status: Unraid healthy (`/api/health`, `/api/capabilities`, `/segments`)
- Local Docker status: healthy in both profiles (public-core without key, private-adapter with key)
- Provider test data:
  - Zwift: executed (batch import run #6, 39 files -> 24 ok, 15 skipped metadata-only FIT, 0 failed)
  - Apple bridge export: pending execution
  - Strava account export: requested, not received yet
- Validation notes:
  - smoke script passed locally (`scripts/docker-release-smoke.ps1 -SkipStart`) and created run #7 (`done`, files_ok=1)
  - queue status clean after import retry/fix cycle (`failed=0`)
  - frontend lint command is green (warnings only; no errors)

## 1) Test Scope

In scope:
- Backend API health and capabilities
- Frontend build/runtime and core pages
- File import pipeline (`fit/gpx/tcx/csv/zip`, including `.gz` variants)
- Dedupe behavior (sha256 + fingerprint)
- Watch-folder behavior
- Segment generation and segment list/detail UX

Out of scope (for this runbook):
- direct provider OAuth flows beyond current private adapter setup
- Apple Health raw XML parsing (not part of current MVP)

## 2) Provider Matrix (Current)

Use this matrix as planning baseline for release validation:

| Provider | Data Source | Format(s) | Status | Notes |
|---|---|---|---|---|
| Zwift | Exported activity files | FIT (preferred), TCX | Planned | Good candidate for first smoke run |
| Apple (via bridge app) | HealthFit / RunGap exports | FIT/TCX/GPX | Planned | Prefer FIT/TCX when possible |
| Strava | Account export (requested) | Typically ZIP with activity files | Pending | Execute once export arrives |
| Garmin | Account export | FIT/TCX/GPX | Not available | Skip for now |

## 3) Environment Profiles

### A) Public-core style test (recommended baseline)

Use file import only, disable Strava adapter:

```env
ADAPTER_FILE_ENABLED=true
ADAPTER_STRAVA_ENABLED=false
```

Notes:
- no Strava API credentials required
- no deploy key / `PWRX_SSH_DIR` required

### B) Private adapter integration test

Use private adapter package:

```env
ADAPTER_FILE_ENABLED=true
ADAPTER_STRAVA_ENABLED=true
ADAPTER_STRAVA_MODULE=@cyclenoid/pwrx-adapter-strava
```

## 4) Setup (Clean Docker Test Environment)

1. Create test `.env` from `.env.example`.
2. Set DB credentials and paths.
3. Choose profile A or B above.
   - For profile B on local Docker, set `PWRX_SSH_DIR` in `.env` (example: `C:/Users/<you>/.ssh`).
   - Validate key before startup:
   ```bash
   ssh-keygen -y -f ~/.ssh/pwrx_adapter_deploy
   ```
4. Start stack:

```bash
docker compose up -d
```

5. Initialize/check DB:

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

## 6) Manual Import Test Flow (Per Provider)

For each provider dataset (Zwift, Apple, later Strava export):

1. Open dashboard: `http://localhost:8088`.
2. Go to Import page (`/settings?tab=import` or `/import` redirect).
3. Upload a small batch first (3-10 files).
4. Verify statuses:
   - `done` for valid files
   - `duplicate` for reruns
   - `failed` only for intentionally invalid samples
   - for Strava exports: import `activities.csv` once so activity names from export are applied
5. Verify imported activities appear in Activities and Detail pages.
6. Verify segment pages:
   - `/segments` list loads
   - sorting works (`difficulty`, `distance`, `bestTime`, etc.)
   - segment detail opens and shows efforts/trend where available

## 7) Watch-Folder Validation

1. Enable:

```env
WATCH_FOLDER_ENABLED=true
WATCH_FOLDER_SMB_PATH=\\\\unraid\\pwrx-import   # optional UI hint for Finder/Explorer users
```

2. Restart backend:

```bash
docker compose restart strava-tracker
```

3. Drop files in watch folder host path (or via SMB share that points to the same path):
- `${DATA_HUB_DATA_DIR}/imports/watch`

4. Verify:
- stable-file handling (no partial-file import)
- queue state and final import results
- duplicate handling on re-copy

## 8) Dedupe and Regression Checks

Run these explicit checks:
- re-upload same file set -> must produce duplicates, not duplicate activities
- upload mixed ZIP (supported + unsupported files) -> unsupported files should fail safely
- run backfill/rebuild segment operations from Settings/System and verify no API errors

## 9) Release Gate (Pass Criteria)

All must pass:
- CI green (`backend`, `frontend`, `docker-smoke`)
- Docker stack healthy (`api/health`, dashboard reachable)
- Import tests passed for:
  - Zwift sample set
  - Apple bridge-export sample set
  - Strava export sample set (once received)
- No blocking UI regressions on:
  - Dashboard
  - Activities + Activity Detail
  - Segments list + Segment Detail
  - Settings/Import

Current gate assessment (2026-02-21):
- PASS: Docker health + smoke + queue stability
- PASS: Zwift import dataset (with metadata-only FIT files treated as skipped)
- PASS: frontend lint command + CI workflow gate updated (lint no longer advisory)
- BLOCKED: Apple dataset execution pending
- BLOCKED: Strava export dataset pending (export not delivered yet)

## 10) Execution Log Template

For each release candidate, keep a short log:

- Date:
- Commit/Tag:
- Profile (`public-core` or `private-adapter`):
- Datasets used:
  - Zwift:
  - Apple:
  - Strava export:
- Result summary:
- Open issues:
- Go/No-Go decision:

### Latest execution log

- Date: 2026-02-21
- Commit/Tag: local working tree (pre-tag)
- Profile (`public-core` or `private-adapter`): `public-core` (`ADAPTER_STRAVA_ENABLED=false`)
- Datasets used:
  - Zwift: FIT batch in import run #6 (historical file set)
  - Apple: not available in local fixtures
  - Strava export: pending from provider
- Result summary:
  - Smoke script passed (`health`, `capabilities`, dashboard, import smoke)
  - Run #6 final: `files_total=39`, `files_ok=24`, `files_skipped=15`, `files_failed=0`
  - Queue final: `failed=0`, `alerts=[]`
- Open issues:
  - frontend lint debt still present as warnings (`any` + hook dependency hints), but no blocking errors
  - Apple and Strava export validation pending
  - public-core cleanup (remove remaining private/Strava coupling traces) still open
- Go/No-Go decision:
  - No-Go for public stable v1.0 yet

## 11) Current planned execution order

1. Run baseline smoke in profile A (`ADAPTER_STRAVA_ENABLED=false`).
2. Execute Zwift dataset import run and record result.
3. Execute Apple bridge-export dataset import run and record result.
4. Execute private adapter profile B sanity check.
5. Execute Strava account-export import run when export arrives.
