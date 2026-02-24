# Security Policy

## Supported Versions

Security fixes are provided on the `main` branch.

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
- Protect `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REFRESH_TOKEN`.
- Protect database credentials (`POSTGRES_USER`, `POSTGRES_PASSWORD`).
- Protect CI secret `PWRX_ADAPTER_DEPLOY_KEY` (private SSH key for private adapter dependency access).
- Use distinct credentials for development and production.

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
