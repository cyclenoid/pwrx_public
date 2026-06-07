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

## Maintainer Unraid deployment

The maintainer-operated Unraid instance is our own personal PWRX app.
It is not the public default setup. It intentionally runs the advanced
private Strava API sync path in addition to the normal file import flow.

Keep this distinction clear when deploying:
- public baseline: file import first, no Strava API setup required
- personal Unraid deployment: private operator setup with Strava API sync enabled
- concrete Unraid hostnames, LAN IPs, app paths, deploy-key names, adapter URLs,
  tokens, and `.env` values stay outside this public repository
- use placeholders in this runbook and keep machine-specific notes in private
  operator documentation

For the personal Unraid stack, verify after every deploy that the private
Strava adapter is still active and that API sync jobs can run. See
`Operator checks for Strava mode` below.

## Scope of this runbook

Use this guide when you:
- deploy updates on a server
- manage production-like environments
- optionally run a private Strava connector variant

## Public repository hygiene

This repository is public. Do not commit internal workspace paths, private hostnames,
private IP addresses, deploy keys, tokens, credentials, customer data, or operator-only
runbooks. Keep local deployment notes outside this repository.

Before every public push, run a hygiene check for accidental local references:

```bash
git grep -n "<private-host-or-path-pattern>" -- . ':!package-lock.json'
git status --short
```

If internal data ever reaches public history, stop normal deployment work first.
Rotate affected credentials, rewrite the public history deliberately, force-push
only the cleaned branch/tags, and verify a fresh clone before deploying.

## Deployment source and environment

- Source of truth: `origin/main` from `https://github.com/cyclenoid/pwrx_public.git`
- App path on host: `<APP_PATH>` (example: `/opt/pwrx` or `/srv/pwrx`)
- API health endpoint: `http://<host>:3001/api/health`

## Standard update flow

1. Push tested changes to `pwrx_public/main`.
2. Update server checkout from `origin/main`.
3. Recreate containers.
4. Verify health and capabilities.

For user-visible releases:
- bump the SemVer version in `apps/strava/package.json`
- keep `dashboards/strava/package.json` aligned
- update the matching `package-lock.json` files
- update `dashboards/strava/src/lib/featureLog.ts`
- verify `/api/capabilities` shows the new `version.label` after deployment
- update cyclenoid.com metadata from the same deployed commit

## Server deploy commands

```bash
cd <APP_PATH>
git fetch origin --prune
git checkout main
git pull --ff-only origin main
docker compose up -d --build strava-tracker strava-dashboard
docker compose exec -T -w /tmp/pwrx-app strava-tracker npm run db:migrate
docker compose exec -T -w /tmp/pwrx-app strava-tracker npm run db:check
```

For the personal Unraid deployment, run the same commands in the private Unraid
checkout. The local Windows/Docker Desktop stack is only a verification target
unless the user explicitly asks for a local-only deploy.

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
- `version.label` shows the expected readable release version, for example `v1.1.0`
- `version.commit` shows the expected Git commit for exact traceability
- for user-visible UI/API changes, update `dashboards/strava/src/lib/featureLog.ts` in the same release

## Optional Strava connector (advanced only)

This is not part of the normal public end-user setup.
This path is operator-owned and not a turnkey public multi-user feature.

If you intentionally run this advanced operator mode, set placeholders like:

```env
ADAPTER_STRAVA_ENABLED=true
ADAPTER_STRAVA_PACKAGE=<adapter-package-or-git-url>
ADAPTER_STRAVA_MODULE=<adapter-module-name>
STRAVA_CLIENT_ID=...
STRAVA_CLIENT_SECRET=...
STRAVA_REFRESH_TOKEN=...
```

Also ensure package access is available for the adapter source you choose.
Do not commit real adapter URLs, deploy-key names, tokens, or credentials.

### Operator checks for Strava mode

- after deploy, verify Strava capability still enabled:
  - `adapters[]` entry with `id = "strava"` has `enabled = true`
  - merged `capabilities.supportsSync = true`
  - merged `capabilities.supportsClubs = false` unless a future release
    deliberately reintroduces a maintained club feature
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
