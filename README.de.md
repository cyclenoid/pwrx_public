# PWRX - Power Explorer for Training Data

Selbst gehostete Trainingsanalyse-App mit PostgreSQL, Datei-Import und React-Dashboard.

## Deployment-Modell

PWRX soll als eigenstaendige App direkt aus diesem Repository deploybar sein.

- Anwender benoetigen nur dieses Repo, Docker und PostgreSQL.
- Es ist kein separates `data-hub`-Repository oder eine Multi-App-Plattform noetig.
- Gemeinsame Host-Setups sind optionale Betreiber-Varianten, nicht die Produktbasis.

## Voraussetzungen
- Docker + Docker Compose
- PostgreSQL
- Optional, nur privat: zusaetzlicher Connector-Zugang per separater Vereinbarung

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
```

Alles Weitere aus `.env.example`, das Strava/private Adapter betrifft, ist optional und nur fuer ausgewaehlte private Betreiber relevant.

Dann Backend + Dashboard neu starten:
```bash
docker compose up -d --force-recreate strava-tracker strava-dashboard
```

## Privater Connector-Pfad (nicht Teil des oeffentlichen Angebots)
Das Public-Repository liefert keine offiziell unterstuetzte API-Connector-Einrichtung fuer normale Endanwender aus.

Grund:
- der Strava-API-Zugang unterliegt Strava-Review und Athlete-Capacity-Beschraenkungen
- neue Apps starten im Single-Athlete-Modus, bis Strava sie freigibt
- deshalb darf die Public-Doku Strava-API-Aktivierung nicht als normalen Standardfall darstellen

Offizielle Strava-Quellen:
- https://developers.strava.com/docs/rate-limits/
- https://developers.strava.com/docs/getting-started/

Wenn du den privaten Connector-Pfad explizit aktivierst:
```env
ADAPTER_STRAVA_ENABLED=true
```

dann nutzt du ein privates Maintainer-/Operator-Setup. Dafuer brauchst du:
- privaten Adapter-Zugang
- Strava-Credentials
- ein Host-SSH-Verzeichnis mit `pwrx_adapter_key`

In diesem privaten Modus injiziert der Docker-Laufzeitpfad das private Adapter-Paket erst beim Containerstart. Das Public-`package.json` haengt absichtlich nicht standardmaessig davon ab.

Empfohlene private Einstellungen:
```env
ADAPTER_STRAVA_PACKAGE=git+ssh://git@github.com/your-org/pwrx-adapter-strava.git
ADAPTER_STRAVA_MODULE=@your-org/pwrx-adapter-strava
```

Wichtig:
- `ADAPTER_STRAVA_PACKAGE` ist die Installationsquelle fuer Docker/npm
- `ADAPTER_STRAVA_MODULE` ist die Runtime-Modul-ID fuer Node
- diese beiden Dinge muessen getrennt bleiben; eine Git-URL ist keine gueltige `require()`-Modul-ID

Wenn dieser Key fehlt, scheitert der Backend-Start mit:
```text
Missing /root/.ssh/pwrx_adapter_key for private adapter install
```

Wichtig:
- `PWRX_SSH_DIR` muss ein Host-Pfad sein, nicht der Container-Pfad `/root/.ssh`
- Beispiel Windows: `C:/Users/<du>/.ssh`
- Beispiel Linux: `/home/<du>/.ssh`

Dieser private Connector-Pfad ist nur fuer Maintainer gedacht und nicht Teil des offiziellen Public-Supports.

Wichtige technische Regel:
- der Public-Core faellt nicht mehr auf lokale Strava-Module zurueck
- wenn der private Adapter nicht installiert oder geladen werden kann, bleibt Strava deaktiviert
- das ist beabsichtigt

## Erster Sync
Beim ersten Start laeuft eine Initialisierung fuer Import/Synchronisation. In privaten Connector-Operator-Setups kann ein API-basierter Initial-Sync je nach Datenmenge und Rate-Limits dauern.

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
- Deployment-Runbook (Public-Repo -> Unraid + Strava-Override): `docs/DEPLOYMENT_RUNBOOK.md`
- PowerShell-Smoketest-Script: `scripts/docker-release-smoke.ps1`

## Private Adapter-Validierung in CI
Die oeffentlichen Backend-Checks laufen jetzt ohne privaten Adapter.

Fuer eine optionale Validierung des privaten Adapter-Zugriffs in CI kann weiter dieses Repository-Secret genutzt werden:
- `PWRX_ADAPTER_KEY`

Wert des Secrets:
- kompletter privater SSH-Key (OpenSSH-Format), passend zu einem Read-only Deploy Key im Repo `your-org/pwrx-adapter-strava`.
- OpenSSH-Format beibehalten (mehrzeilig):
  - `-----BEGIN OPENSSH PRIVATE KEY-----`
  - Base64-Zeilen
  - `-----END OPENSSH PRIVATE KEY-----`

Ohne dieses Secret laufen die oeffentlichen Backend-Lint-/Build-/Test-Schritte weiter. Uebersprungen wird dann nur der optionale private Adapter-Zugriffstest.

Fuer lokale Docker-Tests mit privatem Adapter unter Windows/Linux:
- `PWRX_SSH_DIR` in `.env` setzen (z. B. `C:/Users/<du>/.ssh` unter Windows)
- sicherstellen, dass dort `pwrx_adapter_key` liegt und gueltig ist:
```bash
ssh-keygen -y -f ~/.ssh/pwrx_adapter_key
```

## Sicherheit
- Security-Policy und Meldung von Schwachstellen: `SECURITY.md`

## FAQ
**Was bedeuten Foto-Sync und Downloads?**  
Foto-Sync = Metadaten aus der verbundenen Quelle (z. B. URLs/Caption). Downloads = lokal gespeicherte Dateien. Die Zahlen sind pro Lauf.

**Warum dauert der erste Sync so lange?**  
Große Historien und Provider-Rate-Limits verlangsamen den Import. Er laeuft im Hintergrund weiter.

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
