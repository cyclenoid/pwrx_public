# Deployment Runbook (Public Repo as Source for Unraid)

This runbook defines the standard deployment process for PWRX.

## Scope

- Source for production (Unraid): `cyclenoid/pwrx_public` (`main`)
- Optional development source: private repo (`cyclenoid/pwrx`)
- Optional local test runtime: Docker Desktop

## Rule of truth

- Unraid must always run code from `pwrx_public/main`.
- Private repo is for development only.
- Before production deploy, changes from private repo must be mirrored to public repo.

## Environments

- Public repo local working copy: `C:\DEV\pwrx-public-beta`
- Unraid app path: `/mnt/user/appdata/data-hub`
- API health endpoint: `http://<unraid-ip>:3001/api/health`

## One-time Unraid setup

Run once on Unraid to ensure the production remote is the public repo:

```bash
cd /mnt/user/appdata/data-hub
git remote -v
```

Expected remote:

- `origin https://github.com/cyclenoid/pwrx_public.git`

If not, fix it:

```bash
git remote set-url origin https://github.com/cyclenoid/pwrx_public.git
```

## Standard update flow

1. Develop and test changes (private repo and/or local Docker).
2. Mirror snapshot to `pwrx_public` and push to `main`.
3. On Unraid, update to latest `origin/main`.
4. Rebuild/start containers.
5. Verify health and capabilities.

## Public snapshot + push

From your workstation:

```powershell
cd C:\DEV\pwrx-public-beta
git add -A
git commit -m "chore: deploy latest pwrx snapshot"
git push origin main
```

## Unraid deploy (always from public)

```bash
cd /mnt/user/appdata/data-hub
git fetch origin --prune
git reset --hard origin/main
docker compose up -d --build strava-tracker strava-dashboard
```

Important:

- `git reset --hard origin/main` discards tracked local code/config changes in this folder.
- Keep local secrets/runtime config in `.env` and mounted data directories, not in tracked files.

## Unraid-only difference: Strava connector enabled

Public baseline can stay public-core style, but on Unraid keep:

```env
ADAPTER_STRAVA_ENABLED=true
STRAVA_CLIENT_ID=...
STRAVA_CLIENT_SECRET=...
STRAVA_REFRESH_TOKEN=...
```

This is the only intended runtime difference on Unraid.

## Verification checklist after deploy

```bash
git -C /mnt/user/appdata/data-hub rev-parse --short HEAD
curl -s http://127.0.0.1:3001/api/health
curl -s http://127.0.0.1:3001/api/capabilities
```

Expected:

- `health.status = ok`
- `capabilities.adapters.strava.enabled = true` (on Unraid)
- Git head on Unraid equals `pwrx_public/main`
- `version.commit` in capabilities is populated (compose mounts `.git` into backend)

## Local Docker Desktop test modes

- Public-core mode:
  - `ADAPTER_STRAVA_ENABLED=false`
  - no Strava connector required
- Private/Strava mode:
  - `ADAPTER_STRAVA_ENABLED=true`
  - requires Strava credentials and adapter access setup

## Troubleshooting

- If UI version seems old:
  - check Unraid repo head (`git rev-parse --short HEAD`)
  - rebuild services (`docker compose up -d --build ...`)
- If Strava API missing on Unraid:
  - verify `ADAPTER_STRAVA_ENABLED=true` in Unraid `.env`
  - recreate `strava-tracker`
