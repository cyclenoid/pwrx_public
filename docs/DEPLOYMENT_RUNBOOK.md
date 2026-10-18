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

## Outdoor power and calorie comparison

Outdoor ride/run activity details with GPS movement show a separate power
assessment in a compact, initially collapsed disclosure. Virtual/indoor/trainer activities and assisted e-bike rides are
excluded on the frontend and backend. Missing or mismatched time, distance,
GPS or altitude streams produce an explicit unavailable state.

- Cycling uses force balance: rolling resistance, directional wind/aerodynamics,
  grade, acceleration and drivetrain losses. Surface coefficients, tyre effects,
  road conditions and aerodynamic areas are explicit uncalibrated presets.
- Surface data comes from up to three nearby-start saved-route candidates
  (among the latest 100) or one selected route. Match within 30 m; conflicting
  nearby surface tags and gaps remain unknown. No GPS is sent to external services.
  This matches already stored geometry; it never reroutes the recorded activity.
- Running uses the Minetti 2002 grade-dependent metabolic cost polynomial
  (DOI 10.1152/japplphysiol.01177.2001), heuristic surface factors and an explicitly
  defined 25% power equivalent. This is not a Stryd/Garmin calibration and must not
  be interpreted as a direct correction of device running watts.
- Gaps over 10 seconds and implausible intervals are excluded. Stops within
  evaluated intervals contribute zero. The displayed range is scenario sensitivity,
  not a statistical confidence interval; it does not capture all real uncertainty.
- Current profile weight and gear-name-based equipment defaults are editable
  assumptions, not historical measurements. Wind defaults to zero.
- Calories are a separately versioned derived comparison (`pwrx-energy-1`).
  Cycling converts estimated crank work to metabolic energy with an assumed
  22% efficiency; scenarios combine low/high power with 25%/18% efficiency.
  These are sensitivity presets, not individually measured efficiencies.
  Reference: https://pubmed.ncbi.nlm.nih.gov/15241718/ (gross and delta efficiency
  are distinct; the preset is not an individual calibration).
  Running integrates the existing metabolic cost estimate directly, never the
  arbitrary running-watt equivalent, with -15%/+20% sensitivity presets.
  Joules / 4184 gives kcal. Calculations use the displayed rounded watts and
  evaluated seconds. No resting energy, pauses or recording gaps are separately
  added; this is neither daily expenditure nor a guaranteed total-activity value.
  Provider active/total calorie definitions may differ. Missing originals stay
  unknown, and mechanical kilojoules are not mistaken for metabolic calories.
  Existing accepted assessments gain the derived calorie comparison on read
  without a database rewrite, revision change or change to accepted watts.
  New acceptances store both comparisons together in the existing JSON payload.
- Accepting a suggestion stores only the additional assessment in
  activity_power_assessments (migration 0013). Original activity/stream power,
  power records, FTP, NP and training-load analytics are unchanged. Include the
  assessment table in backups. Removal is revision-guarded and reversible by
  recalculating/accepting again.
- Server recomputation and source fingerprints prevent accepting a stale preview.
  Later activity edits, stream backfills and route revisions mark accepted results
  stale. Acceptance/removal conflicts require reopening the activity.
- API: GET /api/power-assessments/:id (context), POST /:id/preview,
  PUT /:id (accept) and DELETE /:id?revision=n (remove). The existing private
  single-instance access model applies. Run npm run test:power in both apps.

## Route planner preview

### Automatic round trips

- Open "Suggest a round trip" in the planner sidebar. Select a start by map click,
  coordinates (latitude, longitude) or device geolocation; the current draft's
  first point can also be reused. No external address search is included.
  Device location needs browser permission and a secure context (LAN HTTP may
  not support it). Map/coordinate entry works without geolocation permission.
- Choose 10-200 km, road/gravel/touring/MTB and flat/hilly/mountainous preference.
  POST /api/route-planner/round-trips uses the configured BRouter only, with
  native engineMode=4, five helper points and an initial radius of distance / 6.
  It tries four bearings and at most two length refinements, sequentially, with
  a 65-second search budget and 15-second individual request timeouts.
  Round-trip batches share the existing two-slot API routing concurrency limit;
  disconnecting the client cancels further requests. Results are not persisted.
- Up to three distinct routes are ranked by length deviation, ascent per km and
  repeated edges. This is candidate selection, not exact elevation-constrained
  optimization. Elevation and time are approximations; time uses fixed profile
  speeds plus an ascent allowance, not individual fitness or current conditions.
  Similar spatial coverage is deduplicated, including reverse-direction routes.
  Invalid/nonclosed geometry is rejected, never closed with artificial lines.
  Missing elevations and OSM surface data stay unknown. Missing regional tiles
  are reported by filename only; existing routing-region installation is reused.
- Cards include map/elevation previews and surface shares. Previewing is separate
  from the current editor draft; saving/exporting requires adopting the preview.
  Explicit adoption asks before replacing unsaved edits, creates a new unsaved
  routed draft, and never updates the previously opened saved route implicitly.
  Generated geometry and incoming-edge surface tags are preserved in the editor,
  server save and GPX geometry export. Undo and cancellation retain the old draft.
