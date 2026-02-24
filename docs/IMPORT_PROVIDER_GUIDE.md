# Provider Import Guide (Zwift, Wahoo, Garmin, Apple Health)

This document describes practical file-import workflows per provider.

## Common target workflow
1. Export activity files from provider/tool.
2. Use one of two paths:
   - Manual upload in dashboard `Import` page.
   - Copy files into watch folder (self-hosted: typically via SMB/network share) for automatic import.
3. Validate run in import logs (`/api/imports` or UI Import detail).

Supported formats:
- `.fit`
- `.fit.gz`
- `.gpx`
- `.gpx.gz`
- `.tcx`
- `.tcx.gz`
- `.csv` / `.csv.gz` (`activities.csv` from Strava export for activity-name + gear hints)
- `.zip` (archive that contains supported files)

## Self-hosted watch folder (SMB / network share)
Recommended for large exports and recurring imports.

How it works:
1. Docker mounts a host folder into the backend container (example in this repo: host `./data/imports/watch` -> container `/imports/watch`).
2. Optionally expose that host folder as SMB/network share (for example Unraid share).
3. Users copy files into the SMB/share path using Finder/Explorer.
4. PWRX imports from the container watch path automatically.

Notes:
- The browser does not directly browse the Docker folder.
- The dashboard only shows the configured watch path and (optionally) an SMB/share hint.
- Optional env var for UI hint: `WATCH_FOLDER_SMB_PATH` (example: `\\\\unraid\\pwrx-import`).

## Zwift
Typical format:
- FIT (preferred)

Recommended:
1. Export/sync FIT files from Zwift.
2. Copy to watch folder inbox (`.../data/imports/watch`) or upload in UI.
3. Keep watch folder enabled for automatic recurring imports.

Notes:
- FIT usually contains rich metrics (HR/power/cadence/GPS when available).

## Wahoo
Typical format:
- FIT (preferred)
- Sometimes TCX/GPX exports depending on tool path

Recommended:
1. Export FIT from ELEMNT app/cloud workflow.
2. Batch import via UI or watch folder.
3. Use import detail view for failed files and retry after fixing file set.

## Garmin
Typical format:
- FIT (preferred)
- Optional TCX/GPX export depending on portal/tool

Recommended:
1. Download activity files from Garmin ecosystem.
2. Import as batch; duplicates are auto-skipped.
3. If needed, import ZIP export directly (archive is expanded automatically).

## Apple Health
Current MVP focus:
- Import GPX/FIT/TCX that come from bridge/export apps.

Practical path:
1. Use bridge app (for example HealthFit/RunGap) to export activity files.
2. Prefer FIT/TCX when available for richer metrics.
3. Import exported files via UI or watch folder.

Not in current MVP:
- Direct Apple Health XML/CSV parsing.

## Troubleshooting by provider
- Duplicate result:
  - Expected when same activity already imported (sha256 or fingerprint dedupe).
- Failed result:
  - Check file extension and parser compatibility.
  - Open import detail for `error_message`.
  - Use `Retry failed` after replacing/fixing source file.
- Strava export names not shown:
  - Import `activities.csv` (or `activities.csv.gz`) from the Strava export once.
  - Re-import or retry activity files if they were imported before name hints were available.
- Strava export gear not assigned:
  - Ensure `activities.csv` is included (same export as the activity files).
  - PWRX uses `activities.csv` to create/assign bikes/shoes for file-imported activities.
- Strava export images not attached:
  - Use the dedicated "full Strava export ZIP" upload and enable the media checkbox.
  - Only images are imported currently (videos/other media are ignored).
- Watch folder not importing:
  - Confirm `WATCH_FOLDER_ENABLED=true`.
  - Confirm backend sees correct `WATCH_FOLDER_PATH`.
  - Confirm file is stable long enough (`WATCH_FOLDER_STABLE_CHECKS`).

## Release test execution
- Use the full Docker runbook: `docs/DOCKER_RELEASE_TEST_PLAN.md`
- Current priority before public release:
  - Zwift file-import validation
  - Apple bridge-export validation
  - Strava export validation as soon as account export is available

Current status (2026-02-21):
- Zwift: validated in Docker (batch import run #6 completed without fails; metadata-only FIT files are skipped)
- Apple bridge exports: pending execution
- Strava export: requested, waiting for provider delivery
