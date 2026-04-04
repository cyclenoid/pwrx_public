# PWRX - Power Explorer for Training Data

PWRX is a self-hosted training analytics app for cycling and running.  
You import your activities from files (FIT/GPX/TCX or ZIP export), and PWRX builds a local dashboard with history, records, training load, and insights.

It runs on a normal computer or home server.

German version: `README.de.md`

## Who is PWRX for?

PWRX is for athletes who want to:
- keep control of their training data
- run analytics locally
- evaluate long training history from export files

You do not need to be a developer. If Docker runs, you can use PWRX.

## What you need

- Docker + Docker Compose
- Some free disk space for database and imports
- Training files (for example FIT/GPX/TCX or a ZIP export)

Notes:
- the standard path works directly with file import
- no API setup required to get started

## Typical scenarios

1. You want to run it locally on your laptop:
   - start PWRX
   - import files
   - use the dashboard
2. You want to migrate full history:
   - upload one ZIP export as bulk import
   - then keep adding new FIT/GPX/TCX files
3. You want to run it on a home server (for example Linux, Windows, NAS, or Unraid):
   - same file-import workflow
   - browser access in your local network

## Quick start (local, a few minutes)

1. Clone repository
```bash
git clone https://github.com/cyclenoid/pwrx_public.git
cd pwrx_public
```

2. Create config
```bash
cp .env.example .env
```
Windows (CMD):
```bat
copy .env.example .env
```

3. Set required values in `.env`:
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`

Optional:
- `DATA_HUB_DATA_DIR` (default: `./data`)
- `WATCH_FOLDER_SMB_PATH` (UI hint only for SMB/network-path setups)

4. Start containers
```bash
docker compose up -d
```

5. Open in browser
```text
Dashboard: http://localhost:8088
API health: http://localhost:3001/api/health
pgAdmin: http://localhost:5050
```

## Standard workflow: import activities

This is the recommended default for all users.

### A) Single import
- Upload individual FIT/GPX/TCX files in the Import page.

### B) Bulk import (ZIP)
- Upload a full ZIP export (best for your first historical migration).

### C) Optional: watch folder
- Drop files into a watched folder for automatic import.

Import docs:
- Quickstart: `docs/IMPORT_QUICKSTART.md`
- Provider guide: `docs/IMPORT_PROVIDER_GUIDE.md`

## What is stored locally

Data is stored in your configured data path:
- default: `./data`
- includes: database content, exports, logs, images/media

PWRX is designed for local operation.

## Updates

```bash
git pull
docker compose up -d
```

If a release includes DB schema changes, run migration:
```bash
docker compose exec strava-tracker npm run db:migrate
```

Check status:
```bash
docker compose exec strava-tracker npm run db:check
```

## FAQ (short)

**Can I use PWRX without a 24/7 machine?**  
Yes. Start the stack when needed. Optional catch-up after startup can be enabled.

**Do I need API credentials to get started?**  
No. The standard mode is file based.

**Is first import slow?**  
Large histories can take time. Import continues in the background.

## History: Strava API sync and why public docs focus on files

Earlier versions included a direct Strava API sync path.  
In a public repo this can confuse normal users, because Strava API review/capacity/rate-limit rules are not guaranteed as a standard installation path.

So the official public baseline is now clear:
- file import as default path (single + ZIP bulk import)
- no Strava API setup required for normal end-user setup

Important:
- architecture stays open for connectors
- connector-based paths are advanced operator/maintainer topics, not normal public end-user support

Official Strava references:
- https://developers.strava.com/docs/rate-limits/
- https://developers.strava.com/docs/getting-started/
- API connectivity options and operator recipes: `docs/STRAVA_CONNECTIVITY.md`

## Optional: notes for advanced operators

If you deliberately run a private connector setup as maintainer/operator, read:
- `docs/DEPLOYMENT_RUNBOOK.md`
- `docs/STRAVA_CONNECTIVITY.md`

Important:
- Strava API connectivity is not part of the public default support path.
- Any sidecar/adapter usage is operator-owned and must comply with Strava API Agreement and app review/capacity rules.
- The public sidecar script is a technical reference only and does not remove API compliance obligations.

This is intentionally a separate operator path, not the recommended starting point for normal users.

## Security

- Security policy and vulnerability reporting: `SECURITY.md`

## License

Apache-2.0 (see `LICENSE`)

## Support

Buy me a coffee: `https://buymeacoffee.com/cyclenoid`
