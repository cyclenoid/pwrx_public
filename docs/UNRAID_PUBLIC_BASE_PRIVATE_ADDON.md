# Unraid: Public Base + Optional Strava Add-on

Recommended setup for self-hosted operators who want to test the same base as public users while keeping direct Strava sync optional.

## Target setup

- Default runtime on Unraid: public base (`docker-compose.yml`)
- Optional add-on (only on your own instance): `docker-compose.strava-addon.yml`
- Normal users do not need the add-on for file-import-first usage

## 1) Deploy / update the public base

```bash
git pull
docker compose up -d
```

This runs the same product baseline that public users get:
- FIT/GPX/TCX imports
- Strava account export ZIP import
- import queue + progress
- local segments
- watch-folder / SMB helper path (optional)

## 2) Enable the optional Strava add-on (your instance only)

Edit `.env` and add your own credentials:

```env
STRAVA_CLIENT_ID=...
STRAVA_CLIENT_SECRET=...
STRAVA_REFRESH_TOKEN=...
```

Start with the add-on override:

```bash
docker compose -f docker-compose.yml -f docker-compose.strava-addon.yml up -d
```

This keeps the same public base and only toggles the optional direct sync features.

## 3) Disable the add-on again (return to public baseline)

```bash
docker compose up -d
```

## Advanced / private modules (optional)

If you operate a custom/private adapter module:
- keep it outside the standard public setup
- configure it in `.env` (`ADAPTER_STRAVA_MODULE`)
- use private infrastructure/docs as needed

The public repo does not require private modules or SSH deploy keys for the normal runtime.

