# Codex TODO-Plan: Import-Pipeline für Trainingsdateien (PWRX)

Ziel: PWRX um einen robusten Datei-Import erweitern (FIT/GPX/TCX …), inkl. manueller Upload UI und Massenimport über “Watch Folder”. Quellen: Apple Health (Export), Wahoo, Zwift, Garmin (jeweils über Datei-Formate).

---

## 0) Grundsätze / Anforderungen
- Unterstützte Formate (MVP): **.fit**, **.gpx**, **.tcx**
- Optional später: **.csv** (Apple Health Export), **.json** (HealthKit Dumps), **.zip** (Bulk-Export Archive)
- Import muss:
  - idempotent sein (Duplikate vermeiden)
  - robust sein (kaputte Dateien/Teilimporte abfangen)
  - schnell sein (Batch/Queue)
  - nachvollziehbar sein (Import-Log + UI-Status)

---

## 1) Datenmodell erweitern (DB)
### 1.1 Tabellen/Entities
- `activities`
  - `id` (uuid)
  - `source` (enum: file|zwift|wahoo|garmin|apple_health|unknown)
  - `sport_type` (run|ride|swim|…)
  - `start_time_utc`
  - `timezone_offset_min` (optional)
  - `duration_sec`
  - `distance_m`
  - `elevation_gain_m` (optional)
  - `avg_hr`, `max_hr` (optional)
  - `avg_power`, `max_power` (optional)
  - `avg_cadence` (optional)
  - `calories` (optional)
  - `device` (text optional)
  - `external_id` (text optional; z.B. garmin activity id, wenn vorhanden)
  - `import_batch_id` (uuid)
  - `created_at`, `updated_at`
- `activity_streams`
  - `activity_id`
  - `time_s` (int array) oder normalized table
  - `lat`, `lng` (optional)
  - `alt_m` (optional)
  - `hr_bpm`, `power_w`, `cad_rpm`, `speed_mps` (optional)
  - (Entscheidung: arrays vs. normalisierte samples Tabelle)
- `imports`
  - `id` (uuid)
  - `type` (single|batch|watchfolder)
  - `status` (queued|processing|done|error|partial)
  - `source` (file|watchfolder|api)
  - `started_at`, `finished_at`
  - `files_total`, `files_ok`, `files_skipped`, `files_failed`
- `import_files`
  - `import_id`
  - `path` / `original_filename`
  - `size_bytes`
  - `sha256`
  - `detected_format` (fit|gpx|tcx|zip|csv)
  - `status` (ok|skipped_duplicate|failed)
  - `error_message` (text)
  - `activity_id` (nullable)

### 1.2 Dedup-Strategie (sehr wichtig)
- Primär: `sha256` der Datei → wenn schon importiert → skip
- Sekundär (wenn z.B. gleiche Aktivität in anderem Format): `fingerprint`
  - `fingerprint = hash(start_time_utc + duration_sec + distance_m_rounded + sport_type)`
  - Distanz runden (z.B. auf 10m) und Dauer runden (z.B. auf 1s/5s)
- DB-Constraints:
  - Unique Index auf `import_files.sha256`
  - Unique Index auf `activities.fingerprint` (optional “soft unique” mit tolerance)

---

## 2) Parser-Schicht implementieren
### 2.1 Einheitliche Parser API
Erstelle Interface:
- `parseActivity(filePath|buffer) -> ParsedActivity`
  - metadata: sport_type, start_time, duration, distance, device
  - samples/streams: arrays (time, hr, power, gps, alt, cadence, speed)
  - laps/segments optional

### 2.2 FIT Parser
- Node.js: `fit-file-parser` oder `@garmin-fit/sdk` (falls verfügbar) oder alternative stabile lib.
- Anforderungen:
  - Handle fehlende Felder (HR/Power/GPS optional)
  - Handle Pausen/Autopause (wenn möglich)
  - Extrahiere:
    - Startzeit UTC
    - Sportart (running/cycling)
    - Samples (record messages)
    - Summary (avg/max)

