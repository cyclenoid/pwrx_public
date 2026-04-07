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
    id: '2026-04-07-dashboard-tips-card',
    date: '2026-04-07',
    tag: 'dashboard',
    title: {
      de: 'Dashboard: Tipps-Kachel mit kompakter Sidecar-Hilfe',
      en: 'Dashboard: tips card with compact sidecar help',
    },
    summary: {
      de: 'Die Tipps-Kachel verweist jetzt auf eine interne Sidecar-Hilfe mit klaren Installationsschritten und direkten Befehlen. Die Git-Doku folgt demselben kompakten Aufbau.',
      en: 'The tips card now links to an internal sidecar help page with direct setup commands. The Git guide now follows the same compact structure.',
    },
    bullets: {
      de: [
        'Der erste Tipp lautet: „Automatisiere Deinen Datenabruf“.',
        'Die neue Hilfeseite erklaert klar, dass Sidecar ein externes Hilfstool und kein Schalter in PWRX ist.',
        'Der Installationsablauf steht direkt in der App mit Health-Check, `.env.sidecar` und Startbefehlen.',
        'Die Git-Kurzanleitung und die interne Hilfe verwenden jetzt dieselbe Reihenfolge und dieselben Kernbefehle.',
      ],
      en: [
        'The first tip reads: “Automate your data retrieval”.',
        'The new help page explains clearly that sidecar is an external helper, not a toggle inside PWRX.',
        'The setup flow now lives directly inside the app with health check, `.env.sidecar`, and start commands.',
        'The Git quick guide and the in-app help now use the same order and core commands.',
      ],
    },
  },
  {
    id: '2026-04-06-heatmap-hotspot-labels-restored',
    date: '2026-04-06',
    tag: 'heatmap',
    title: {
      de: 'Heatmap-Hotspots zeigen wieder Ortsnamen',
      en: 'Heatmap hotspots now show location names again',
    },
    summary: {
      de: 'Hotspot-Bereiche werden wieder mit echten Ortsnamen statt nur "Bereich" angezeigt.',
      en: 'Hotspot areas now show real place names again instead of only “Area”.',
    },
    bullets: {
      de: [
        'In der Seitenleiste stehen wieder konkrete Orte.',
        'Die Namen erscheinen direkt beim Oeffnen der Heatmap.',
        'Die Darstellung bleibt auch nach Aktualisierung konsistent.',
      ],
      en: [
        'The sidebar now shows concrete place names again.',
        'Names appear immediately when opening the heatmap.',
        'Results stay consistent after refresh.',
      ],
    },
  },
  {
    id: '2026-04-06-dashboard-streak-ctl-icon-alignment',
    date: '2026-04-06',
    tag: 'ui',
    title: {
      de: 'Dashboard-Kachel: Wochen und CTL visuell vereinheitlicht',
      en: 'Dashboard card: unified visual layout for weeks and CTL',
    },
    summary: {
      de: 'Wochenserie und CTL stehen jetzt mit gleich großen Zahlen auf gleicher Höhe; Icons ersetzen Emoji.',
      en: 'Week streak and CTL now use equally sized values on the same visual level; icons replace emoji.',
    },
    bullets: {
      de: [
        'Beide Teilkacheln folgen jetzt derselben Zeilenstruktur (Icon+Label, Wert, Kurztext).',
        'Flammen- und Fitness-Icon statt Emoji/Textmarker.',
        'TSB-Status bleibt erhalten, ist aber kompakter unter dem CTL-Wert angeordnet.',
      ],
      en: [
        'Both sub-cards now follow the same row structure (icon+label, value, short text).',
        'Flame and fitness icons replace emoji/text markers.',
        'TSB status remains available with a more compact layout below the CTL value.',
      ],
    },
  },
  {
    id: '2026-04-06-training-heatmap-cache-prewarm',
    date: '2026-04-06',
    tag: 'training',
    title: {
      de: 'Training und Heatmap starten spuerbar schneller',
      en: 'Training and heatmap now open noticeably faster',
    },
    summary: {
      de: 'Die ersten Aufrufe in Training und Heatmap reagieren jetzt deutlich direkter, auch nach Neustart.',
      en: 'First loads in training and heatmap are now much more responsive, including after restart.',
    },
    bullets: {
      de: [
        'Leistung-vs-Puls ist beim Oeffnen schneller verfuegbar.',
        'Die Heatmap samt Standard-Hotspots steht frueher bereit.',
        'Auch nach Datenupdates bleiben die Startzeiten stabil.',
      ],
      en: [
        'Power-vs-heart-rate is available faster on open.',
        'The heatmap including default hotspots is ready sooner.',
        'Startup performance remains consistent after data updates.',
      ],
    },
  },
  {
    id: '2026-04-06-dashboard-ctl-streak-card',
    date: '2026-04-06',
    tag: 'dashboard',
    title: {
      de: 'Dashboard: CTL Fitness direkt in der Wochenserie-Kachel',
      en: 'Dashboard: CTL fitness directly in the weekly streak card',
    },
    summary: {
      de: 'Die rechte Sidebar zeigt jetzt in der kompakten Streak-Kachel zusaetzlich CTL und TSB-Einordnung, ohne mehr Platz zu brauchen.',
      en: 'The right sidebar now adds CTL and TSB form status inside the compact streak card without increasing layout footprint.',
    },
    bullets: {
      de: [
        'Wochenserie und CTL werden als 2-Spalten-Kachel kombiniert.',
        'TSB wird mit kurzer Form-Einordnung (Frisch, Ausgeglichen, Belastet) dargestellt.',
        'Ohne FTP erscheint ein klarer Hinweis statt leerer Werte.',
      ],
      en: [
        'Weekly streak and CTL are combined in a 2-column compact card.',
        'TSB is shown with a short form classification (Fresh, Balanced, Loaded).',
        'Without FTP, the card shows a clear hint instead of empty values.',
      ],
    },
  },
  {
    id: '2026-04-06-heatmap-header-overlap-fix',
    date: '2026-04-06',
    tag: 'ui',
    title: {
      de: 'Heatmap-Header: Ueberlagerung von Dashboard, Titel und Sidebar-Button behoben',
      en: 'Heatmap header: fixed overlap between dashboard link, title, and sidebar toggle',
    },
    summary: {
      de: 'Der Dashboard-Shortcut bleibt links oben, ohne den Titel zu ueberdecken; der Sidebar-Toggle ist klar getrennt.',
      en: 'The dashboard shortcut stays top-left without covering the title; sidebar toggle behavior is now separated cleanly.',
    },
    bullets: {
      de: [
        'Floating-Toggle wird nur angezeigt, wenn die Sidebar eingeklappt ist.',
        'Innerhalb der Sidebar gibt es jetzt einen eigenen Schließen-Button im Header.',
        'Header-Spacing angepasst, damit Dashboard-Link und Heatmap-Titel nicht kollidieren.',
      ],
      en: [
        'Floating toggle is shown only when the sidebar is collapsed.',
        'Sidebar now has its own close button in the header.',
        'Header spacing adjusted so dashboard link and heatmap title no longer collide.',
      ],
    },
  },
  {
    id: '2026-04-06-performance-prewarm-and-heatmap-dashboard-link',
    date: '2026-04-06',
    tag: 'ui',
    title: {
      de: 'Schnellerer Einstieg in Training/Power und klarer Dashboard-Shortcut',
      en: 'Faster training/power startup and clearer dashboard shortcut',
    },
    summary: {
      de: 'Training und Power reagieren schneller, und der Rueckweg zum Dashboard ist in der Heatmap klarer platziert.',
      en: 'Training and power respond faster, and returning to dashboard is clearer in heatmap.',
    },
    bullets: {
      de: [
        'Wichtige Trainingsansichten laden nach App-Start spuerbar flotter.',
        'Nach neuen Daten bleibt die Reaktion in Training/Power stabil.',
        'Dashboard-Link in der Heatmap ist jetzt schneller erreichbar.',
      ],
      en: [
        'Key training views load noticeably faster after app start.',
        'Training/power responsiveness stays stable after new data arrives.',
        'The dashboard link in heatmap is now easier to reach.',
      ],
    },
  },
  {
    id: '2026-04-06-heatmap-home-icon-top-left',
    date: '2026-04-06',
    tag: 'ui',
    title: {
      de: 'Heatmap: Home-Icon nach links oben verschoben',
      en: 'Heatmap: moved home icon to top-left corner',
    },
    summary: {
      de: 'Das Home-Symbol sitzt jetzt links oben in der Sidebar und ist damit schneller erreichbar.',
      en: 'The home icon is now placed in the top-left corner of the sidebar for quicker access.',
    },
    bullets: {
      de: [
        'Home-Icon aus dem Header-Rechtsbereich entfernt.',
        'Als fester Shortcut links oben in der Sidebar platziert.',
        'Header-Abstand angepasst, damit nichts ueberlappt.',
      ],
      en: [
        'Removed home icon from the right side of the header.',
        'Placed it as a fixed shortcut in the top-left sidebar corner.',
        'Adjusted header spacing to avoid overlap.',
      ],
    },
  },
  {
    id: '2026-04-06-heatmap-payload-optimization',
    date: '2026-04-06',
    tag: 'heatmap',
    title: {
      de: 'Heatmap reagiert jetzt deutlich fluessiger',
      en: 'Heatmap now feels much more responsive',
    },
    summary: {
      de: 'Karte und Hotspots bauen sich schneller auf, auch bei vielen Aktivitaeten.',
      en: 'Map and hotspots load faster, even with many activities.',
    },
    bullets: {
      de: [
        'Zoom und Verschieben reagieren ruhiger bei grossen Datenmengen.',
        'Neuladen der Heatmap dauert im Alltag kuerzer.',
        'Hotspot-Liste erscheint schneller neben der Karte.',
      ],
      en: [
        'Zoom and pan stay smoother with larger datasets.',
        'Reloading the heatmap takes less time in day-to-day use.',
        'The hotspot list appears faster alongside the map.',
      ],
    },
  },
  {
    id: '2026-04-06-training-load-cache-and-heatmap-refresh',
    date: '2026-04-06',
    tag: 'training',
    title: {
      de: 'Training-Load stabiler verfuegbar, Heatmap-Refresh verlaesslicher',
      en: 'Training load now more stable, heatmap refresh more reliable',
    },
    summary: {
      de: 'Trainingswerte sind schneller da, und beim Aktualisieren der Heatmap werden Karte und Hotspots sauber zusammen erneuert.',
      en: 'Training values appear faster, and heatmap refresh now updates map and hotspots together.',
    },
    bullets: {
      de: [
        'Weniger Wartezeit beim Oeffnen der Trainingsseite.',
        'Aktualisierte Daten sind nach Sync konsistent sichtbar.',
        'Heatmap-Refresh wirkt sich direkt auf Karte und Hotspot-Liste aus.',
      ],
      en: [
        'Less waiting when opening the training page.',
        'Updated data stays consistent after sync.',
        'Heatmap refresh applies immediately to map and hotspot list.',
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
      de: 'Manueller Sync startet zuverlaessiger',
      en: 'Manual sync now starts more reliably',
    },
    summary: {
      de: 'Der manuelle Sync gibt jetzt klares Feedback und vermeidet verwirrende Fehlmeldungen bei bereits laufenden Jobs.',
      en: 'Manual sync now gives clear feedback and avoids confusing errors when a job is already running.',
    },
    bullets: {
      de: [
        'Bei laufendem Sync erscheint ein klarer Hinweis statt Abbruchmeldung.',
        'Der Start aus dem Dashboard funktioniert konsistenter.',
        'Der Sync-Status ist im Alltag besser nachvollziehbar.',
      ],
      en: [
        'When sync is already running, users now get a clear notice instead of a hard error.',
        'Starting sync from the dashboard works more consistently.',
        'Sync status is easier to understand in day-to-day use.',
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
    tag: 'training',
    title: {
      de: 'Leistung-vs-Puls und Fahrerprofil oeffnen schneller',
      en: 'Power-vs-heart-rate and rider profile open faster',
    },
    summary: {
      de: 'Gerade beim ersten Wechsel auf Training oder Power gibt es deutlich weniger Wartezeit.',
      en: 'Especially on first open of training or power, waiting times are much shorter.',
    },
    bullets: {
      de: [
        'Wichtige Auswertungen sind direkt verfuegbar, wenn keine neuen Daten noetig sind.',
        'Aktualisierungen laufen im Hintergrund, ohne den Bildschirm zu blockieren.',
        'Die Seiten reagieren im Alltag konsistenter.',
      ],
      en: [
        'Key analytics are available immediately when no fresh recalculation is needed.',
        'Updates happen in the background without blocking the view.',
        'Day-to-day responsiveness is more consistent.',
      ],
    },
  },
  {
    id: '2026-04-04-rider-profile-cache-and-faster-power-page',
    date: '2026-04-04',
    tag: 'power',
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
        'Fahrerprofil erscheint schneller beim Oeffnen der Power-Seite.',
        'Wiederholte Aufrufe sind deutlich fluessiger.',
        'Die Analyse bleibt im Alltag stabil und gut nutzbar.',
      ],
      en: [
        'Rider profile appears faster when opening the power page.',
        'Repeated visits are noticeably smoother.',
        'The analysis stays stable and practical in daily use.',
      ],
    },
  },
  {
    id: '2026-03-18-dashboard-and-in-app-updates',
    date: '2026-03-18',
    tag: 'dashboard',
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
    tag: 'platform',
    title: {
      de: 'Public-Core sauberer von privatem Strava getrennt',
      en: 'Public core separated more cleanly from private Strava',
    },
    summary: {
      de: 'Der Standardweg fuer neue Nutzer ist jetzt klarer: Datei-Import als stabile Basis, optionale Strava-Wege getrennt dokumentiert.',
      en: 'The default path for new users is now clearer: file import as the stable baseline, optional Strava paths documented separately.',
    },
    bullets: {
      de: [
        'Das Public-Repo ist fuer den normalen Start ohne API-Zugang ausgelegt.',
        'Private Strava-Setups sind weiterhin moeglich, aber getrennt vom Standardpfad.',
        'Die Dokumentation trennt jetzt klar zwischen Standardbetrieb und Spezialsetup.',
      ],
      en: [
        'The public repo is now optimized for normal startup without API access.',
        'Private Strava setups remain possible, but separate from the default path.',
        'Documentation now clearly separates standard operation from advanced setups.',
      ],
    },
  },
  {
    id: '2026-03-17-activity-photo-lightbox',
    date: '2026-03-17',
    tag: 'activities',
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
    tag: 'segments',
    title: {
      de: 'Lokales Segment-Matching robuster gemacht',
      en: 'Local segment matching made more robust',
    },
    summary: {
      de: 'Lokale Segmente verhalten sich jetzt treffsicherer und wirken in der Nutzung stabiler.',
      en: 'Local segments now behave more accurately and feel more stable in daily use.',
    },
    bullets: {
      de: [
        'Weniger falsche Treffer bei manuell gepflegten Segmenten.',
        'Fehlende Segmentdaten werden gezielt nachgezogen.',
        'Die Alltagsoberflaeche bleibt dadurch uebersichtlicher.',
      ],
      en: [
        'Fewer false matches for manually managed segments.',
        'Missing segment data is filled selectively in the background.',
        'The day-to-day UI stays cleaner as a result.',
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
