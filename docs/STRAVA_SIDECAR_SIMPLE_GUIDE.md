# Strava sidecar quick guide

## In short

- Sidecar runs **outside PWRX**.
- It fetches Strava activities and turns them into import files for PWRX.
- Inside PWRX itself, you do **not** need to enable anything for this.
- Sidecar stays on the normal import path and does **not** require the private native Strava adapter.
- For advanced users who want automated Strava ingestion, Sidecar is the recommended path.
- Within the Sidecar options, `import_api` is usually the simplest default. `watch_folder` is the alternative if you deliberately want a watched-folder workflow.

## What you need

- Your own Strava app with:
  - `STRAVA_CLIENT_ID`
  - `STRAVA_CLIENT_SECRET`
  - `STRAVA_REFRESH_TOKEN`
- A computer, server, or NAS where the script can run
- A running PWRX instance

For most users:
- keep normal PWRX import as the simple baseline
- use Sidecar only if you want automated Strava downloads
- use `import_api` unless you specifically want to go through a watched folder

## Quick start in 5 steps

### 1. Check the PWRX API

Local:

```text
http://127.0.0.1:3001/api/health
```

Server/NAS example:

```text
http://YOUR-SERVER-IP:3001/api/health
```

### 2. Create `.env.sidecar`

```bash
cp scripts/strava-sidecar.env.example .env.sidecar
```

Windows CMD:

```bat
copy scripts\strava-sidecar.env.example .env.sidecar
```

PowerShell:

```powershell
Copy-Item .\scripts\strava-sidecar.env.example .\.env.sidecar
```

### 3. Enter credentials

Set these values in `.env.sidecar`:

- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `STRAVA_REFRESH_TOKEN`

### 4. Run a safe test

```bash
node scripts/strava-sidecar.mjs --mock --dry-run
```

### 5. Start a real import

For most users, `import_api` is the recommended Sidecar mode because it is the simplest setup.

```bash
node scripts/strava-sidecar.mjs --mode import_api --api-base http://127.0.0.1:3001/api
```

PowerShell:

```powershell
node .\scripts\strava-sidecar.mjs --mode import_api --api-base http://127.0.0.1:3001/api
```

Use `watch_folder` only if you deliberately want the Sidecar to write files into a watched folder first.

Important:
- if Sidecar runs on the same host as PWRX, `127.0.0.1` is fine
- if Sidecar runs in a separate container, do **not** use `127.0.0.1`; use your NAS/server IP instead

## QNAP / Container Station example

If you use QNAP or Container Station, the simplest approach is usually:
- keep your normal `pwrx_public` folder on the NAS
- create `.env.sidecar` in that folder
- run Sidecar in a separate temporary Node container

Do **not** run Sidecar inside the `strava-tracker` container.

Safe test:

```bash
docker run --rm -it \
  --env-file /share/Container/pwrx_public/.env.sidecar \
  -v /share/Container/pwrx_public:/work \
  -w /work \
  node:20-alpine \
  sh -lc "node scripts/strava-sidecar.mjs --mock --dry-run"
```

Real import:

```bash
docker run --rm -it \
  --env-file /share/Container/pwrx_public/.env.sidecar \
  -v /share/Container/pwrx_public:/work \
  -w /work \
  node:20-alpine \
  sh -lc "node scripts/strava-sidecar.mjs --mode import_api --api-base http://YOUR-QNAP-IP:3001/api"
```

Replace:
- `/share/Container/pwrx_public` with your real PWRX folder on the NAS
- `YOUR-QNAP-IP` with the IP or hostname of your PWRX host

## Control amount and time range

- `--lookback-days`: how many days back to check
- `--max-activities`: maximum activities per run
- `--delay-ms`: pause between API requests

Example:

```bash
node scripts/strava-sidecar.mjs --mode import_api --lookback-days 14 --max-activities 100 --delay-ms 150
```

## How to tell it works

- A new import run or new files appear on the import page.
- The activities then show up in the dashboard and activity list.
- If nothing arrives, check the sidecar job, `.env.sidecar`, and the API URL first.

## Note

The simple public baseline is still normal file import. Sidecar is the recommended advanced path when you want automation, but running it and configuring the Strava API remains the responsibility of the operator of that installation.