### 2.3 GPX Parser
- Parsen von Trackpoints (time/lat/lon/ele)
- Speed aus Distanz/Delta-Zeit berechnen (optional)
- HR/Power oft nicht enthalten → optional (GPX Extensions)

### 2.4 TCX Parser
- Trackpoints: time, position, altitude, distance, hr, cadence
- Power meist über Extensions → optional

### 2.5 ZIP Bulk-Import (optional ab MVP2)
- Wenn Datei `.zip`:
  - in temp dir entpacken
  - rekursiv FIT/GPX/TCX suchen
  - einzeln importieren (mit sha256)

---

## 3) Import-Service (Backend)
### 3.1 Single Import Endpoint
- `POST /api/import/file` (multipart upload)
  - speichert Datei in `storage/imports/<importId>/...`
  - legt `imports` + `import_files` an
  - queued Job starten

### 3.2 Batch Import Endpoint
- `POST /api/import/batch` (mehrere Dateien)
  - gleiche Logik, nur `files_total` > 1

### 3.3 Watch-Folder Service
Ziel: Ordnerpfad konfigurieren, neue Dateien automatisch importieren.
- Konfiguration:
  - `WATCH_FOLDER_PATH=/data/pwrx-import`
  - `WATCH_FOLDER_RECURSIVE=true`
  - `WATCH_FOLDER_POLL_SECONDS=15` (oder fs events)
- Implementierung:
  - Node: `chokidar` (fs events) + fallback Poll
  - Für jede neue Datei:
    - warte bis Datei “stabil” (Größe 2–3x unverändert)
    - sha256 berechnen
    - import job enqueuen
- Wichtig: “at-least-once” Verarbeitung + idempotent durch sha256 unique.

### 3.4 Job Queue
- Verwende vorhandene Queue (BullMQ/Redis) oder einfache DB-Queue.
- Jobs:
  - `IMPORT_FILE(importFileId)`
- Worker:
  - lädt Datei
  - erkennt Format
  - parse
  - dedup prüfen (sha256 + fingerprint)
  - schreibt `activities` + streams
  - setzt Status/Counts

### 3.5 Error Handling
- Pro Datei Fehler isoliert (Batch soll weiterlaufen)
- Store `error_message` + stack (optional)
- “Partial done” Status für Import

---

## 4) UI / UX
### 4.1 Manuell: Upload Screen
- “Import” Seite mit:
  - Drag&Drop + Datei auswählen (multi)
  - Fortschritt je Datei (queued/processing/done/duplicate/failed)
  - Zusammenfassung (ok/skipped/failed)
  - Link zu importierten Aktivitäten

### 4.2 Massenimport: Watch Folder
- Settings Seite:
  - Watch Folder aktiv/inaktiv
  - Pfad anzeigen (read-only aus env)
  - Letzte 50 Import-Events anzeigen
  - Button: “Rescan Folder” (optional: manuell auslösen)

### 4.3 Dedupe Feedback
- Wenn Duplikat: UI zeigt “bereits vorhanden” + Link zur bestehenden Aktivität

---

## 5) Quelle-spezifische Hinweise (Apple / Garmin / Wahoo / Zwift)
- **Zwift (Mac):** Dateien landen lokal als FIT → Watch Folder kann Zwift-Activities Folder direkt überwachen oder per Sync kopieren.
- **Wahoo:** FIT via ELEMNT App Export / Cloud Sync → am Ende Datei in Inbox.
- **Garmin:** FIT via Garmin export/Download → Datei in Inbox.
- **Apple Health:** MVP: Import von **GPX/FIT/TCX** die aus einer Bridge-App exportiert wurden (z.B. HealthFit/RunGap). Später: CSV/XML Apple Health Export Parser.

---

## 6) Tests
- Unit-Tests für Parser:
  - FIT ohne GPS
  - FIT mit GPS/Power/HR
  - GPX mit/ohne Zeitstempel
  - TCX mit Extensions
