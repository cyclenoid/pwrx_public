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

## Optional CARTO basemaps

Set `CARTO_BASEMAP_API_KEY` in the deployment's local `.env` to use
CARTO Dark Matter in dark mode and Positron in light mode. Leave it empty to
use OpenStreetMap. The key is passed to the frontend at build time:

```bash
docker compose up -d --no-deps --build strava-dashboard
```

Keep the real key out of Git. It is a browser API key and is visible in the
compiled frontend and tile requests, so use CARTO's key restrictions when
appropriate. Do not use a private server credential here. Existing operator
Compose overrides must still be included when rebuilding the personal stack.
After updates, verify that CARTO tiles load without watermarks and that the
local key configuration is retained. CARTO and OpenStreetMap attribution
remain visible on every map.

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

## Route planner preview

The /routes page supports GPX track/route import, draggable via points,
section editing, undo/redo, browser-local drafts and GPX track export.
The planner does not import files into the activity database.

Imported coordinates, elevations and track gaps are preserved. Moving a via
point recalculates only adjacent connected sections. Clicking a track adds a
control point without changing its geometry. Removing the first/last point
trims a section. Removing an interior point recalculates its joined section;
gaps remain gaps. Snapped endpoints that do not meet are exported as separate
track segments instead of adding invisible straight connections. Full recalculation is explicit and requires confirmation.
Profiles apply to new/edited sections: road (fastbike), gravel (gravel), and
cycle routes/touring (trekking with stick_to_cycleroutes=1).

Without a configured router, GPX import, end trimming, export and explicit
freehand connections work. Failed routing never falls back to a straight line.
The status endpoint reports configuration, not data coverage or service health.

### Optional self-hosted BRouter

1. Choose the required regional .rd5 tiles from
   https://brouter.de/brouter/segments4/. Each tile covers 5 by 5 degrees;
   its name is the southwest corner. Download them into
   DATA_HUB_DATA_DIR/routing/segments4 (readable by container UID 1000).
   Example: E5_N50.rd5 covers longitude 5..10 and latitude 50..55.
   Include adjacent tiles used by planned routes. Downloads can be large.
2. Include docker-compose.routing.yml in addition to the normal Compose and
   existing operator override files. The overlay builds BRouter from a pinned
   upstream commit and sets BROUTER_URL for the API. No host port is exposed.
3. Start brouter and recreate strava-tracker; rebuild strava-dashboard.
   Preserve the private adapter configuration, CARTO key and host port bindings.
4. Check /api/route-planner/status, then calculate a short route in an installed
   region with each profile. Test a missing region too: the existing route must
   remain intact. Verify API health and private Strava capability after deploy.

For a standard installation without operator overrides:

```sh
docker compose -f docker-compose.yml -f docker-compose.routing.yml up -d --build brouter strava-tracker strava-dashboard
```

Alternatively point BROUTER_URL at an operator-managed BRouter /brouter endpoint.
Keep routing data current by replacing regional files while BRouter is stopped;
download to temporary files first, then rename complete downloads into place.
The upstream profiles and lookups come from the same pinned BRouter build.

### Preview limits and checks

- One manually saved draft per browser/origin, not synchronized to the server.
  Export GPX for durable backup. GPX exports geometry and elevation, not original
  timestamps, sensor streams, extensions or the editor history.
- Up to 10 MB, 150,000 input points, 30 segments and 80 control points.
- Elevation gain is an approximation from point elevations. Missing elevations
  are shown as unknown. Surface breakdown and route alternatives are not yet included.
- Activity-to-route conversion and a server-side route library are future work.
- Run npm run test:routes in apps/strava and dashboards/strava, then both builds.
- Browser checks: import a multi-segment GPX, move a point, undo, export, compare
  untouched coordinates and gaps; test failed routing, draft reload and mobile layout.
