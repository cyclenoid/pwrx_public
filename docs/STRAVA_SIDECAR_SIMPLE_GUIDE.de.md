# Strava-Sidecar Kurzanleitung

## Kurz erklaert

- Sidecar laeuft **ausserhalb von PWRX**.
- Es holt Strava-Aktivitaeten und erzeugt daraus Importdateien fuer PWRX.
- In PWRX selbst musst Du dafuer **nichts aktivieren**.
- Fuer fortgeschrittene Nutzer, die Strava automatisiert zufuehren wollen, ist Sidecar der empfohlene Weg.
- Innerhalb der Sidecar-Optionen ist `import_api` meist der einfachste Standard. `watch_folder` ist die Alternative, wenn Du bewusst ueber einen ueberwachten Ordner arbeiten willst.

## Was Du brauchst

- Eine eigene Strava-App mit:
  - `STRAVA_CLIENT_ID`
  - `STRAVA_CLIENT_SECRET`
  - `STRAVA_REFRESH_TOKEN`
- Einen Rechner, Server oder ein NAS, auf dem das Skript laufen kann
- Eine laufende PWRX-Instanz

Fuer die meisten Nutzer gilt:
- normaler PWRX-Datei-Import bleibt der einfache Basisweg
- Sidecar brauchst Du nur, wenn Du Strava-Aktivitaeten automatisiert holen willst
- nutze `import_api`, solange Du nicht bewusst ueber einen Watch Folder arbeiten willst

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

Fuer die meisten Nutzer ist `import_api` der empfohlene Sidecar-Modus, weil das Setup am einfachsten ist.

```bash
node scripts/strava-sidecar.mjs --mode import_api --api-base http://127.0.0.1:3001/api
```

PowerShell:

```powershell
node .\scripts\strava-sidecar.mjs --mode import_api --api-base http://127.0.0.1:3001/api
```

`watch_folder` brauchst Du nur, wenn der Sidecar bewusst zuerst Dateien in einen ueberwachten Ordner schreiben soll.

Wichtig:
- wenn Sidecar auf demselben Host wie PWRX laeuft, ist `127.0.0.1` in Ordnung
- wenn Sidecar in einem separaten Container laeuft, darfst Du **nicht** `127.0.0.1` verwenden; nimm stattdessen die IP von NAS/Server

## QNAP / Container Station Beispiel

Wenn Du QNAP oder Container Station nutzt, ist der einfachste Weg meistens:
- Deinen normalen `pwrx_public`-Ordner auf dem NAS behalten
- darin eine `.env.sidecar` anlegen
- Sidecar in einem separaten temporaeren Node-Container starten

Wichtig: Sidecar **nicht** im `strava-tracker`-Container starten.

Sicherer Test:

```bash
docker run --rm -it \
  --env-file /share/Container/pwrx_public/.env.sidecar \
  -v /share/Container/pwrx_public:/work \
  -w /work \
  node:20-alpine \
  sh -lc "node scripts/strava-sidecar.mjs --mock --dry-run"
```

Echter Import:

```bash
docker run --rm -it \
  --env-file /share/Container/pwrx_public/.env.sidecar \
  -v /share/Container/pwrx_public:/work \
  -w /work \
  node:20-alpine \
  sh -lc "node scripts/strava-sidecar.mjs --mode import_api --api-base http://DEINE-QNAP-IP:3001/api"
```

Ersetze:
- `/share/Container/pwrx_public` durch Deinen echten PWRX-Ordner auf dem NAS
- `DEINE-QNAP-IP` durch die IP oder den Hostnamen Deines PWRX-Hosts

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

Der einfache Public-Basisweg bleibt der normale Datei-Import. Sidecar ist der empfohlene fortgeschrittene Weg fuer Automatisierung, aber Betrieb und Strava-API-Konfiguration liegen weiterhin beim Betreiber der eigenen Installation.
