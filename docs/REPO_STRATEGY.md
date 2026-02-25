# Repo Strategy (Public Base + Private Add-ons)

This document defines how to use the public repository and a private/internal repository without mixing concerns.

## Goal

- Keep the public product reproducible for all users
- Keep private integrations and infrastructure details out of the public repo
- Test features on the same base that users run

## Recommended Split

### Public repo (`pwrx_public`)

Use for:
- product code and UI
- Docker deployment (`docker-compose.yml`)
- public docs, CI, issues, releases
- file import, Strava export ZIP import, queue, segments, gear, watch-folder features

This is the default runtime and release source.

### Private repo (internal)

Use for:
- private integrations/modules
- internal deployment scripts or infrastructure notes
- experiments not ready for public release
- credentials handling templates specific to your environment

Do not use the private repo as the default product deployment source once the public repo is established.

## Day-to-day Workflow

1. Build/test normal product features in the public repo.
2. Deploy the public repo to your self-hosted instance (same base as users).
3. Enable optional add-ons only on your own instance when needed.
4. Keep private integrations isolated (override files, private modules, internal docs).

## Add-on Model (Self-hosted)

- Base runtime: `docker-compose.yml`
- Optional direct Strava sync add-on: `docker-compose.strava-addon.yml`
- Advanced/private modules: self-managed and not part of the standard distribution

## Why this matters

- Bugs are easier to reproduce because your environment matches user installs.
- Public releases stay clean and supportable.
- Private integration work can continue without leaking internal details into public history.

