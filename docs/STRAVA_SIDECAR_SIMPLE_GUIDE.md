# Strava sidecar quick guide

## In short

- Sidecar runs **outside PWRX**.
- It fetches Strava activities and turns them into import files for PWRX.
- Inside PWRX itself, you do **not** need to enable anything for this.

## What you need

- Your own Strava app with:
  - `STRAVA_CLIENT_ID`
  - `STRAVA_CLIENT_SECRET`
  - `STRAVA_REFRESH_TOKEN`
- A computer, server, or NAS where the script can run
- A running PWRX instance with API or watch folder

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

For most users, `import_api` is the easiest path.

```bash
node scripts/strava-sidecar.mjs --mode import_api --api-base http://127.0.0.1:3001/api
```

PowerShell:

```powershell
node .\scripts\strava-sidecar.mjs --mode import_api --api-base http://127.0.0.1:3001/api
```

You only need `watch_folder` if you deliberately want to work through a watched folder.

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

Sidecar is an optional advanced path. Running it and configuring the Strava API remains the responsibility of the operator of that installation.