- MTB uses the upstream mtb profile, disables steps and enables
  StrictNOBicycleaccess. This is not a technical difficulty limit, current access
  guarantee or verified trail safety assessment. Check routes before riding.
- Reference for the pinned native mode:
  https://github.com/abrensch/brouter/blob/29898106b555e342ff3ade7ae3e9c1ae6644a43b/brouter-core/src/main/java/btools/router/RoutingEngine.java

### Manual planning and import

The /routes page supports GPX track/route and FIT GPS-track import, draggable via points,
section editing, undo/redo, server-saved routes and GPX track export.
The planner does not import files into the activity database.

FIT files are uploaded to `POST /api/route-planner/import-fit` as binary data
and decoded in memory on the PWRX server, never sent to a third-party service
or persisted as uploads/activities. Activity and course FIT files with record
coordinates are supported, including courses without timestamps. Coordinates
and available per-record heights are retained; missing GPS records split the
track rather than inventing a connection. Indoor/sensor-only files are rejected.
Export remains GPX; FIT sensor streams, timing, laps and course instructions
are not part of the route. FIT decoding uses bounded worker threads (two
concurrent imports, 10-second parsing limit) and validates file length and CRC.

Imported coordinates, elevations and track gaps are preserved. Moving a via
point recalculates only adjacent connected sections. Clicking a track adds a
control point without changing its geometry. Removing the first/last point
trims a section. Removing an interior point recalculates its joined section;
gaps remain gaps. Snapped endpoints that do not meet are exported as separate
track segments instead of adding invisible straight connections. Full recalculation is explicit and requires confirmation.
Profiles apply to new/edited sections: road (fastbike), gravel (gravel), and
cycle routes/touring (trekking with stick_to_cycleroutes=1).

Without a configured router, GPX/FIT import, end trimming, export and explicit
freehand connections work. Failed routing never falls back to a straight line.
The status endpoint reports configuration. The "Routing regions" button shows
the local file inventory through GET /api/route-planner/coverage, including tile
bounds and sizes, and a map that distinguishes loaded and missing regions.
Background CARTO/OSM tiles remain available independently of routing coverage.
Inventory describes installed files, not a routeability or service-health guarantee.
Missing BRouter region errors name the required .rd5 file without exposing paths.

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
   The routing overlay mounts segments4 read-only into the backend and sets
   BROUTER_SEGMENTS_DIR. For an externally managed BRouter, the local inventory
   is unknown unless the matching directory is also available to the backend.
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

- Use the top "Save route" action for server storage. The separate browser-local
  draft save/load controls were removed; existing localStorage data is not deleted.
  Export GPX for a portable backup. GPX exports geometry and elevation, not original
  timestamps, sensor streams, extensions or the editor history.
- Up to 10 MB, 150,000 input points, 30 segments and 80 control points.
- Elevation gain is an approximation from point elevations. Missing elevations
  are shown as unknown. Route alternatives are not yet included.
- Route library: `/routes/saved` lists searchable, paginated routes stored in
  PostgreSQL (`saved_routes`, migration 0012). Include this table in database
  backups. It follows the existing single-instance/private access model, not
  separate per-user access controls. Do not expose the unauthenticated app publicly.
  Save updates the opened route; Save as new route makes an independent copy.
  Revision checks prevent silently overwriting or deleting newer changes.
  Cards load map previews near the viewport via GET /api/route-library/:id/preview.
  Previews contain at most 1,000 sampled points with original bounds and separate
  legs (no bridges across gaps). Stored geometry and GPX exports stay unchanged.
- Activities with GPS have an "As route" link. This copies the GPS geometry into
  a new unsaved planner draft, leaving the source activity unchanged. Elevations
  are used only if the stream length matches GPS positions.
- Map colors can show surface or way type independently. BRouter message tags
  belong to the incoming section ending at the message coordinates. Unmatched
  geometry, imports, freehand lines and missing tags remain unknown; no surface
  is inferred just because the selected routing profile is gravel.
  Imported geometry only receives tags after explicit recalculation, which can
  change its path. A cycleway may be asphalt or unpaved; highway=track means a
  field/forest track, not proof that it is in a forest. OSM tags and gravel costs
  are not guarantees of current condition, permission or rideability.
  Profile reference: https://github.com/abrensch/brouter/blob/29898106b555e342ff3ade7ae3e9c1ae6644a43b/misc/profiles2/gravel.brf
- Run npm run test:routes in apps/strava and dashboards/strava, then both builds.
- Browser checks: import a multi-segment GPX, move a point, undo, export, compare
  untouched coordinates and gaps; test failed routing, saved-route reload, preview
  gaps, lazy loading, preview failure/retry and mobile layout.
- FIT checks: import GPS activity/course files, export GPX, verify coordinates
  and heights; reject no-GPS, truncated, oversized and corrupt files without
  replacing the current draft. Cancelling an upload must preserve the draft.
