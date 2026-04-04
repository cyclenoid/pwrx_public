# Strava Sidecar explained simply (for users)

This page explains the sidecar path without deep technical detail.

## In short

The sidecar is a small helper script.

On each run it:
1. pulls activities from Strava
2. builds GPX files from them
3. imports those files into PWRX

PWRX itself still stays file-import based.

## When this is useful

- you want to keep the normal PWRX import workflow
- you want activities to be fetched from Strava automatically
- you accept that this is an advanced operator path

If you just want to get started, stay on normal file import (FIT/GPX/TCX, ZIP).

## What gets imported?

Current sidecar scope:
- activity list (within a time window)
- per-activity streams (time, GPS, elevation, heart rate, cadence, temperature, watts)
- GPX output for PWRX import

Not covered by this script today:
- photo download
- native Strava segment-effort synchronization

Note: PWRX can still build local segments from imported GPS data.

## Setup in 5 steps

1. Start PWRX and check API:

```text
http://127.0.0.1:3001/api/health
```

If PWRX runs on a server, use the server address instead of `127.0.0.1`, for example:

```text
http://10.10.10.129:3001/api/health
```

2. Create sidecar env file:

```bash
cp scripts/strava-sidecar.env.example .env.sidecar
```

Windows (CMD):

```bat
copy scripts\strava-sidecar.env.example .env.sidecar
```

Windows (PowerShell):

```powershell
Copy-Item .\scripts\strava-sidecar.env.example .\.env.sidecar
```

3. Set values in `.env.sidecar`:
- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `STRAVA_REFRESH_TOKEN`

4. Run a safe test first:

```bash
node scripts/strava-sidecar.mjs --mock --dry-run
```

5. Run real import into local API:

```bash
node scripts/strava-sidecar.mjs --mode import_api --api-base http://127.0.0.1:3001/api
```

Windows (PowerShell):

```powershell
node .\scripts\strava-sidecar.mjs --mode import_api --api-base http://127.0.0.1:3001/api
```

## Control amount and time range

Key options:
- `--lookback-days` (for example 7, 14, 30)
- `--max-activities` (maximum activities per run)
- `--delay-ms` (pause between API requests)

Example:

```bash
node scripts/strava-sidecar.mjs --mode import_api --lookback-days 14 --max-activities 100 --delay-ms 150
```

## Two operation modes

- `watch_folder`: writes GPX files to a folder PWRX can watch
- `import_api`: writes GPX and posts them directly to the PWRX import API

For most users, `import_api` is easier.

## Local vs server: does it matter?

Yes, but mostly operationally:

- The sidecar logic is the same.
- What changes is where the script runs and which API base URL you use.
- Local setup: usually `http://127.0.0.1:3001/api`.
- Server/NAS/Unraid setup: server IP or DNS, for example `http://10.10.10.129:3001/api`.
- In `watch_folder` mode, the target folder must be reachable by PWRX (same host or mounted path).

## Important API policy note

- The sidecar script is published as a technical reference.
- It is not an official public default support path.
- Operation and compliance remain with the operator (own app, credentials, limits/review).

See also:
- `docs/STRAVA_CONNECTIVITY.md`
- `docs/STRAVA_SIDECAR_QUICKSTART.md`
