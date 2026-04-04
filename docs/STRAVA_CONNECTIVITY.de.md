# Strava-API-Konnektivitaet (fortgeschrittene Wege)

Diese Anleitung ist fuer fortgeschrittene Nutzer/Betreiber, die Strava per API anbinden wollen.

Wichtiger Standard:
- oeffentlicher Normalbetrieb = Datei-Import (`FIT/GPX/TCX`, einzeln oder ZIP)
- keine API-Zugaenge noetig
- dieses Dokument beschreibt optionale erweiterte Wege

## Welcher Weg passt zu dir?

- du willst schnell und stabil arbeiten: **Weg A**
- du willst API-Automatisierung mit wenig Koppelung: **Weg B**
- du willst tiefe native Integration direkt in PWRX: **Weg C**

## Weg A: Nur Datei-Import (fuer die meisten empfohlen)

Aktivitaeten als Exportdateien importieren.

Vorteile:
- einfachster und stabilster Betrieb
- keine API-Review-/Rate-Limit-Komplexitaet
- klarster Support-Pfad

## Weg B: API-Sidecar (empfohlene Alternative fuer Fortgeschrittene)

Du betreibst einen eigenen Strava-Sync ausserhalb von PWRX und uebergibst die Daten danach an den PWRX-Import.

Uebergabewege:
- Watch Folder (`/imports/watch`, gemountet aus `./data/imports/watch`)
- Import-API (`POST /api/import/file`, `POST /api/import/batch`)

Vorteile:
- unabhaengig von internen Adapter-Interfaces
- besser update-faehig bei PWRX-Updates
- volle Kontrolle ueber eigene Strava-App und Tokens

Minimales Zielbild:
1. Eigene Strava-App inkl. OAuth-Credentials anlegen.
2. Eigenen Sidecar-Job (Cron/GitHub Action/Server-Task) betreiben.
3. Dateien in den Watch Folder legen oder per Import-API hochladen.
4. PWRX verarbeitet die Daten wie im Standard-Import.

Starter-Implementierung in diesem Repo:
- `scripts/strava-sidecar.mjs`
- Quickstart: `docs/STRAVA_SIDECAR_QUICKSTART.md`

## Weg C: Native Adapter-Integration (volle Integration, hoher Aufwand)

PWRX kann ein Strava-Adapter-Modul dynamisch laden.

Noetige Variablen:
- `ADAPTER_STRAVA_ENABLED=true`
- `ADAPTER_STRAVA_PACKAGE=<deine Paketquelle>`
- `ADAPTER_STRAVA_MODULE=<deine Modul-ID>` (falls nicht Default)
- `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REFRESH_TOKEN`

Paketquelle kann sein:
- npm-Paket (public/private)
- `git+https://...` Repo
- `git+ssh://...` Repo (braucht Deploy-Key-Mount)

Erwartete Exporte im Adapter-Modul (mindestens ein Sync-/OAuth-Pfad):
- `createStravaSyncAdapterClient` (oder `createSyncClient`)
- `createStravaUserAdapterClient` (oder `createUserClient`)
- optional Routes: `createStravaRoutes` (oder `createRoutes`)

Faehigkeiten nach Start pruefen:

```bash
curl -s http://127.0.0.1:3001/api/capabilities
```

Pruefen:
- `adapters.strava.enabled = true`
- benoetigte Capabilities (`supportsSync`, `supportsOAuth`, usw.)

## Neu im Compose-Verhalten

Bei `ADAPTER_STRAVA_ENABLED=true` gilt:
- SSH-Deploy-Key ist nur noetig fuer SSH-Quellen (`git+ssh://`, `ssh://`, `git@...`)
- oeffentliche npm- oder `git+https`-Quellen laufen ohne gemounteten Deploy-Key

## Security- und Compliance-Checkliste

- niemals `STRAVA_CLIENT_SECRET` oder Refresh-Token committen
- Secrets nur in lokaler `.env` oder Secret-Manager ablegen
- Tokens bei Vorfall rotieren
- Strava-Richtlinien und Rate-Limits einhalten
- lokale API nicht ohne Auth/Proxy-Haertung ins Internet stellen

Offizielle Strava-Referenzen:
- https://developers.strava.com/docs/getting-started/
- https://developers.strava.com/docs/rate-limits/

## Support-Umfang

Offizieller Public-Support:
- dateibasierter Import
- Import-Pipeline

Erweiterte Strava-API-Setups:
- Best-Effort-Hinweise
- Betrieb, App-Registrierung, Token-Handling und Adapter-Wartung liegen beim Betreiber
