# PWRX - Power Explorer for Training Data

Selbst gehostetes Trainingsdaten-Dashboard mit PostgreSQL (Schema-Trennung) und React-UI.

> Public Beta (`v0.9.0-beta.1`)
> Das Standard-Setup ist file-import-first (FIT/GPX/TCX + Strava-Export-ZIP). Optionale Integrationen sind nicht Teil der Standard-Distribution und muessen vom Nutzer in Eigenregie konfiguriert werden.

## Voraussetzungen
- Docker + Docker Compose
- Git (zum Klonen des Repositories)
- Genug freier Speicherplatz fuer Datenbank/Importe/Fotos (je nach Nutzung)

Release Notes: `docs/RELEASE_NOTES_v0.9.0-beta.1.de.md` / `docs/RELEASE_NOTES_v0.9.0-beta.1.en.md`

## Quick Start (Docker)
1. `.env.example` nach `.env` kopieren
```bash
cp .env.example .env
```

2. Pflichtwerte in `.env` setzen
- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
- `PGADMIN_DEFAULT_EMAIL`, `PGADMIN_DEFAULT_PASSWORD`
- Optional: `DATA_HUB_DATA_DIR` (Default: `./data`)
Hinweis: PWRX funktioniert standardmaessig mit Datei-Import. Direkte Drittanbieter-API-Integrationen sind nicht Teil des Standard-Setups und muessen vom Nutzer in Eigenregie konfiguriert werden.
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

Hinweis: `strava-tracker` in den Docker-Kommandos unten ist ein historischer interner Service-Name. Das oeffentliche Standard-Setup bleibt Datei-Import-first.

## Erster Start (empfohlener Ablauf)
1. `http://localhost:8088` im Browser oeffnen
2. Ueber den Import-Button FIT/GPX/TCX-Dateien oder eine Strava-Account-Export-ZIP hochladen
3. In den Einstellungen mindestens Koerpergewicht setzen (FTP optional, aber empfohlen)
4. Bei Bedarf Ausruestung und Segment-Einstellungen pruefen

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
- Kernpfad in der Public Beta: manueller Import von FIT/GPX/TCX-Dateien und Strava-Account-Export-ZIPs (inkl. Namens-/Gear-Zuordnung und optionalem Medienimport aus dem Export).
- Quickstart: `docs/IMPORT_QUICKSTART.md`
- Provider-Guide (Zwift/Wahoo/Garmin/Apple Health): `docs/IMPORT_PROVIDER_GUIDE.md`
- Docker-Release-Testablauf: `docs/DOCKER_RELEASE_TEST_PLAN.md`
- PowerShell-Smoketest-Script: `scripts/docker-release-smoke.ps1`

### Watch Folder (Self-hosted / SMB)
- PWRX ueberwacht im Container den Pfad `/imports/watch`.
- Die Standard-Docker-Installation bindet dazu den Host-Pfad `./data/imports/watch` ein und zeigt ihn in der UI als Zielpfad an.
- Optional: `WATCH_FOLDER_SMB_PATH` in `.env` setzen, um einen Netzwerkpfad in der UI anzuzeigen (z. B. `\\\\unraid\\pwrx-import`).

## Optionale Integrationen (Advanced / in Eigenregie)
Das oeffentliche Standard-Setup ist file-import-first und benoetigt keine direkte API-Integration.

Wenn Nutzer eigene Integrationen bauen (z. B. ueber externe Adapter-Module), ist das nicht Teil der Standard-Distribution und muss eigenstaendig konfiguriert und betrieben werden.

## Sicherheit
- Security-Policy und Meldung von Schwachstellen: `SECURITY.md`

## FAQ
**Was bedeuten Foto-Sync und Downloads?**  
Bei optionalen Sync-Integrationen bedeutet Foto-Sync = importierte Foto-Metadaten (URLs/Caption). Downloads = lokal gespeicherte Dateien. Die Zahlen sind pro Lauf.

**Warum dauert der erste Import so lange?**  
Große Export-ZIPs, Medienimport und viele Aktivitaeten koennen den ersten Import verlangsamen. Die Queue-Verarbeitung laeuft im Hintergrund weiter.

**Warum bleiben Segmente offen?**  
Segmente werden in Paketen nachgeladen. Bei Rate-Limits einfach spaeter erneut syncen.

**Kann ich ohne Auto-Sync laufen?**  
Ja. Das oeffentliche Standard-Setup arbeitet mit Datei-Import. Wenn du eine optionale Sync-Integration nutzt, kannst du Auto-Sync in den Settings deaktivieren und manuell syncen.

**Laptop nicht immer an?**  
Manuellen Import nutzen oder (self-hosted) den Watch-Folder verwenden. Importe laufen weiter, sobald der Rechner wieder an ist.

**Brauche ich Migrationen nach Updates?**  
Nur wenn ein Release das DB-Schema aendert. Dann `npm run db:migrate` ausfuehren.

## Lizenz
Apache-2.0 (siehe `LICENSE`).

## Support
Buy me a coffee: `https://buymeacoffee.com/cyclenoid`

## Public-Beta Feedback
- Nutze GitHub Issues fuer Bugreports und Feature-Requests (Templates sind enthalten).
- Wenn du GitHub Discussions im Repo aktivierst, nutze sie fuer Setup-Fragen und UX-Feedback, damit Issues technisch fokussiert bleiben.
- Bitte bei Import-/Queue-Themen Version (`v0.9.0-beta.1`), Umgebung (OS/Docker/Browser/Proxy) und Reproduktionsschritte angeben.
