# PWRX - Power Explorer for Training Data

PWRX ist eine selbst gehostete Trainingsanalyse-App fuer Radsport und Laufen.  
Du importierst deine Aktivitaeten als Dateien (FIT/GPX/TCX oder ZIP-Export), und PWRX erstellt daraus ein lokales Dashboard mit Verlauf, Rekorden, Trainingslast und Auswertungen.

Die App laeuft ganz normal auf deinem eigenen Rechner oder auf deinem Heimserver.

## Fuer wen ist PWRX?

PWRX ist fuer Sportler gedacht, die:
- ihre Trainingsdaten selbst verwalten wollen
- eine lokale Loesung ohne Cloud-Zwang suchen
- ihre Historie aus Exportdateien sauber auswerten moechten

Du musst kein Entwickler sein. Wenn Docker laeuft, kannst du PWRX nutzen.

## Was du brauchst

- Docker + Docker Compose
- Etwas freier Speicher fuer Datenbank und Imports
- Trainingsdateien (z. B. FIT/GPX/TCX oder ein ZIP-Export)

Hinweis:
- Der Standardweg funktioniert direkt mit Datei-Import
- Keine API-Einrichtung noetig, um zu starten

## Typische Szenarien

1. Du willst nur lokal auf dem Laptop arbeiten:
   - PWRX starten
   - Dateien importieren
   - Dashboard nutzen
2. Du willst deine alte Historie uebernehmen:
   - ZIP-Export einmalig als Massenimport hochladen
   - danach neue FIT/GPX/TCX-Dateien regelmaessig nachziehen
3. Du willst PWRX auf einem Heimserver laufen lassen (z. B. Linux, Windows, NAS oder Unraid):
   - gleicher Datei-Import-Workflow
   - Zugriff per Browser im Heimnetz

## Schnellstart (lokal in wenigen Minuten)

1. Repository klonen
```bash
git clone https://github.com/cyclenoid/pwrx_public.git
cd pwrx_public
```

2. Konfiguration anlegen
```bash
cp .env.example .env
```
Windows (CMD):
```bat
copy .env.example .env
```

3. Pflichtwerte in `.env` setzen:
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`

Optional:
- `DATA_HUB_DATA_DIR` (Default: `./data`)
- `WATCH_FOLDER_SMB_PATH` (nur fuer Hinweistext im UI bei SMB/Netzlaufwerk)

4. Container starten
```bash
docker compose up -d
```

5. Im Browser oeffnen
```text
Dashboard: http://localhost:8088
API Health: http://localhost:3001/api/health
pgAdmin: http://localhost:5050
```

## Standard-Workflow: Aktivitaeten importieren

Das ist der empfohlene Normalfall fuer alle Nutzer.

### A) Einzelimport
- Einzelne FIT/GPX/TCX-Dateien direkt in der Import-Seite hochladen.

### B) Massenimport (ZIP)
- Kompletten Export als ZIP hochladen (z. B. fuer die erste Uebernahme deiner Historie).

### C) Optional: Watch Folder
- Dateien in einen beobachteten Ordner legen und automatisch importieren lassen.

Weiterfuehrende Import-Doku:
- Quickstart: `docs/IMPORT_QUICKSTART.md`
- Provider-Guide: `docs/IMPORT_PROVIDER_GUIDE.md`

## Was lokal gespeichert wird

Daten liegen in deinem konfigurierten Datenpfad:
- Default: `./data`
- Enthalten: Datenbankinhalte, Exporte, Logs, Bilder/Medien

PWRX ist fuer lokalen Betrieb ausgelegt.

## Updates

```bash
git pull
docker compose up -d
```

Wenn ein Release DB-Aenderungen enthaelt, Migration ausfuehren:
```bash
docker compose exec strava-tracker npm run db:migrate
```

Status pruefen:
```bash
docker compose exec strava-tracker npm run db:check
```

## FAQ (kurz)

**Kann ich PWRX ohne 24/7-Rechner nutzen?**  
Ja. Starte den Stack nur wenn du ihn brauchst. Optional kannst du Catch-up nach dem Start aktivieren.

**Brauche ich API-Zugaenge, um zu starten?**  
Nein. Der Standardbetrieb ist dateibasiert.

**Ist der erste Import langsam?**  
Bei grossen Historien kann der erste Lauf dauern. Der Import laeuft im Hintergrund weiter.

## Historie: Strava-API-Sync und warum die Public-Doku dateibasiert ist

Fruehere Versionen hatten einen direkten Strava-API-Sync.  
Im oeffentlichen Repository fuehrt das bei normalen Endnutzern schnell zu Verwirrung, weil Strava-API-Freigaben, Review-Prozesse und Rate-Limits nicht fuer jede Installation als Standard zugesichert werden koennen.

Deshalb ist der offizielle Public-Standard heute klar:
- Datei-Import als Standardweg (Einzelimport + ZIP-Massenimport)
- Keine Strava-API-Einrichtung als Voraussetzung fuer den Normalfall

Wichtig:
- Die Architektur bleibt technisch offen fuer Connectoren
- Solche Wege sind fortgeschrittene Betreiber-/Maintainer-Themen und nicht Teil des normalen Public-Endnutzer-Supports

Offizielle Strava-Hinweise zu Limits/Review:
- https://developers.strava.com/docs/rate-limits/
- https://developers.strava.com/docs/getting-started/
- API-Konnektivitaet und Betreiber-Recipe: `docs/STRAVA_CONNECTIVITY.de.md`

## Optional: Hinweise fuer fortgeschrittene Betreiber

Wenn du als Maintainer bewusst einen privaten Connector-Pfad betreibst, lies:
- `docs/DEPLOYMENT_RUNBOOK.md`
- `docs/STRAVA_CONNECTIVITY.de.md`

Wichtig:
- Strava-API-Konnektivitaet ist nicht Teil des oeffentlichen Standard-Supports.
- Sidecar-/Adapter-Betrieb liegt beim Betreiber und muss den Strava-API-Bedingungen inkl. Review-/Capacity-Regeln entsprechen.
- Das oeffentliche Sidecar-Skript ist nur eine technische Referenz und ersetzt keine Compliance-Pflichten.

Das ist absichtlich ein separater Operator-Pfad und nicht der empfohlene Start fuer normale Nutzer.

## Sicherheit

- Security-Policy und Meldung von Schwachstellen: `SECURITY.md`

## Lizenz

Apache-2.0 (siehe `LICENSE`)

## Support

Buy me a coffee: `https://buymeacoffee.com/cyclenoid`
