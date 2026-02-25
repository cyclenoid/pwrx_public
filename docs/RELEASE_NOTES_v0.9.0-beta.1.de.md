# Release Notes - v0.9.0-beta.1 (Public Beta)

## Status

Public Beta / Early Access Release mit Fokus auf Datei-Import-Workflows.

## Highlights

- File-import-first Setup (FIT/GPX/TCX/ZIP) ohne notwendige direkte API-Integration
- Große Strava-Export-ZIP Uploads mit chunked/resumable Upload
- Import-Queue-Sichtbarkeit und Behandlung fehlgeschlagener Jobs in der UI
- Strava-Export-Verbesserungen (Aktivitätsnamen, Gear-Zuordnung, optionaler Medienimport aus Export-ZIP)
- Verbesserte lokale Segment-Erkennung und Benennungslogik
- First-Run-Onboarding-Hinweis und bessere Setup-UX

## Import-Verbesserungen

- Manueller Upload für einzelne und mehrere Aktivitätsdateien
- Verarbeitung kompletter Export-ZIPs mit selektivem Extrahieren relevanter Dateien
- Queue-Fortschrittsanzeige bei großen Importen (verarbeitet / offen / Queue / Fehler / Duplikate)
- Fehlgeschlagene Queue-Jobs können auf der Import-Seite erneut eingereiht oder gelöscht werden
- Bessere Fehlermeldungen bei ZIP-Limits und Gateway-Timeouts

## Self-hosted / Docker Hinweise

- Die Standard-Docker-Installation zeigt in der UI ein Watch-Folder-Kopierziel (`./data/imports/watch`)
- Der Watch-Folder ist optional und für Self-hosted/Admin-Nutzung gedacht
- Ein SMB-/Netzwerkpfad kann über `WATCH_FOLDER_SMB_PATH` in der UI angezeigt werden

## Bekannte Einschraenkungen (Beta)

- Große Uploads können weiterhin durch Server-/Proxy-Limits und Timeouts beeinflusst werden
- Speicherverbrauch wächst mit Importen/Fotos (noch kein Quota-/Retention-Management)
- Einige erweiterte Einstellungen/Wartungstools sind noch technisch und werden weiter vereinfacht

## Upgrade / Neuinstallation

- Nach Updates Datenbank-Migrationen ausführen:

```bash
docker compose exec strava-tracker npm run db:migrate
```

- Bei Neuinstallation: `.env.example` nach `.env` kopieren, DB-/pgAdmin-Credentials setzen, Docker starten und Dateien über die UI importieren

## Feedback-Fokus

- Zuverlässigkeit großer ZIP-Uploads (verschiedene Proxies / Netzwerke)
- Verständlichkeit der Import-UX für Erstnutzer
- Qualität der Segment-Erkennung (insbesondere lange, weniger steile Anstiege)
- Bedienbarkeit von Queue-Wartung / Diagnose
