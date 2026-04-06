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
    id: '2026-04-06-heatmap-payload-optimization',
    date: '2026-04-06',
    tag: 'heatmap',
    title: {
      de: 'Heatmap-Ladezeit durch kompaktere Daten reduziert',
      en: 'Heatmap load time reduced with more compact payload',
    },
    summary: {
      de: 'Die Heatmap liefert pro Aktivitaet weniger und kompaktere Koordinaten, damit Reloads deutlich schneller reagieren.',
      en: 'Heatmap now returns fewer and more compact coordinates per activity so reloads respond much faster.',
    },
    bullets: {
      de: [
        'Standard-Simplifizierung von 600 auf 220 Punkte pro Aktivitaet reduziert.',
        'Koordinaten werden standardmaessig mit 4 statt 5 Dezimalstellen ausgeliefert.',
        'HTTP Cache-Control fuer Heatmap/Hotspots gesetzt, damit Browser-Revalidierung leichter aus dem Cache bedient wird.',
      ],
      en: [
        'Default simplification lowered from 600 to 220 points per activity.',
        'Coordinates are now delivered with 4 decimals by default (previously 5).',
        'HTTP Cache-Control added for heatmap/hotspots to improve browser revalidation and cache hits.',
      ],
    },
  },
  {
    id: '2026-04-06-training-load-cache-and-heatmap-refresh',
    date: '2026-04-06',
    tag: 'cache',
    title: {
      de: 'Training-Load jetzt serverseitig cache-first, Heatmap-Refresh konsistenter',
      en: 'Training load now server-side cache-first, heatmap refresh made consistent',
    },
    summary: {
      de: 'Die PMC-Daten werden jetzt wie Power/Fahrerprofil cache-first mit taeglicher Hintergrund-Aktualisierung ausgeliefert; beim Heatmap-Refresh werden auch Hotspots sicher neu geladen.',
      en: 'PMC data now uses the same cache-first daily background refresh strategy as power/rider profile; heatmap refresh now also reloads hotspots reliably.',
    },
    bullets: {
      de: [
        'GET /api/training-load liefert standardmaessig Cache-Daten und aktualisiert nach Tageswechsel im Hintergrund.',
        'Datenaenderungen (Sync/Adapter) invalidieren jetzt auch den Training-Load-Cache.',
        'Heatmap-Refresh invalidiert Karte und Hotspot-Sidebar gemeinsam.',
      ],
      en: [
        'GET /api/training-load now serves cached data by default and refreshes in the background after day rollover.',
        'Data changes (sync/adapter) now invalidate training-load cache as well.',
        'Heatmap refresh now invalidates both map data and hotspot sidebar together.',
      ],
    },
  },
  {
    id: '2026-04-06-strain-classification-and-settings-deeplink',
    date: '2026-04-06',
    tag: 'training',
    title: {
      de: 'Strain-Einordnung und direkter Settings-Sprung ergänzt',
      en: 'Added strain classification and direct settings deep link',
    },
    summary: {
      de: 'Der Strain-Wert wird jetzt relativ zur eigenen Basis eingeordnet, und der Link springt direkt zu den relevanten Profilfeldern.',
      en: 'Strain is now classified relative to personal baseline, and the link jumps directly to the relevant profile fields.',
    },
    bullets: {
      de: [
        'Strain zeigt jetzt Einordnung (unter Basis, im Rahmen, erhöht, deutlich erhöht).',
        'Zusätzliche Anzeige als Multiplikator gegen die eigene Basis.',
        'Link aus Training führt direkt zu Settings > Body/FTP mit erklärenden Feldhinweisen.',
      ],
      en: [
        'Strain now shows a classification (below baseline, in range, elevated, clearly elevated).',
        'Additional display as multiplier versus personal baseline.',
        'Training link now jumps directly to Settings > Body/FTP with explanatory field hints.',
      ],
    },
  },
  {
    id: '2026-04-06-acwr-monotony-settings-hint',
    date: '2026-04-06',
    tag: 'training',
    title: {
      de: 'ACWR/Monotony jetzt mit Kurzerklaerung und Settings-Hinweis',
      en: 'ACWR/Monotony now include short explanation and settings hint',
    },
    summary: {
      de: 'Im Training-Block gibt es jetzt eine direkte Erklaerung der Kennzahlen plus sichtbaren Verweis auf relevante Einstellungen.',
      en: 'The training block now includes direct metric explanations plus a visible pointer to relevant settings.',
    },
    bullets: {
      de: [
        'ACWR und Monotony/Strain in der UI kurz verstaendlich erklaert.',
        'Hinweis auf FTP/Koerpergewicht als wichtige Basis fuer die Auswertung.',
        'Direkter Link auf die Settings-Seite aus dem Training-Block.',
      ],
      en: [
        'ACWR and Monotony/Strain are explained directly in the UI.',
        'Hint that FTP/body weight are key inputs for reliable analysis.',
        'Direct link to the settings page from the training block.',
      ],
    },
  },
  {
    id: '2026-04-06-training-hints-compact-layout',
    date: '2026-04-06',
    tag: 'training',
    title: {
      de: 'Trainingshinweise kompakter und neue Kennzahlen klarer markiert',
      en: 'Training hints made more compact and new metrics highlighted',
    },
    summary: {
      de: 'Der Trainingsbereich nutzt jetzt ein platzsparenderes Hinweis-Layout, und ACWR sowie Monotony/Strain sind deutlicher als neue Kennzahlen erkennbar.',
      en: 'The training section now uses a more space-efficient hint layout, and ACWR plus Monotony/Strain are more clearly marked as new metrics.',
    },
    bullets: {
      de: [
        'Hinweise priorisiert und standardmäßig als kompakte Karten dargestellt.',
        'Option „Alle anzeigen“, um bei Bedarf wieder auf die vollständigen Texte zu gehen.',
        'ACWR und Monotony/Strain mit „NEU“-Kennzeichnung in der Kennzahlenzeile.',
      ],
      en: [
        'Hints are prioritized and shown as compact cards by default.',
        '“Show all” option to expand to full texts when needed.',
        'ACWR and Monotony/Strain now include a “NEW” marker in the metric row.',
      ],
    },
  },
  {
    id: '2026-04-06-manual-sync-start-fix',
    date: '2026-04-06',
    tag: 'sync',
    title: {
      de: 'Manueller Sync robuster gestartet',
      en: 'Manual sync start made more robust',
    },
    summary: {
      de: 'Der manuelle Sync ist jetzt kompatibler über unterschiedliche Backend-Stände und zeigt bei laufendem Job den richtigen Status.',
      en: 'Manual sync now works more reliably across backend variants and reports running jobs correctly.',
    },
    bullets: {
      de: [
        'Fallback-Routen für /api/sync wurden im Core ergänzt.',
        'Dashboard behandelt 409 (Sync läuft bereits) jetzt gezielt statt generischem Fehler.',
        'Full-Sync-Call nutzt bei Bedarf automatisch den /sync-Fallback.',
      ],
      en: [
        'Fallback routes for /api/sync were added in the core.',
        'Dashboard now handles 409 (sync already running) explicitly instead of showing a generic error.',
        'Full-sync call now automatically falls back to /sync when needed.',
      ],
    },
  },
  {
    id: '2026-04-06-pmc-acwr-monotony-strain',
    date: '2026-04-06',
    tag: 'training',
    title: {
      de: 'PMC um ACWR sowie Monotony/Strain erweitert',
      en: 'PMC expanded with ACWR and Monotony/Strain',
    },
    summary: {
      de: 'Die Training-Load-Karte zeigt jetzt zusätzliche Steuerungskennzahlen, um Belastungssprünge und Wochenstruktur besser einzuordnen.',
      en: 'The training-load card now adds steering metrics to better classify load jumps and weekly structure.',
    },
    bullets: {
      de: [
        'Neue ACWR-Kachel (7-Tage-Load vs. 28-Tage-Load) mit Statusbereich.',
        'Neue Monotony/Strain-Kachel mit Wochen-Interpretation.',
        'Erläuterungen im PMC-Block um Formeln und Zielbereiche ergänzt.',
      ],
      en: [
        'New ACWR tile (7-day load vs 28-day load) with status range.',
        'New Monotony/Strain tile with weekly interpretation.',
        'PMC explanation extended with formulas and target ranges.',
      ],
    },
  },
  {
    id: '2026-04-06-cached-power-vs-heart-rate',
    date: '2026-04-06',
    tag: 'cache',
    title: {
      de: 'Training und Fahrerprofil jetzt cache-first',
      en: 'Training and rider profile now cache-first',
    },
    summary: {
      de: 'Leistung-vs-Puls und Fahrerprofil werden jetzt standardmäßig aus dem Server-Cache ausgeliefert und einmal täglich im Hintergrund aktualisiert.',
      en: 'Power-vs-heart-rate and rider profile are now served from server cache by default and refreshed once per day in the background.',
    },
    bullets: {
      de: [
        'Bereits vorhandene Ansichten kommen direkt aus dem Cache ohne erneute Blockierung durch Neuberechnung.',
        'Nach Tageswechsel wird beim ersten Aufruf eine Hintergrund-Aktualisierung angestoßen, während weiter Cache-Daten geliefert werden.',
        'Der Cache ist größenbegrenzt und kann über den bestehenden Cache-Clear-Endpunkt geleert werden.',
      ],
      en: [
        'Existing views are returned directly from cache without blocking recomputation.',
        'After day rollover, the first request triggers a background refresh while cached data is still served.',
        'Cache size is bounded and can be cleared via the existing cache-clear endpoint.',
      ],
    },
  },
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
