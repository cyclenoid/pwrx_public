# PWRX - Power Explorer for Training Data

Selbst gehosteter Strava-Hub mit PostgreSQL (Schema-Trennung) und React-Dashboard.

## Deployment-Modell

PWRX soll als eigenstaendige App direkt aus diesem Repository deploybar sein.

- Anwender benoetigen nur dieses Repo, Docker und PostgreSQL.
- Es ist kein separates `data-hub`-Repository oder eine Multi-App-Plattform noetig.
- Gemeinsame Host-Setups sind optionale Betreiber-Varianten, nicht die Produktbasis.

## Voraussetzungen
- Docker + Docker Compose
- PostgreSQL
- Optional, nur privat: Strava-Connector-Zugang per separater Vereinbarung

## Quick Start (Docker)
1. `.env.example` nach `.env` kopieren
```bash
cp .env.example .env
```

2. Pflichtwerte in `.env` setzen
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

## Public-Core Modus (offizielle Public-Basis)
Das ist die offizielle Public-Basis dieses Repositories.

- Datei-Import funktioniert ohne Strava-API-Zugang
- kein privater Adapter-Zugang noetig
- kein SSH-Deploy-Key noetig

In `.env` setzen:
```env
ADAPTER_FILE_ENABLED=true
ADAPTER_STRAVA_ENABLED=false
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
STRAVA_REFRESH_TOKEN=
ADAPTER_STRAVA_MODULE=
PWRX_SSH_DIR=
```

Dann Backend + Dashboard neu starten:
```bash
docker compose up -d --force-recreate strava-tracker strava-dashboard
```

## Privater Strava-Connector (nicht Teil des oeffentlichen Angebots)
Das Public-Repository liefert keinen offiziell unterstuetzten Strava-Connector fuer Endanwender aus.

Grund:
- der Strava-API-Zugang unterliegt Strava-Review und Athlete-Capacity-Beschraenkungen
- neue Apps starten im Single-Athlete-Modus, bis Strava sie freigibt
- deshalb darf die Public-Doku Strava-API-Aktivierung nicht als normalen Standardfall darstellen

Offizielle Strava-Quellen:
- https://developers.strava.com/docs/rate-limits/
- https://developers.strava.com/docs/getting-started/

Wenn du setzt:
```env
ADAPTER_STRAVA_ENABLED=true
```

dann nutzt du explizit ein privates Maintainer-/Operator-Setup. Dafuer brauchst du:
- privaten Adapter-Zugang
- Strava-Credentials
- ein Host-SSH-Verzeichnis mit `pwrx_adapter_deploy`

Wenn dieser Key fehlt, scheitert der Backend-Start mit:
```text
Missing /root/.ssh/pwrx_adapter_deploy for private adapter install
```

Wichtig:
- `PWRX_SSH_DIR` muss ein Host-Pfad sein, nicht der Container-Pfad `/root/.ssh`
- Beispiel Windows: `C:/Users/<du>/.ssh`
- Beispiel Linux: `/home/<du>/.ssh`

Dieser private Connector-Pfad ist nur fuer Maintainer gedacht und nicht Teil des offiziellen Public-Supports.

## Erster Sync
Beim ersten Start laeuft eine Initialisierung fuer Datei-Import/Synchronisation. In privaten Strava-Operator-Setups kann ein Strava-basierter Initial-Sync je nach Datenmenge und Strava-Rate-Limits dauern.

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

## Workshop App (optional, eigene DB auf gemeinsamer PostgreSQL-Instanz)
Die Fahrrad-Workshop-App kann auf demselben PostgreSQL-Server laufen, sollte dort aber ihre eigene Datenbank und ihren eigenen App-User nutzen.

1. Optionale Variablen in `.env` setzen:
```env
WORKSHOP_APP_PATH=../workshop
WORKSHOP_APP_PORT=8096
WORKSHOP_DB_NAME=workshop
WORKSHOP_DB_USER=workshop_app
WORKSHOP_DB_PASSWORD=...
WORKSHOP_DB_SCHEMA=
```

2. Overlay-Service starten:
```bash
docker compose -f docker-compose.yml -f docker-compose.workshop.yml up -d workshop-app
```

3. Aufruf:
```text
Workshop App: http://localhost:8096
```

Die App nutzt denselben PostgreSQL-Server, aber nicht dieselbe App-Datenbank.
Empfohlener Laufzeitstand:
- DB: `workshop`
- User: `workshop_app`
- Schema: `public` (also `WORKSHOP_DB_SCHEMA` leer lassen)

Optionale Erinnerungs-Kanaele fuer Werkstatttermine:
- SMTP: `WORKSHOP_SMTP_*`
- Telegram-Bot: `WORKSHOP_TELEGRAM_BOT_TOKEN`, `WORKSHOP_TELEGRAM_CHAT_ID`

## Import von Aktivitaetsdateien
- Quickstart: `docs/IMPORT_QUICKSTART.md`
- Provider-Guide (Zwift/Wahoo/Garmin/Apple Health): `docs/IMPORT_PROVIDER_GUIDE.md`
- Docker-Release-Testablauf: `docs/DOCKER_RELEASE_TEST_PLAN.md`
- Deployment-Runbook (Public-Repo -> Unraid + Strava-Override): `docs/DEPLOYMENT_RUNBOOK.md`
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
