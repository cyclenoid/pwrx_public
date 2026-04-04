# Deployment Runbook (Advanced / Operators)

This document is for advanced operators who deploy PWRX on a server.  
If you are a normal end user, use the Quick Start in `README.md` / `README.de.md`.

## Public baseline (important)

The official public setup is:
- repository: `cyclenoid/pwrx_public`
- file-import first (single file + ZIP bulk import)
- no Strava API setup required

The app can run on:
- Linux server
- Windows (Docker Desktop)
- macOS (Docker Desktop)
- NAS systems (including Unraid)

## Scope of this runbook

Use this guide when you:
- deploy updates on a server
- manage production-like environments
- optionally run a private Strava connector variant

## Deployment source and environment

- Source of truth: `origin/main` from `https://github.com/cyclenoid/pwrx_public.git`
- App path on host: `<APP_PATH>` (example: `/opt/pwrx` or `/mnt/user/appdata/pwrx`)
- API health endpoint: `http://<host>:3001/api/health`

## Standard update flow

1. Push tested changes to `pwrx_public/main`.
2. Update server checkout from `origin/main`.
3. Recreate containers.
4. Verify health and capabilities.

## Server deploy commands

```bash
cd <APP_PATH>
git fetch origin --prune
git checkout main
git pull --ff-only origin main
docker compose up -d --build strava-tracker strava-dashboard
```

## Verification checklist

```bash
cd <APP_PATH>
git rev-parse --short HEAD
curl -s http://127.0.0.1:3001/api/health
curl -s http://127.0.0.1:3001/api/capabilities
```

Expected:
- `health.status = ok`
- backend responds on `/api/capabilities`
- running commit equals `origin/main`

## Optional private Strava connector (advanced only)

This is not part of the normal public end-user setup.
This path is operator-owned and not a turnkey public multi-user feature.

If you intentionally run this advanced operator mode, set:

```env
ADAPTER_STRAVA_ENABLED=true
ADAPTER_STRAVA_PACKAGE=git+ssh://git@github.com/cyclenoid/pwrx-adapter-strava.git
ADAPTER_STRAVA_MODULE=@cyclenoid/pwrx-adapter-strava
STRAVA_CLIENT_ID=...
STRAVA_CLIENT_SECRET=...
STRAVA_REFRESH_TOKEN=...
```

Also ensure SSH/deploy-key access is available to install the private adapter package.
If you use a public npm package or `git+https` source, SSH key mount is not required.

### Operator checks for Strava mode

- after deploy, verify Strava capability still enabled:
  - `capabilities.adapters.strava.enabled = true`
- if disabled:
  - verify env vars
  - recreate backend container
  - check adapter installation logs

Detailed connectivity options and adapter recipes:
- `docs/STRAVA_CONNECTIVITY.md`
- `docs/STRAVA_CONNECTIVITY.de.md`

## Troubleshooting

- UI looks old:
  - verify Git HEAD in `<APP_PATH>`
  - rebuild containers with `--build`
- backend not healthy:
  - check `docker compose logs strava-tracker`
  - verify DB credentials in `.env`
- Strava missing in advanced mode:
  - verify `ADAPTER_STRAVA_ENABLED=true`
  - verify private adapter install access
  - recreate backend container