- Integration-Tests:
  - Upload → Import → Activity sichtbar
  - Duplicate Import → skipped
  - Batch Import mit 1 defekter Datei → partial

---

## 7) Performance / Speicher
- Streams-Speicherung:
  - MVP: arrays (JSONB) ok
  - später: normalisierte `samples` Tabelle + optional downsampling
- Optional: Kompression (gzip) für große Streams
- Import parallelisieren (Worker concurrency)

---

## 8) Deliverables (Definition of Done)
- [x] Upload UI (multi) + Import Status
- [x] Backend Upload + Import Worker + DB Persist
- [x] Parser: FIT/GPX/TCX
- [x] Dedup via sha256 + fingerprint
- [x] Watch Folder Service (polling scanner) + stable-file check
- [x] Import Logs UI
- [x] Dokumentation: “So importierst du von Zwift/Wahoo/Garmin/Apple Watch”

---

## 9) Bonus (später)
- [ ] Strava nur als “Connect/Short Cache” (≤7 Tage), keine Langzeit-Rohdaten
- [ ] Auto-tagging “Indoor/Outdoor”, “Zwift”, “Treadmill”
- [ ] Service-Notifications (Bike hours/km) aus importierten Daten

---

## 10) Roadmap (priorisiert)
### MVP1 (Datei-Import Basis)
- [x] DB-Erweiterung: `imports`, `import_files`, `activities` + `activity_streams` (minimal)
- [x] Parser: FIT + GPX + TCX (happy path)
- [x] Backend: `POST /api/import/file` + `POST /api/import/batch`
- [x] Dedupe: `sha256` + einfacher Fingerprint
- [x] UI: Upload Screen + Statusliste (ok/duplicate/failed)
- [x] Dokumentation: Basis-Import (Zwift/Wahoo/Garmin via Datei)

### MVP2 (Robustheit + Komfort)
- [x] Watch Folder Service + stable-file check
- [x] Import Logs UI + Import Detail View
- [x] Fehlerrobustheit: partial status + retries
- [x] ZIP Bulk-Import
- [x] Parser: bessere Extensions (HR/Power in GPX/TCX)

### MVP3 (Performance + Insights)
- [x] Queue/Worker (BullMQ/Redis oder DB-Queue)
- [ ] Streams: optional normalisierte Samples Tabelle + Downsampling
- [x] Import Metriken (Durchsatz, Fehlerquote)
- [ ] Auto-Tags + Regeln (Indoor/Outdoor, Zwift, Treadmill)

---

## 11) Architektur (Kurzüberblick)
```
UI (Upload)
    |
    v
API: /api/import/file|batch
    |
    v
Storage: imports/<importId>/
    |
    v
Queue/Worker
    |
    v
Parser (FIT/GPX/TCX)
    |
    v
DB: activities + activity_streams + imports + import_files
    |
    v
UI: Import Status + Activity Views

Watch Folder -> Scanner -> Queue/Worker -> Parser -> DB
```

---

## 12) Datenmodell-Entscheidung (MVP)
- **MVP1:** Streams als **JSONB Arrays** in `activity_streams` (ein Datensatz pro Activity).
  - Pro: schnell implementierbar, wenig Tabellen.
  - Contra: größere payloads, weniger flexible Queries.
- **MVP3:** Optional Umstieg auf normalisierte `activity_samples` Tabelle + Downsampling.

---

## 13) MVP1 Tickets (konkret)
### DB
- [x] `DB-01` Schema erweitern: `imports`, `import_files`, `activities` (Import-Felder), `activity_streams`
- [x] `DB-02` Indizes + Constraints (sha256 unique, optional fingerprint)

### Parser
- [x] `P-01` Parser Interface + Typen
- [x] `P-02` FIT Parser (records + summary)
- [x] `P-03` GPX Parser (trackpoints + time)
- [x] `P-04` TCX Parser (trackpoints + extensions)
- [x] `P-05` Parser-Tests (happy + corrupted)

