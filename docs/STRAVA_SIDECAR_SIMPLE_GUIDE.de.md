# Strava-Sidecar einfach erklaert (fuer Anwender)

Diese Seite erklaert den Sidecar-Weg ohne tiefe Technik.

## Kurz gesagt

Das Sidecar ist ein kleines Zusatzskript.

Es macht pro Lauf:
1. Aktivitaeten bei Strava abrufen
2. Daraus GPX-Dateien bauen
3. Diese in PWRX importieren

PWRX selbst bleibt dabei im dateibasierten Standardbetrieb.

## Wann ist das sinnvoll?

- Du willst weiterhin den normalen PWRX-Import nutzen
- Du willst Aktivitaeten automatisch aus Strava holen
- Du akzeptierst, dass das ein Advanced-Betreiberweg ist

Wenn du nur starten willst, bleib beim normalen Datei-Import (FIT/GPX/TCX, ZIP).

## Was wird importiert?

Aktuell holt das Sidecar:
- Aktivitaetsliste (innerhalb eines Zeitfensters)
- Streams je Aktivitaet (Zeit, GPS, Hoehe, Puls, Kadenz, Temperatur, Watt)
- daraus GPX fuer den PWRX-Import

Aktuell nicht Teil dieses Scripts:
- Foto-Download
- Strava-native Segment-Effort-Synchronisierung

Hinweis: PWRX kann bei Datei-Importen lokale Segmente auf Basis der GPS-Daten erzeugen.

## Einrichtung in 5 Schritten

1. PWRX starten und API pruefen:

```text
http://127.0.0.1:3001/api/health
```

Wenn PWRX auf einem Server laeuft, nutze die Server-Adresse statt `127.0.0.1`, z. B.:

```text
http://10.10.10.129:3001/api/health
```

2. Sidecar-Umgebung anlegen:

```bash
cp scripts/strava-sidecar.env.example .env.sidecar
```

Windows (CMD):

```bat
copy scripts\strava-sidecar.env.example .env.sidecar
```

Windows (PowerShell):

```powershell
Copy-Item .\scripts\strava-sidecar.env.example .\.env.sidecar
```

3. In `.env.sidecar` setzen:
- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `STRAVA_REFRESH_TOKEN`

4. Erst Test ohne echte Daten:

```bash
node scripts/strava-sidecar.mjs --mock --dry-run
```

5. Echter Lauf mit Import in lokale API:

```bash
node scripts/strava-sidecar.mjs --mode import_api --api-base http://127.0.0.1:3001/api
```

Windows (PowerShell):

```powershell
node .\scripts\strava-sidecar.mjs --mode import_api --api-base http://127.0.0.1:3001/api
```

## Menge und Zeitraum steuern

Wichtige Parameter:
- `--lookback-days` (z. B. 7, 14, 30)
- `--max-activities` (maximale Anzahl pro Lauf)
- `--delay-ms` (Pause zwischen API-Aufrufen)

Beispiel:

```bash
node scripts/strava-sidecar.mjs --mode import_api --lookback-days 14 --max-activities 100 --delay-ms 150
```

## Zwei Betriebsmodi

- `watch_folder`: schreibt GPX-Dateien in einen Ordner, den PWRX beobachten kann
- `import_api`: schreibt GPX und sendet sie direkt an die PWRX-Import-API

Fuer die meisten ist `import_api` einfacher.

## Lokal oder Server: macht das einen Unterschied?

Ja, aber nur organisatorisch:

- Die Sidecar-Logik ist identisch.
- Entscheidend ist, wo das Skript laeuft und welche API-Adresse du nutzt.
- Lokal: meist `http://127.0.0.1:3001/api`.
- Server/NAS/Unraid: Host-IP oder DNS des Servers, z. B. `http://10.10.10.129:3001/api`.
- Bei `watch_folder` muss der Zielordner fuer PWRX erreichbar sein (gleicher Host oder gemounteter Pfad).

## Wichtig zu API-Richtlinien

- Das Sidecar-Skript ist ein oeffentliches Technik-Beispiel.
- Es ist kein offizieller Public-Standard-Supportweg.
- Betrieb und Compliance liegen beim Betreiber (eigene App, eigene Credentials, Limits/Review).

Siehe auch:
- `docs/STRAVA_CONNECTIVITY.de.md`
- `docs/STRAVA_SIDECAR_QUICKSTART.md`
