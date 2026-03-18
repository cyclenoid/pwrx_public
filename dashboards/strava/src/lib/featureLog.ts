export interface FeatureLogEntry {
  id: string
  date: string
  tag?: string
  title: {
    de: string
    en: string
  }
  summary: {
    de: string
    en: string
  }
  bullets: {
    de: string[]
    en: string[]
  }
}

export const FEATURE_LOG_ENTRIES: FeatureLogEntry[] = [
  {
    id: '2026-03-18-dashboard-calories-and-equivalents',
    date: '2026-03-18',
    tag: '334df95',
    title: {
      de: 'Kalorien-Kachel im Dashboard erweitert',
      en: 'Dashboard calories card expanded',
    },
    summary: {
      de: 'Das Dashboard zeigt den kumulierten Kalorienverbrauch jetzt direkt in der Sidebar, inklusive alltagsnaher Vergleiche.',
      en: 'The dashboard now shows cumulative calories burned directly in the sidebar, including simple everyday equivalents.',
    },
    bullets: {
      de: [
        'Neue Kalorien-Kachel mit Summen für 7 Tage, 30 Tage und das laufende Jahr.',
        'Kalorienwerte nutzen vorhandene Aktivitätsdaten und fallen bei Bedarf auf Kilojoule zurück.',
        'Zusätzliche Vergleichswerte wie Pizza, Banane und Croissant helfen beim Einordnen der Größenordnung.',
      ],
      en: [
        'New calories card with totals for 7 days, 30 days and the current year.',
        'Calorie values use existing activity data and fall back to kilojoules when needed.',
        'Extra comparisons such as pizza, banana and croissant help put the totals into perspective.',
      ],
    },
  },
  {
    id: '2026-03-18-cycling-performance-speed-and-stability',
    date: '2026-03-18',
    tag: '6e30d3c',
    title: {
      de: 'Rad-Leistung vs. Puls schneller und stabiler',
      en: 'Cycling power vs heart rate made faster and more stable',
    },
    summary: {
      de: 'Die neue Rad-Kachel lädt jetzt sichtbarer, bleibt beim Zeitraumwechsel stabil und reagiert dank Cache deutlich schneller.',
      en: 'The new cycling card now loads more visibly, stays stable during range changes and responds much faster thanks to caching.',
    },
    bullets: {
      de: [
        'Ride-Kachel zeigt einen echten Ladezustand statt kurz zu verschwinden.',
        'Bulk-Auswertung für Leistung vs. Puls nutzt jetzt einen Backend-Cache für schnellere Wiederholungen.',
        'Herzfrequenz-Zonen und Ride-Analysen wurden auf plausiblere Datengrundlagen und Ride-Typen abgestimmt.',
      ],
      en: [
        'The ride card now shows a real loading state instead of disappearing briefly.',
        'Bulk power-vs-heart-rate analytics now use backend caching for much faster repeat loads.',
        'Heart-rate zones and ride analytics were aligned to more plausible data inputs and ride-type coverage.',
      ],
    },
  },
  {
    id: '2026-03-17-activity-photo-lightbox',
    date: '2026-03-17',
    tag: '550ba9b',
    title: {
      de: 'Aktivitätsfotos jetzt als Lightbox',
      en: 'Activity photos now open in a lightbox',
    },
    summary: {
      de: 'Fotos aus Aktivitäten lassen sich jetzt direkt als Overlay öffnen und komfortabel durchblättern.',
      en: 'Activity photos can now be opened directly in an overlay and browsed more comfortably.',
    },
    bullets: {
      de: [
        'Klick auf ein Foto öffnet ein Overlay im selben Fenster.',
        'Navigation per Pfeilen und Tastatur ist direkt eingebaut.',
        'Die Originaldatei lässt sich weiterhin separat öffnen.',
      ],
      en: [
        'Clicking a photo now opens an overlay in the same window.',
        'Arrow buttons and keyboard navigation are built in.',
        'The original image can still be opened separately.',
      ],
    },
  },
  {
    id: '2026-03-17-version-and-feature-log',
    date: '2026-03-17',
    tag: '3257a98',
    title: {
      de: 'Version und Feature-Log in der App',
      en: 'Version and feature log inside the app',
    },
    summary: {
      de: 'Dashboard und Tech-Bereich zeigen jetzt direkt, was sich zuletzt geändert hat.',
      en: 'Dashboard and the tech area now show what changed recently without leaving the app.',
    },
    bullets: {
      de: [
        'Neue Feature-Log-Seite mit kuratiertem Änderungsverlauf.',
        'Dashboard-Sidebar zeigt Version, letzte Änderung und direkten Sprung zum Log.',
        'Tech-Bereich verlinkt jetzt auf denselben Verlauf statt nur auf technische Rohdaten.',
      ],
      en: [
        'New feature log page with a curated change history.',
        'Dashboard sidebar now shows version, latest update and a direct jump into the log.',
        'The tech area now links to the same history instead of only showing raw technical stats.',
      ],
    },
  },
  {
    id: '2026-03-17-public-core-and-private-strava',
    date: '2026-03-17',
    tag: 'v0.9.0-beta.2',
    title: {
      de: 'Public-Core sauberer von privatem Strava getrennt',
      en: 'Public core separated more cleanly from private Strava',
    },
    summary: {
      de: 'Der öffentliche PWRX-Stand ist jetzt klarer als File-Import-Core dokumentiert und technisch entkoppelt.',
      en: 'The public PWRX baseline is now documented and structured much more clearly as a file-import core.',
    },
    bullets: {
      de: [
        'Privater Strava-Connector wurde in ein separates privates Adapter-Repo ausgelagert.',
        'Public-Repo nutzt keinen lokalen Strava-Fallback mehr als normalen Pfad.',
        'Unraid läuft weiterhin mit privatem Adapter, aber der öffentliche Support-Pfad bleibt Strava-frei.',
      ],
      en: [
        'The private Strava connector was moved into a separate private adapter repository.',
        'The public repo no longer uses a local Strava fallback as its normal path.',
        'Unraid continues to run with the private adapter while the public support baseline stays Strava-free.',
      ],
    },
  },
  {
    id: '2026-03-17-running-insights-and-training-redesign',
    date: '2026-03-17',
    tag: 'training',
    title: {
      de: 'Laufmetriken und Trainingsansicht überarbeitet',
      en: 'Running metrics and training view redesigned',
    },
    summary: {
      de: 'Laufen bewertet jetzt Leistung und Herzfrequenz gemeinsam, und die Trainingsseite ist klarer priorisiert.',
      en: 'Running now evaluates performance together with heart rate, and the training page is better prioritized.',
    },
    bullets: {
      de: [
        'Neue Kennzahlen wie Pace @150 bpm und Effizienz für Läufe.',
        'Trainingsseite für Laufen und Rad bekam eine Sidebar mit kompakteren Nebenstatistiken.',
        'Charts wurden visuell beruhigt und näher an den Dashboard-Stil gezogen.',
      ],
      en: [
        'New running metrics such as pace @150 bpm and efficiency.',
        'Training pages for running and cycling now use a sidebar for more compact secondary stats.',
        'Charts were softened visually and aligned more closely with the dashboard style.',
      ],
    },
  },
  {
    id: '2026-03-16-segment-ux-and-manual-actions',
    date: '2026-03-16',
    tag: 'segments',
    title: {
      de: 'Segment-UX in Aktivität und Detailansicht verbessert',
      en: 'Segment UX improved in activity and detail views',
    },
    summary: {
      de: 'Segmente sind sichtbarer, klarer klickbar und manuelle Segmente können wieder entfernt werden.',
      en: 'Segments are now more visible, more clearly clickable, and manual segments can be removed again.',
    },
    bullets: {
      de: [
        'Segmentliste wurde in die Aktivitäts-Sidebar verlegt und als klickbare Karten aufgebaut.',
        'Segmentdetails zeigen jetzt zusätzliche Geschwindigkeitswerte.',
        'Manuelle Segmente können direkt aus der App gelöscht werden.',
      ],
      en: [
        'The segment list moved into the activity sidebar and now uses fully clickable cards.',
        'Segment details now show additional speed-related metrics.',
        'Manual segments can now be deleted directly in the app.',
      ],
    },
  },
  {
    id: '2026-03-16-local-segment-quality',
    date: '2026-03-16',
    tag: 'matching',
    title: {
      de: 'Lokales Segment-Matching robuster gemacht',
      en: 'Local segment matching made more robust',
    },
    summary: {
      de: 'Falsche manuelle Segmenttreffer wurden reduziert und die Wartung läuft jetzt gap-basiert.',
      en: 'False manual segment matches were reduced and maintenance now follows a gap-based model.',
    },
    bullets: {
      de: [
        'Matching-Toleranz für manuelle lokale Segmente wurde verschärft.',
        'Fehlende Segmentdaten werden im Hintergrund gezielt nachgezogen statt alles neu aufzubauen.',
        'Der normale Rebuild-Button wurde aus dem Alltags-UI entfernt.',
      ],
      en: [
        'Matching tolerance for manual local segments was tightened.',
        'Missing segment data is now backfilled selectively in the background instead of rebuilding everything.',
        'The normal rebuild button was removed from the day-to-day UI.',
      ],
    },
  },
]

export const getFeatureLogLocale = (language?: string) => (language?.startsWith('de') ? 'de' : 'en')

export const getFeatureLogText = <T extends Pick<FeatureLogEntry, 'title' | 'summary' | 'bullets'>>(
  entry: T,
  language?: string,
) => {
  const locale = getFeatureLogLocale(language)
  return {
    title: entry.title[locale],
    summary: entry.summary[locale],
    bullets: entry.bullets[locale],
  }
}

export const FEATURE_LOG_LATEST_ENTRY = FEATURE_LOG_ENTRIES[0]
