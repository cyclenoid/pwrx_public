# Strava Sidecar Quickstart

This is a practical helper script for advanced users who want API-based Strava ingestion without deep adapter coupling.

Script:
- `scripts/strava-sidecar.mjs`

## What it does

- fetches recent activities from Strava API
- fetches streams per activity
- generates GPX files
- either:
  - writes them into a watch folder (`watch_folder` mode), or
  - uploads them to PWRX import API (`import_api` mode)

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

## 3) Generate mock GPX files into watch folder

```bash
node scripts/strava-sidecar.mjs --mock --mode watch_folder --output-dir ./data/imports/watch/sidecar-smoke
```

## 4) Real Strava pull into watch folder

```bash
node scripts/strava-sidecar.mjs --mode watch_folder
```

Prerequisite:
- PWRX watch-folder import enabled (`WATCH_FOLDER_ENABLED=true`)

## 5) Real Strava pull + direct upload

```bash
node scripts/strava-sidecar.mjs --mode import_api --api-base http://127.0.0.1:3001/api
```

Prerequisite:
- PWRX API reachable

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
