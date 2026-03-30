# PWRX Club Stats Export

## Ziel

PWRX berechnet Strava-Club-Kennzahlen lokal und exportiert nur aggregierte Daten nach außen.

Aktuell exportierte Kennzahlen:

- `memberCount`
- `activityCount` der letzten 30 Tage
- `distanceKm` der letzten 30 Tage
- `elevationM` der letzten 30 Tage
- `activeAthletes` der letzten 30 Tage

## Voraussetzungen

- privater Strava-Adapter aktiv
- `capabilities.supportsClubs = true`
- aktives Strava-Profil mit gültigem Refresh Token
- Strava Club ID gesetzt

## PWRX-Seite

Neue Dashboard-Seite:

- `/club`

Funktionen:

- Club-ID konfigurieren
- Export-URL konfigurieren
- Export-Token hinterlegen
- Export aktivieren/deaktivieren
- aktuelle Club-Stats ansehen
- manuellen Export auslösen

## API-Endpunkte

Nur verfügbar, wenn der Strava-Adapter aktiv ist:

- `GET /api/club/config`
- `PUT /api/club/config`
- `GET /api/club/stats?days=30`
- `POST /api/club/export`

## Persistierte User-Settings

Die Club-Konfiguration wird in `strava.user_settings` gespeichert:

- `club_stats_club_id`
- `club_stats_export_enabled`
- `club_stats_export_url`
- `club_stats_export_token`
- `club_stats_last_exported_at`
- `club_stats_last_export_error`

## Loewenhain/Vercel

Empfangsroute:

- `POST /api/club-stats`
- `GET /api/club-stats`

Benötigte Vercel-Umgebungsvariablen:

- `CLUB_STATS_WEBHOOK_TOKEN`
- `BLOB_READ_WRITE_TOKEN`

Der Export aus PWRX sendet per Bearer-Token an die Vercel-Route. Vercel speichert nur das aktuelle aggregierte JSON und die Website liest dieses für die Club-Statistik-Anzeige aus.

## Aktueller Stand

MVP:

- manuelle Konfiguration
- manuelle Export-Aktion
- Website-Count-up-Block

Noch nicht automatisiert:

- Export automatisch nach jedem Sync
- periodischer Push ohne manuelle Aktion
- mehrere Club-Zeiträume parallel