### Backend Import
- [x] `B-01` Upload API: `POST /api/import/file`
- [x] `B-02` Upload API: `POST /api/import/batch`
- [x] `B-03` Import Worker (sync loop, später queue)
- [x] `B-04` Dedupe: sha256 + fingerprint
- [x] `B-05` Import Status / Logs

### UI
- [x] `UI-01` Import Screen (Drag&Drop, Multi)
- [x] `UI-02` Statusliste (queued/done/duplicate/failed)
- [x] `UI-03` Summary + Links zu Activities

### Docs
- [x] `D-01` Quickstart Import
- [x] `D-02` Provider How-to (Zwift/Wahoo/Garmin/Apple Health)

---

## 14) Aufwandsschätzung (grob)
Hinweis: sehr grob, abhängig von Parser-Libs und Testdaten.
- **DB-01/02:** 0.5–1.0 Tage
- **Parser P-01..P-04:** 2–4 Tage
- **Parser Tests P-05:** 1–2 Tage
- **Backend B-01..B-05:** 2–4 Tage
- **UI UI-01..UI-03:** 2–3 Tage
- **Docs D-01..D-02:** 0.5–1.0 Tage

**MVP1 Gesamt:** ca. 8–15 Tage

---

## 15) Konkrete Tasks (Modulweise)
### Parser
- [x] Implementiere `parseActivity(buffer|path)` Interface
- [x] FIT: record messages, sport_type, start_time, summary
- [x] GPX: trackpoints + optional extensions
- [x] TCX: trackpoints + extensions
- [x] Unit Tests pro Format + 1 defekte Datei

### Backend / Import
- [x] Upload Endpoints (single + batch)
- [x] Dateiablage + sha256 + Import-Entities
- [x] Worker-Loop (synchron als MVP, Queue später)
- [x] Dedupe: sha256 + fingerprint
- [x] Import-Status: queued/processing/done/duplicate/failed

### Watch Folder
- [x] Config via ENV
- [x] File stability check (size unchanged)
- [x] Recursive scan + Rescan Trigger

### UI
- [x] Import-Seite (Upload + Status)
- [x] Import-Log Liste (letzte 50)
- [x] Duplicate Hinweis + Link zur Activity

### Docs
- [x] Quickstart Import
- [x] Provider How-to (Zwift/Wahoo/Garmin/Apple Health)

---

## 16) Repo-Abgleich (Stand: 2026-02-07)
Der aktuelle Code-Stand enthaelt eine lauffaehige Datei-Import-Pipeline (UI + API + Parser + Dedupe + Watch Folder + Retry + ZIP).

### Bereits vorhanden
- [x] Express API + Router-Struktur (`apps/strava/src/index.ts`, `apps/strava/src/api/routes.ts`)
- [x] Migration-Framework (`apps/strava/migrations`, `npm run db:migrate`)
- [x] Persistenz für `activities` + `activity_streams`
- [x] UI für Status/Logs-Muster (Sync-Logs in Settings)

### Fehlt für Datei-Import
- [ ] Vollstaendige automatisierte Parser-Testabdeckung mit realen Datei-Fixtures
- [ ] Queue-Hardening Phase 4 (Alert-Historie + Eskalationsrouten + SLO-Dashboards)

---

## 17) Architekturentscheidung fuer MVP1 (ohne Breaking Changes)
Wichtige Randbedingung: `activities.strava_activity_id` ist aktuell zentral (`NOT NULL`, `UNIQUE`) und wird in vielen Queries/Joins direkt verwendet.

### Entscheidung (MVP1)
Datei-importierte Activities werden ebenfalls in `activities` gespeichert, aber mit **synthetischer Activity-ID** (lokal generiert), damit bestehende Abfragen und `activity_streams.activity_id -> activities.strava_activity_id` unveraendert funktionieren.

- Neue Sequence: `import_activity_id_seq` (negativ zaehlend, z. B. `-1, -2, -3, ...`)
- Neue Spalten in `activities`:
  - `source` (default `strava`, fuer Import `file`)
  - `external_id` (optional)
  - `fingerprint` (optional, fuer Sekundaer-Dedupe)
  - `import_batch_id` (FK auf `imports.id`, optional)
