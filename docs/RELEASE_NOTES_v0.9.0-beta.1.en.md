# Release Notes - v0.9.0-beta.1 (Public Beta)

## Status

Public Beta / Early Access release focused on file import workflows.

## Highlights

- File-import-first setup (FIT/GPX/TCX/ZIP) without direct API integration required
- Large Strava export ZIP upload support with chunked/resumable upload
- Import queue visibility and failed job handling in UI
- Strava export enhancements (activity names, gear mapping, optional media import from export ZIP)
- Local segment detection and naming improvements
- First-run onboarding hint and improved setup UX

## Import Improvements

- Manual upload for single and batch activity files
- Full export ZIP handling with selective extraction of relevant files
- Queue progress summary for large imports (processed / open / queued / failed / duplicates)
- Failed queue jobs can be requeued or deleted from the Import page
- Better error messages for ZIP limits and gateway timeouts

## Self-hosted / Docker Notes

- Standard Docker setup shows a watch-folder copy target (`./data/imports/watch`) in the UI
- Watch folder is optional and intended for self-hosted/admin use
- SMB/network share path can be displayed via `WATCH_FOLDER_SMB_PATH`

## Known Limitations (Beta)

- Large uploads can still be affected by server/proxy limits and timeouts
- Storage usage grows with imports/photos (no quota/retention management yet)
- Some advanced settings/maintenance tools are still technical and will be refined

## Upgrade / Fresh Install

- Run database migrations after updating:

```bash
docker compose exec strava-tracker npm run db:migrate
```

- Fresh install: copy `.env.example` to `.env`, set DB/pgAdmin credentials, then start Docker and import files via UI

## Feedback Focus

- Large ZIP upload reliability (different proxies / networks)
- Import UX clarity for first-time users
- Segment detection quality (especially non-steep long climbs)
- Queue maintenance / diagnostics usability
