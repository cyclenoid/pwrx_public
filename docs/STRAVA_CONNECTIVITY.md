# Strava API Connectivity (Advanced Options)

This guide is for advanced users/operators who want API-based Strava connectivity.
It is not part of the official public default support path.

Important baseline:
- normal public setup = file import (`FIT/GPX/TCX`, single or ZIP)
- no API credentials required for normal operation
- this document describes optional advanced paths

Compliance note:
- this document is technical guidance, not legal advice
- operator is fully responsible for Strava API Agreement compliance

## Which path should you choose?

- want fast, stable operation: **Path A**
- want automated Strava ingestion with low coupling: **Path B**
- want deep native integration inside PWRX: **Path C**

## Path A: File import only (recommended for most users)

Use exports/files and import into PWRX.

Pros:
- simplest and most stable
- no API app review/rate-limit complexity
- easiest support path

## Path B: API sidecar (recommended advanced alternative)

Run your own Strava sync script/service outside PWRX and feed data into PWRX import.

You can ingest via:
- watch folder (`/imports/watch`, mounted from `./data/imports/watch`)
- import API (`POST /api/import/file`, `POST /api/import/batch`)

Recommended default inside Path B:
- use `import_api` for the simplest setup
- use `watch_folder` only if you deliberately want a watched-folder workflow

Pros:
- does not depend on internal adapter interfaces
- easier to maintain across PWRX updates
- fully under your own API app/tokens

Minimal architecture:
1. Create your own Strava app and OAuth credentials.
2. Run a sidecar job (cron/GitHub Action/server task) that fetches activities.
3. Upload via import API, or write fetched files to watch folder if you intentionally want that workflow.
4. Let PWRX process files as usual.

Starter implementation in this repo:
- `scripts/strava-sidecar.mjs`
- Quickstart: `docs/STRAVA_SIDECAR_QUICKSTART.md`

Scope of this starter:
- reference implementation for private operator setups
- no guarantee of Strava policy compatibility for your specific use case

## Path C: Native adapter module (full integration, highest effort)

PWRX can load a Strava adapter module dynamically.

Environment variables:
- `ADAPTER_STRAVA_ENABLED=true`
- `ADAPTER_STRAVA_PACKAGE=<your package source>`
- `ADAPTER_STRAVA_MODULE=<your module id>` (if not default)
- `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REFRESH_TOKEN`

Package source can be:
- npm package (public/private)
- `git+https://...` repository
- `git+ssh://...` repository (requires deploy key mount)

Expected module exports (at least one sync/oauth entry point):
- `createStravaSyncAdapterClient` (or `createSyncClient`)
- `createStravaUserAdapterClient` (or `createUserClient`)
- optional routes: `createStravaRoutes` (or `createRoutes`)

Capability check after startup:

```bash
curl -s http://127.0.0.1:3001/api/capabilities
```

Look for:
- `adapters.strava.enabled = true`
- required capabilities (`supportsSync`, `supportsOAuth`, etc.)

## New in public compose behavior

When `ADAPTER_STRAVA_ENABLED=true`:
- SSH deploy key is only required for SSH package sources (`git+ssh://`, `ssh://`, `git@...`)
- public npm / `git+https` sources can run without mounted deploy key

## Security and compliance checklist

- never commit `STRAVA_CLIENT_SECRET` or refresh tokens
- store secrets only in local `.env` / secret manager
- rotate tokens when compromised
- follow Strava developer terms/rate limits
- do not expose local API publicly without auth/reverse-proxy hardening

Required operational guardrails:
- do not share one app/token set across unrelated third-party operators
- each operator should use their own Strava app registration and credentials
- new Strava apps may run in single-athlete mode until Strava review/approval
- if you serve multiple athletes, handle consent, deauthorization, and deletion requirements
- if unsure, contact Strava Developer Support before rollout

Official Strava references:
- https://developers.strava.com/docs/getting-started/
- https://developers.strava.com/docs/rate-limits/
- https://www.strava.com/legal/api
- https://developers.strava.com/docs/webhooks/

## Support scope

Public support baseline:
- file-import path
- import pipeline behavior

Advanced Strava API setups:
- best-effort guidance
- operator responsibility for app registration, tokens, and adapter maintenance
- no commitment for turnkey public multi-user Strava setup in this repo
