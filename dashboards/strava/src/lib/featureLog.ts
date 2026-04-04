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
    id: '2026-04-04-rider-profile-cache-and-faster-power-page',
    date: '2026-04-04',
    tag: '141907c',
    title: {
      de: 'Fahrerprofil gecached und Power-Ansicht beschleunigt',
      en: 'Rider profile cached and power view made faster',
    },
    summary: {
      de: 'Die Fahreranalyse im Power-Bereich wird jetzt serverseitig zwischengespeichert und bei unveränderten Daten direkt aus dem Cache geliefert.',
      en: 'The rider analysis on the power page is now cached on the server and returned from cache when source data has not changed.',
    },
    bullets: {
      de: [
        'Rider-Profile-Analyse nutzt einen Fingerprint aus den zugrundeliegenden Daten.',
        'Bei identischem Datenstand entfällt die komplette Neuberechnung.',
        'Die Ansicht reagiert dadurch im Alltag stabiler und spürbar schneller.',
      ],
      en: [
        'Rider profile analysis now uses a fingerprint of the underlying data.',
        'When data is unchanged, the full recomputation step is skipped.',
        'This makes the view more stable and noticeably faster in day-to-day use.',
      ],
    },
  },
  {
    id: '2026-03-18-dashboard-and-in-app-updates',
    date: '2026-03-18',
    tag: '9b675e4',
    title: {
      de: 'Dashboard und In-App-Updates ausgebaut',
      en: 'Dashboard and in-app updates expanded',
    },
    summary: {
      de: 'Dashboard und App zeigen jetzt klarer, was neu ist, und fassen zusätzliche Alltagsmetriken direkt in der Sidebar zusammen.',
      en: 'Dashboard and the app now make recent changes more visible and add extra everyday metrics directly in the sidebar.',
    },
    bullets: {
      de: [
        'Neue Kalorien-Kachel mit Summen für 7 Tage, 30 Tage und das laufende Jahr.',
        'Kalorien lassen sich zusätzlich über einfache Alltagsvergleiche wie Pizza, Banane oder Croissant einordnen.',
        'Version und Feature-Log sind jetzt direkt in der App sichtbar und schneller erreichbar.',
      ],
      en: [
        'New calories card with totals for 7 days, 30 days and the current year.',
        'Calories can now also be put into perspective with simple comparisons such as pizza, banana or croissant.',
        'Version and feature log are now visible directly inside the app and easier to reach.',
      ],
    },
  },
  {
    id: '2026-03-17-running-and-cycling-training-insights',
    date: '2026-03-17',
    tag: 'training',
    title: {
      de: 'Trainingsansicht für Laufen und Radfahren aufgewertet',
      en: 'Training view upgraded for running and cycling',
    },
    summary: {
      de: 'Die Trainingsseite zeigt jetzt mehr leistungsbezogene Metriken, verbindet Puls und Leistung klarer und ist visuell ruhiger aufgebaut.',
      en: 'The training page now shows more performance-focused metrics, connects heart rate and output more clearly and uses a calmer layout.',
    },
    bullets: {
      de: [
        'Laufen bewertet jetzt Pace und Effizienz in Relation zur Herzfrequenz.',
        'Radfahren zeigt Leistung vs. Puls inklusive Cardiac Drift und Durability.',
        'Sidebars, Zonen und Charts wurden kompakter, ruhiger und im Dashboard-Stil vereinheitlicht.',
      ],
      en: [
        'Running now evaluates pace and efficiency in relation to heart rate.',
        'Cycling now shows power vs heart rate including cardiac drift and durability.',
        'Sidebars, zones and charts were made more compact, calmer and aligned with the dashboard style.',
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
