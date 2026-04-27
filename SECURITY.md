# Security Policy

This file is public by design and intended for everyone who runs or evaluates this repository.
It explains how to report security issues and how secrets must be handled.
It is not a setup guide for enabling optional Strava API operation.

## Supported Versions

Security fixes are provided on the `main` branch.

## Scope

This project has:
- a normal public setup (file-import based)
- optional advanced operator variants (for example operator-managed Strava API connector)

Security expectations apply to both, but most users only need the public setup.

## Reporting a Vulnerability

Do not open public issues for sensitive reports.

Please send details to the repository owner/maintainer directly and include:
- A short summary
- Reproduction steps
- Impact assessment
- Suggested mitigation (if available)

You can expect:
- Acknowledgement as soon as possible
- Triage and severity assessment
- A coordinated fix and disclosure timeline

## Secrets and Token Handling

- Never commit real secrets to git.
- Use `.env` files only for local/runtime configuration.
- Keep `.env` and any private token files out of version control.
- Rotate compromised credentials immediately.

For this project in particular:
- Protect database credentials (`POSTGRES_USER`, `POSTGRES_PASSWORD`).
- Use distinct credentials for development and production.

If you run the optional private Strava connector:
- Protect `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REFRESH_TOKEN`.
- Protect any deployment keys or package credentials used by your private connector setup.

## Recommended Hardening

- Restrict network access to Postgres and admin tools (for example pgAdmin).
- Expose only required ports to untrusted networks.
- Use strong, unique passwords for all services.
- Keep Docker images and npm dependencies up to date.
- Run database migrations only from trusted code revisions.

## Data and Privacy Notes

- Activity imports may contain location and health-related metadata.
- Store backups and exported files in protected locations.
- Apply least-privilege access to data directories and host mounts.