- Neue Tabellen:
  - `imports`
  - `import_files` (mit `sha256` unique)

Vorteil: Keine grossen Refactors in bestehenden Analytics-Queries fuer MVP1.

---

## 18) MVP1-Umsetzung in 3 Slices (konkret)
### Slice A: DB + Import-Grundgeruest
- [x] `A-01` Migration `0004_import_pipeline.sql` anlegen
- [x] `A-02` Tabellen `imports`, `import_files` + Indizes/Constraints
- [x] `A-03` `activities` um `source`, `external_id`, `fingerprint`, `import_batch_id` erweitern
- [x] `A-04` Sequence `import_activity_id_seq` einfuehren
- [x] `A-05` DB-Service Methoden fuer Import-Entities anlegen (`apps/strava/src/services/database.ts`)

Definition of Done:
- Migration laeuft mit `npm run db:migrate` sauber durch.
- `npm run db:check` meldet keine offenen Migrationen.
Status: Code umgesetzt, Ausfuehrung gegen echte DB noch offen.

### Slice B: Parser + Single Upload
- [x] `B-01` Upload-Endpoint `POST /api/import/file` (multipart)
- [x] `B-02` Format-Erkennung (`fit|gpx|tcx`) + Dateiablage unter `data/imports/<importId>/`
- [x] `B-03` Parser-Interface `parseActivity(buffer|path)` + FIT/GPX/TCX Happy-Path
- [x] `B-04` Dedupe Schritt 1: `sha256` auf Dateiebene
- [x] `B-05` Persistenz in `activities` + `activity_streams` + `import_files`

Definition of Done:
- Einzeldatei-Upload legt Aktivitaet an oder markiert Duplikat.
- Fehlerhafte Datei beendet nur diese Datei, nicht den gesamten Import.
Status: Code umgesetzt, API-Smoketest (single/duplicate/batch/retry/zip) erfolgreich; Realdatei-Test im Ziel-Docker-Stack noch offen.

### Slice C: Batch + UI + Dedupe v2
- [x] `C-01` Endpoint `POST /api/import/batch`
- [x] `C-02` Fingerprint-Dedupe auf Aktivitaetsebene
- [x] `C-03` Import-Seite im Dashboard (Drag&Drop, Multi, Statusliste)
- [x] `C-04` Import-Logs Endpoint + UI (letzte 50 Eintraege)
- [x] `C-05` Links von Import-Ergebnis zur Aktivitaet

Definition of Done:
- Mehrfach-Upload zeigt pro Datei `done|duplicate|failed`.
- UI kann Import-Historie nachvollziehbar darstellen.
Status: Code umgesetzt, API-Smoketest erfolgreich (inkl. Retry und ZIP-Batch); Realdatei-Test im Ziel-Docker-Stack noch offen.

---

## 19) Konkrete Datei-Ziele fuer die naechsten Commits
- `apps/strava/migrations/0004_import_pipeline.sql`
- `apps/strava/src/services/import/` (neu: `types.ts`, `detector.ts`, `hash.ts`, `parsers/*.ts`, `service.ts`)
- `apps/strava/src/api/routes.ts` (Import-Endpunkte)
- `dashboards/strava/src/pages/Import.tsx` (neu)
- `dashboards/strava/src/App.tsx` (Route)
- `dashboards/strava/src/components/Layout.tsx` (Navigation)
- `dashboards/strava/src/lib/api.ts` (Import API client)
- `dashboards/strava/src/locales/de/translation.json`
- `dashboards/strava/src/locales/en/translation.json`

---

## 20) Risiko-Liste (kurz)
- Hoher Einfluss von `strava_activity_id` im Bestandscode -> deswegen synthetische IDs fuer MVP1.
- Parser-Qualitaet haengt stark von realen Testdateien ab (FIT/GPX/TCX Varianten).
- Bulk/Watch-Folder erst nach stabiler Single/Bulk-API einplanen.
