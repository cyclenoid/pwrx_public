# Strava Sidecar Quickstart

This is a practical helper script for advanced users who want API-based Strava ingestion without deep adapter coupling.
It is a reference for private operator setups, not an official public default feature.

Simple orientation:
- normal public baseline = manual file import
- recommended advanced automation path = Sidecar
- recommended default within Sidecar = `import_api`
- `watch_folder` is the alternative if you deliberately want a watched-folder workflow
- this stays on the public import path and does not require the private native sync adapter

If you want a less technical walkthrough first:
- `docs/STRAVA_SIDECAR_SIMPLE_GUIDE.de.md` (German)
- `docs/STRAVA_SIDECAR_SIMPLE_GUIDE.md` (English)

Script:
- `scripts/strava-sidecar.mjs`

## Compliance first (read before use)

- this guide is technical guidance, not legal advice
- you are responsible for Strava API Agreement compliance
- use your own Strava app + your own credentials
- do not publish/reuse one shared app/token set for unrelated third-party users
- if your app needs more than single-athlete mode, complete Strava review/capacity process

## What it does

- fetches recent activities from Strava API
- fetches streams per activity
- generates GPX files
- either:
  - writes them into a watch folder (`watch_folder` mode), or
  - uploads them to PWRX import API (`import_api` mode)

What it does not do:
- it does not enable native PWRX sync/backfill/club features
- it does not require `ADAPTER_STRAVA_ENABLED=true`
- it does not depend on the private adapter repository

## 1) Configure

Copy template:

```bash
cp scripts/strava-sidecar.env.example .env.sidecar
```

Set at least:
- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `STRAVA_REFRESH_TOKEN`

## 2) Dry-run local test (no Strava required)

```bash
node scripts/strava-sidecar.mjs --mock --dry-run
```

## 3) Generate mock GPX files into watch folder (optional alternative)

```bash
node scripts/strava-sidecar.mjs --mock --mode watch_folder --output-dir ./data/imports/watch/sidecar-smoke
```

## 4) Real Strava pull into watch folder (alternative mode)

```bash
node scripts/strava-sidecar.mjs --mode watch_folder
```

Prerequisite:
- PWRX watch-folder import enabled (`WATCH_FOLDER_ENABLED=true`)

## 5) Real Strava pull + direct upload

Recommended for most Sidecar users:

```bash
node scripts/strava-sidecar.mjs --mode import_api --api-base http://127.0.0.1:3001/api
```

Prerequisite:
- PWRX API reachable

Important:
- if Sidecar runs on the same host as PWRX, `127.0.0.1` is fine
- if Sidecar runs in a separate container, use your NAS/server IP instead of `127.0.0.1`

## 6) QNAP / Container Station example

If you use QNAP or Container Station, a simple pattern is to run Sidecar in a separate temporary Node container with your `pwrx_public` folder mounted in.

Do **not** run Sidecar inside the `strava-tracker` container.

Dry-run example:

```bash
docker run --rm -it \
  --env-file /share/Container/pwrx_public/.env.sidecar \
  -v /share/Container/pwrx_public:/work \
  -w /work \
  node:20-alpine \
  sh -lc "node scripts/strava-sidecar.mjs --mock --dry-run"
```

Real import example:

```bash
docker run --rm -it \
  --env-file /share/Container/pwrx_public/.env.sidecar \
  -v /share/Container/pwrx_public:/work \
  -w /work \
  node:20-alpine \
  sh -lc "node scripts/strava-sidecar.mjs --mode import_api --api-base http://YOUR-QNAP-IP:3001/api"
```

## Scheduling examples

Linux/macOS (cron, every 6 hours):

```cron
0 */6 * * * cd /opt/pwrx && /usr/bin/node scripts/strava-sidecar.mjs --mode watch_folder >> logs/sidecar.log 2>&1
```

Windows Task Scheduler:
- Program: `node`
- Arguments: `scripts/strava-sidecar.mjs --mode watch_folder`
- Start in: your `pwrx_public` folder

## Notes

- some activities have no GPS streams (indoor): these are skipped by design
- keep API credentials in local secrets, never commit them
- if Strava rotates refresh token, update your configured secret
- for multi-athlete/public operation you must additionally implement consent/deauthorization/deletion handling
