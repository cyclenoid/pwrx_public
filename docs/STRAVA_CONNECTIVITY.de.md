# Strava-API-Konnektivitaet (fortgeschrittene Wege)

Diese Anleitung ist fuer fortgeschrittene Nutzer/Betreiber, die Strava per API anbinden wollen.
Sie ist nicht Teil des offiziellen Public-Standard-Supports.

Wichtiger Standard:
- oeffentlicher Normalbetrieb = Datei-Import (`FIT/GPX/TCX`, einzeln oder ZIP)
- keine API-Zugaenge noetig
- dieses Dokument beschreibt optionale erweiterte Wege
- der offizielle Public-Supportpfad bleibt manueller Datei-Import oder ein Sidecar, das in die Import-Pipeline schreibt
- native Sync-/Backfill-/Club-Funktionen gehoeren nicht zum normalen Public-Endnutzer-Standard

Compliance-Hinweis:
- dieses Dokument ist technische Orientierung, keine Rechtsberatung
- die Verantwortung fuer API-Compliance liegt beim Betreiber

## Welcher Weg passt zu dir?

- du willst schnell und stabil arbeiten: **Weg A**
- du willst Strava automatisiert zufuehren und dabei wenig Koppelung: **Weg B**
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

Empfohlener Standard innerhalb von Weg B:
- nutze `import_api`, wenn Du das einfachste Setup willst
- nutze `watch_folder` nur, wenn Du bewusst ueber einen Watch Folder arbeiten willst

Betriebshinweis:
- dieser Weg verhaelt sich weiterhin wie Public-Core-PWRX
- Aktivitaeten kommen ueber die normale Import-Pipeline herein
- Analytics-Refresh nach dem Import ist Teil des unterstuetzten Public-Verhaltens

Vorteile:
- unabhaengig von internen Adapter-Interfaces
- besser update-faehig bei PWRX-Updates
- volle Kontrolle ueber eigene Strava-App und Tokens

Minimales Zielbild:
1. Eigene Strava-App inkl. OAuth-Credentials anlegen.
2. Eigenen Sidecar-Job (Cron/GitHub Action/Server-Task) betreiben.
3. Daten per Import-API hochladen, oder nur dann in den Watch Folder schreiben, wenn Du diesen Ablauf bewusst willst.
4. PWRX verarbeitet die Daten wie im Standard-Import.

Starter-Implementierung in diesem Repo:
- `scripts/strava-sidecar.mjs`
- Quickstart: `docs/STRAVA_SIDECAR_QUICKSTART.md`

Scope dieser Starter-Loesung:
- Referenz fuer private Betreiber-Setups
- keine Zusicherung, dass dein konkreter Use Case automatisch Strava-konform ist

## Weg C: Native Adapter-Integration (volle Integration, hoher Aufwand)

PWRX kann ein Strava-Adapter-Modul dynamisch laden.

Wichtig:
- das ist ein betreibergetriebener Advanced-Pfad
- in der aktuellen Praxis ist das vor allem fuer ausgewaehlte private Betreiber gedacht, nicht fuer den normalen Public-Nutzerpfad
- wenn Du keine nativen Sync-/Backfill-/Club-Faehigkeiten brauchst, bleib bei Weg A oder Weg B

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

Wichtige Betriebsregeln:
- kein Teilen eines App-/Token-Sets ueber mehrere fremde Betreiber
- jeder Betreiber sollte eigene Strava-App und eigene Credentials verwenden
- neue Strava-Apps laufen ggf. zunaechst im Single-Athlete-Modus bis Review/Freigabe
- bei Multi-Athlete-Betrieb Consent-, Deauth- und Loeschpflichten sauber umsetzen
- bei Unsicherheit vor Rollout direkt mit Strava Developer Support klaeren

Offizielle Strava-Referenzen:
- https://developers.strava.com/docs/getting-started/
- https://developers.strava.com/docs/rate-limits/
- https://www.strava.com/legal/api
- https://developers.strava.com/docs/webhooks/

## Support-Umfang

Offizieller Public-Support:
- dateibasierter Import
- Import-Pipeline

Erweiterte Strava-API-Setups:
- Best-Effort-Hinweise
- Betrieb, App-Registrierung, Token-Handling und Adapter-Wartung liegen beim Betreiber
- kein zugesicherter Turnkey-Public-Multi-User-Strava-Betrieb in diesem Repo
