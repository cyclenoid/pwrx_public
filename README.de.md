# PWRX - Power Explorer for Training Data

Selbst gehosteter Strava-Hub mit PostgreSQL (Schema-Trennung) und React-Dashboard.

## Voraussetzungen
- Docker + Docker Compose
- Strava API App + Refresh Token

## Quick Start (Docker)
1. `.env.example` nach `.env` kopieren
```bash
cp .env.example .env
```

2. Pflichtwerte in `.env` setzen
- `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REFRESH_TOKEN`
- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
- Optional: `DATA_HUB_DATA_DIR` (Default: `./data`)
Hinweis: Das Postgres-Passwort wird nur beim ersten Initialisieren des DB-Volumes gesetzt. Wenn du es spaeter aenderst, musst du das Passwort in Postgres aktualisieren oder das Volume zuruecksetzen.

3. Dienste starten
```bash
docker compose up -d
```

4. Dienste aufrufen
```text
Dashboard: http://localhost:8088
API Health: http://localhost:3001/api/health
pgAdmin: http://localhost:5050
```

## Public-Core Testmodus (ohne Strava API)
Diesen Modus nutzen, um die App wie ein oeffentlicher User nur mit Datei-Import zu testen.

In `.env` setzen:
```env
ADAPTER_FILE_ENABLED=true
ADAPTER_STRAVA_ENABLED=false
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
STRAVA_REFRESH_TOKEN=
```

Dann Backend + Dashboard neu starten:
```bash
docker compose up -d --force-recreate strava-tracker strava-dashboard
```

In diesem Modus sind keine privaten Adapter-Deploy-Keys noetig (`PWRX_ADAPTER_DEPLOY_KEY` / `PWRX_SSH_DIR`).

## Erster Sync
Beim ersten Start laeuft automatisch ein Initial-Sync (Default: letzte 180 Tage). Das kann je nach Datenmenge und Strava-Rate-Limits dauern.

## Sync (Auto + Manuell)
- Auto-Sync laeuft taeglich zur gewaehlten Uhrzeit.
- Optional: Catch-up nach dem Start, wenn der Rechner aus war.
- Manueller Sync ist in der UI (Settings/Dashboard) verfuegbar.

API-Endpunkte:
- Full Sync (Activity + Backfill): `POST /api/sync` (Alias: `POST /api/sync/full`)
- Backfill only (Luecken): `POST /api/sync/backfill`

## Kein 24/7 Rechner
Wenn der Rechner zur geplanten Zeit aus ist, aktiviere "Catch-up nach dem Start" in den Settings. Beim naechsten Start wird der Sync nachgeholt.

## Update
```bash
git pull
docker compose up -d
```

## Datenbank-Migrationen
Wenn ein Release neue DB-Felder/Tabellen einfuehrt, muessen Migrationen laufen:
```bash
docker compose exec strava-tracker npm run db:migrate
```

Lokal:
```bash
cd apps/strava
npm run db:migrate
```

Optional: Auto-Migrate beim Start:
- In `.env` `MIGRATE_ON_START=1` setzen.

Status pruefen:
```bash
docker compose exec strava-tracker npm run db:check
```

## Daten & Storage
Exports, Logs und Fotos liegen unter `DATA_HUB_DATA_DIR` (Default: `./data`).

## Import von Aktivitaetsdateien
- Quickstart: `docs/IMPORT_QUICKSTART.md`
- Provider-Guide (Zwift/Wahoo/Garmin/Apple Health): `docs/IMPORT_PROVIDER_GUIDE.md`
- Docker-Release-Testablauf: `docs/DOCKER_RELEASE_TEST_PLAN.md`
- PowerShell-Smoketest-Script: `scripts/docker-release-smoke.ps1`

## Privater Strava-Adapter in CI
Wenn das Backend das private Paket `@cyclenoid/pwrx-adapter-strava` nutzt, braucht der Backend-CI-Job ein Repository-Secret:
- `PWRX_ADAPTER_DEPLOY_KEY`

Wert des Secrets:
- kompletter privater SSH-Key (OpenSSH-Format), passend zu einem Read-only Deploy Key im Repo `cyclenoid/pwrx-adapter-strava`.
- OpenSSH-Format beibehalten (mehrzeilig):
  - `-----BEGIN OPENSSH PRIVATE KEY-----`
  - Base64-Zeilen
  - `-----END OPENSSH PRIVATE KEY-----`

Ohne dieses Secret scheitert `npm ci` in `apps/strava` in GitHub Actions.

Fuer lokale Docker-Tests mit privatem Adapter unter Windows/Linux:
- `PWRX_SSH_DIR` in `.env` setzen (z. B. `C:/Users/<du>/.ssh` unter Windows)
- sicherstellen, dass dort `pwrx_adapter_deploy` liegt und gueltig ist:
```bash
ssh-keygen -y -f ~/.ssh/pwrx_adapter_deploy
```

## Sicherheit
- Security-Policy und Meldung von Schwachstellen: `SECURITY.md`

## FAQ
**Was bedeuten Foto-Sync und Downloads?**  
Foto-Sync = Metadaten von Strava (URLs/Caption). Downloads = lokal gespeicherte Dateien. Die Zahlen sind pro Lauf.

**Warum dauert der erste Sync so lange?**  
Große Historien und Strava-Rate-Limits verlangsamen den Import. Er laeuft im Hintergrund weiter.

**Warum bleiben Segmente offen?**  
Segmente werden in Paketen nachgeladen. Bei Rate-Limits einfach spaeter erneut syncen.

**Kann ich ohne Auto-Sync laufen?**  
Ja. Auto-Sync in den Settings deaktivieren und manuell syncen.

**Laptop nicht immer an?**  
Catch-up nach dem Start aktivieren. Dann wird der Sync beim naechsten Start ausgefuehrt.

**Brauche ich Migrationen nach Updates?**  
Nur wenn ein Release das DB-Schema aendert. Dann `npm run db:migrate` ausfuehren.

## Lizenz
Apache-2.0 (siehe `LICENSE`).

## Support
Buy me a coffee: `https://buymeacoffee.com/cyclenoid`
