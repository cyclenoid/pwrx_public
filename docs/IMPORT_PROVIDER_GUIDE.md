# Provider Import Guide (Practical User Version)

This guide shows the easiest import workflow for common sources.

## The same basic flow for all providers

1. Export activity files from your source
2. Import via:
   - **Import page** in dashboard (manual upload), or
   - **watch folder** (automatic import)
3. Check result in Import details (`done`, `duplicate`, `failed`)

## Supported formats

- `.fit`, `.fit.gz`
- `.gpx`, `.gpx.gz`
- `.tcx`, `.tcx.gz`
- `.zip` with supported files inside
- `.csv` / `.csv.gz` (`activities.csv` from Strava export for name + gear hints)

## Zwift

Best format:
- FIT

Recommended:
1. export/sync FIT files from Zwift
2. upload in Import page or copy to watch folder
3. keep watch folder enabled for recurring imports

## Wahoo

Best format:
- FIT (preferred)

Also possible:
- TCX / GPX (depends on export path)

Recommended:
1. export files from Wahoo workflow
2. import as batch
3. open import details for any failed files

## Garmin

Best format:
- FIT (preferred)

Also possible:
- TCX / GPX

Recommended:
1. download activity files from Garmin ecosystem
2. batch import in UI or watch folder
3. duplicates are skipped automatically

## Apple Health

Current practical path:
- export GPX/FIT/TCX via bridge/export apps (for example HealthFit / RunGap)

Recommended:
1. export files with your bridge app
2. prefer FIT/TCX when available (richer metrics)
3. import via UI or watch folder

Not in current MVP:
- direct Apple Health XML/CSV parsing

## Strava export files

If you import Strava account export files:
- upload activity files as usual
- also import `activities.csv` (or `activities.csv.gz`) once

Why:
- better activity names
- better gear assignment (bike/shoes)

If you want media from full Strava export ZIP:
- use dedicated full-export ZIP upload
- currently image import is supported (videos/other media are ignored)

## Watch folder (optional, for regular imports)

Good for larger recurring imports or multi-device workflows.

How it works:
1. backend watches container path `/imports/watch`
2. host path is mounted to that folder (default: `./data/imports/watch`)
3. you copy files into the host/network path
4. PWRX imports automatically

Optional UI hint variable:
- `WATCH_FOLDER_SMB_PATH` (for example `\\\\nas\\pwrx-import`)

## Troubleshooting

**`duplicate`**  
Expected if activity already exists.

**`failed`**  
- check file type
- open import detail and read `error_message`
- fix source files and retry

**Strava names missing**  
Import `activities.csv` from Strava export once.

**Strava gear missing**  
Make sure `activities.csv` was included.

**Watch folder idle**  
- verify `WATCH_FOLDER_ENABLED=true`
- verify backend sees `WATCH_FOLDER_PATH`
- verify files are fully copied (stable)

