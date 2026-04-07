# Strava-Sidecar Kurzanleitung

## Kurz erklaert

- Sidecar laeuft **ausserhalb von PWRX**.
- Es holt Strava-Aktivitaeten und erzeugt daraus Importdateien fuer PWRX.
- In PWRX selbst musst Du dafuer **nichts aktivieren**.

## Was Du brauchst

- Eine eigene Strava-App mit:
  - `STRAVA_CLIENT_ID`
  - `STRAVA_CLIENT_SECRET`
  - `STRAVA_REFRESH_TOKEN`
- Einen Rechner, Server oder ein NAS, auf dem das Skript laufen kann
- Eine laufende PWRX-Instanz mit API oder Watch Folder

## Schnellstart in 5 Schritten

### 1. PWRX-API pruefen

Lokal:

```text
http://127.0.0.1:3001/api/health
```

Server/NAS Beispiel:

```text
http://DEINE-SERVER-IP:3001/api/health
```

### 2. `.env.sidecar` anlegen

```bash
cp scripts/strava-sidecar.env.example .env.sidecar
```

Windows CMD:

```bat
copy scripts\strava-sidecar.env.example .env.sidecar
```

PowerShell:

```powershell
Copy-Item .\scripts\strava-sidecar.env.example .\.env.sidecar
```

### 3. Zugangsdaten eintragen

In `.env.sidecar` setzen:

- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `STRAVA_REFRESH_TOKEN`

### 4. Sicheren Test starten

```bash
node scripts/strava-sidecar.mjs --mock --dry-run
```

### 5. Echten Import starten

Fuer die meisten Nutzer ist `import_api` der einfachste Weg.

```bash
node scripts/strava-sidecar.mjs --mode import_api --api-base http://127.0.0.1:3001/api
```

PowerShell:

```powershell
node .\scripts\strava-sidecar.mjs --mode import_api --api-base http://127.0.0.1:3001/api
```

`watch_folder` brauchst Du nur, wenn Du bewusst ueber einen ueberwachten Ordner arbeiten willst.

## Menge und Zeitraum steuern

- `--lookback-days`: wie viele Tage rueckwirkend geprueft werden
- `--max-activities`: maximale Anzahl pro Lauf
- `--delay-ms`: Pause zwischen API-Aufrufen

Beispiel:

```bash
node scripts/strava-sidecar.mjs --mode import_api --lookback-days 14 --max-activities 100 --delay-ms 150
```

## So erkennst Du, dass es funktioniert

- Auf der Import-Seite erscheint ein neuer Importlauf oder neue Dateien.
- Die Aktivitaeten tauchen danach im Dashboard und in der Aktivitaetsliste auf.
- Wenn nichts ankommt, pruefe zuerst den Sidecar-Job, `.env.sidecar` und die API-Adresse.

## Hinweis

Sidecar ist ein optionaler Zusatzweg. Betrieb und Strava-API-Konfiguration liegen beim Betreiber der eigenen Installation.
