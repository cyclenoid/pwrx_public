export interface FeatureLogEntry {
  id: string;
  date: string;
  tag?: string;
  images?: Array<{
    src: string;
    alt: {
      de: string;
      en: string;
    };
    caption?: {
      de: string;
      en: string;
    };
  }>;
  title: {
    de: string;
    en: string;
  };
  summary: {
    de: string;
    en: string;
  };
  bullets: {
    de: string[];
    en: string[];
  };
}

export const FEATURE_LOG_ENTRIES: FeatureLogEntry[] = [
  {
    id: "2026-04-22-training-run-hr-pace",
    date: "2026-04-22",
    tag: "training",
    title: {
      de: "Laufleistung gegen Puls wird belastbarer erklaert",
      en: "Run performance against heart rate is clearer and more robust",
    },
    summary: {
      de: "Die Trainingsseite nutzt fuer Pace @150 bpm bei Laeufen jetzt bevorzugt gekoppelte Speed-/Puls-Streams und zeigt direkt, aus welchem Zeitraum und welcher Datenbasis der Wert entsteht.",
      en: "The Training page now prefers paired speed/heart-rate streams for run Pace @150 bpm and shows the selected range plus the data basis behind the value.",
    },
    bullets: {
      de: [
        "Pace @150 bpm fuer Laeufe nutzt nun bevorzugt Abschnitte nahe 150 bpm oder eine Stream-basierte Schaetzung.",
        "Wenn keine passenden Streams vorhanden sind, bleibt die bisherige Durchschnittslogik als Fallback erhalten.",
        "Die Laufleistungskarte erklaert jetzt, dass der Kennwert ein Median im gewaehlten Zeitraum ist, und zeigt Stream-, Regressions- und Fallback-Anteile.",
        "Der Zeitraum ist jetzt direkt in der Laufleistung-vs.-Puls-Karte steuerbar, und Monatswerte brauchen mindestens drei verwertbare Laeufe.",
      ],
      en: [
        "Run Pace @150 bpm now prefers sections near 150 bpm or a stream-based estimate.",
        "When suitable streams are unavailable, the previous average-based logic remains as fallback.",
        "The run performance card now explains that the metric is a median over the selected range and shows stream, regression, and fallback counts.",
        "The selected range can now be changed directly in the run performance card, and monthly points require at least three usable runs.",
      ],
    },
  },
  {
    id: "2026-04-15-training-power-hr-zones",
    date: "2026-04-15",
    tag: "training",
    title: {
      de: "Training zeigt Form und Belastung realistischer",
      en: "Training now shows fitness and load more realistically",
    },
    summary: {
      de: "Radleistung, Herzfrequenz-Zonen und Training Load beziehen aktuelle Daten besser ein, damit Form und Erholung naeher an deiner realen Belastung liegen.",
      en: "Cycling power, heart-rate zones, and training load now use current data more effectively so fitness and freshness stay closer to your real workload.",
    },
    bullets: {
      de: [
        "Leistung @150 bpm nutzt echte Watt-/Puls-Verlaeufe, wenn genug Daten vorhanden sind, und bewertet die aktuelle Form standardmaessig im 6-Monats-Fenster.",
        "Herzfrequenz-Zonen zeigen jetzt ihre verwendete Basis und koennen Laktatschwelle oder HF-Reserve statt nur Maximalpuls nutzen.",
        "Training Load startet mit Gesamtbelastung aus Rad und Lauf; Fahrten ohne Powermeter und Laeufe zaehlen ueber HF-Schaetzung mit, und du kannst Gesamt, Rad oder Laufen getrennt ansehen.",
      ],
      en: [
        "Power @150 bpm uses real power/heart-rate traces when enough data is available and evaluates current form in the 6-month window by default.",
        "Heart-rate zones now show the basis they use and can rely on lactate threshold or heart-rate reserve instead of max heart rate only.",
        "Training Load starts with total workload across cycling and running; rides without power meters and runs count via HR estimates, and you can still inspect total, cycling, or running separately.",
      ],
    },
  },
  {
    id: "2026-04-11-compare-sidebar-ab",
    date: "2026-04-11",
    tag: "ui",
    images: [
      {
        src: "/feature-log/compare-overview-2026-04-11.svg",
        alt: {
          de: "Compare-Seite mit Karte, A-B-Auswahl und kompakten Aktivitätskarten in der Sidebar.",
          en: "Compare page with map, A/B selection, and compact activity cards in the sidebar.",
        },
        caption: {
          de: "Die neue Compare-Seite startet mit klarer A/B-Auswahl und direkter Einordnung in der Sidebar.",
          en: "The new compare page starts with a clearer A/B selector and direct context in the sidebar.",
        },
      },
      {
        src: "/feature-log/compare-charts-2026-04-11.svg",
        alt: {
          de: "Compare-Seite mit Gap-Chart, Marker-Sync auf der Karte und KM-Split-Tabelle.",
          en: "Compare page with gap chart, synced map markers, and km split table.",
        },
        caption: {
          de: "Zeitvergleich, Kartenmarker und KM-Splits greifen jetzt sichtbar ineinander.",
          en: "Time comparison, map markers, and km splits now work together more visibly.",
        },
      },
    ],
    title: {
      de: "Compare verbindet Karte, Splits und A/B-Auswahl klarer",
      en: "Compare now connects map, splits, and A/B selection more clearly",
    },
    summary: {
      de: "Die Compare-Seite fuehrt jetzt kompakter durch den Vergleich: Aktivitaet A und B werden klar gewaehlt, Karte und Zeitvergleich sprechen dieselbe Logik, und die Split-Tabelle bleibt direkt daneben sichtbar.",
      en: "The compare page now guides comparisons more clearly: activity A and B are chosen explicitly, map and time comparison follow the same logic, and the split table stays visible right next to it.",
    },
    bullets: {
      de: [
        "Zwei kompakte Dropdowns waehlen Aktivitaet A und B direkt in der Sidebar, darunter stehen sofort Datum, Pace und Distanz fuer beide Seiten.",
        "Die KM-Split-Tabelle sitzt jetzt direkt unter der Auswahl und hebt beim Hover den passenden Abschnitt auf der Karte sichtbar hervor.",
        "Beim Hover im Zeitvergleich folgen die Kartenmarker jetzt derselben Zeitlogik wie der Chart, sodass Vorsprung und Rueckstand besser lesbar bleiben.",
      ],
      en: [
        "Two compact dropdowns now select activity A and B directly in the sidebar, with date, pace, and distance shown immediately below.",
        "The km split table now sits right below the selectors and visibly highlights the matching route section on the map on hover.",
        "When hovering the time comparison, the map markers now follow the same time logic as the chart so ahead/behind stays easier to read.",
      ],
    },
  },
  {
    id: "2026-04-11-compare-button-logic",
    date: "2026-04-11",
    tag: "ui",
    title: {
      de: "Compare vereinfacht Buttons und synchronisiert beide Kartenpunkte",
      en: "Compare simplifies buttons and syncs both map points",
    },
    summary: {
      de: "Der Einstieg in den Aktivitaetsvergleich wurde optisch entwirrt, und beim Hover im Vorsprung-/Rueckstand-Chart bewegen sich jetzt beide Aktivitaeten direkt auf der Karte mit.",
      en: "The activity comparison entry point has been visually simplified, and hovering the ahead/behind chart now moves both activities directly on the map.",
    },
    bullets: {
      de: [
        "Im Bereich Vergleichbare Aktivitaeten gibt es jetzt nur noch einen klaren Compare-Button statt mehrerer konkurrierender Aktionen.",
        "Outline-Buttons in PWRX nutzen jetzt beim Hover einen orangefarbenen Rand als konsistentere visuelle Regel.",
        "Die Compare-Karte blendet jetzt beide Routen ein und fuehrt beim Hover im Gap-Chart zwei Positionsmarker fuer Basis und Vergleich mit.",
      ],
      en: [
        "The comparable activities area now uses a single clear compare button instead of multiple competing actions.",
        "Outline buttons in PWRX now use an orange hover border as a more consistent visual rule.",
        "The compare map now shows both routes and moves two position markers for base and comparison when hovering the gap chart.",
      ],
    },
  },
  {
    id: "2026-04-10-compare-sidebar-sync",
    date: "2026-04-10",
    tag: "ui",
    title: {
      de: "Compare wird kompakter und koppelt Strecke direkt an den Gap-Chart",
      en: "Compare gets more compact and ties the route directly to the gap chart",
    },
    summary: {
      de: "Die Compare-Seite priorisiert jetzt Karte, Splits und Gap-Verlauf. Der Vergleichsblock sitzt kompakt in der Sidebar, und der Distanz-Chart zeigt beim Hover direkt die Position auf der Karte.",
      en: "The compare page now prioritizes route, splits, and gap progression. The comparison block moves into a compact sidebar, and hovering the distance chart now shows the matching point on the map.",
    },
    bullets: {
      de: [
        "Die Split-Karten wurden kompakter gemacht und zeigen ihre Deltas jetzt als Sekundenwerte statt als grobe Minutenangaben.",
        "Direkt unter Karte und Splits folgt jetzt der Vorsprung-/Rueckstand-Chart mit Hover-Sync zur Kartenposition.",
        "Der bisher grosse Vergleichsblock wurde in die Sidebar verschoben und dort als kompakter Ueberblick zusammengefasst.",
      ],
      en: [
        "The split cards are now more compact and show deltas as seconds instead of coarse minute values.",
        "The ahead/behind chart now sits directly below the route and splits, with hover sync to the route map.",
        "The previously large comparison block has been moved into the sidebar and condensed into a compact overview.",
      ],
    },
  },
  {
    id: "2026-04-10-compare-map-splits",
    date: "2026-04-10",
    tag: "ui",
    title: {
      de: "Compare startet jetzt mit Karte und Split-Hervorhebung",
      en: "Compare now starts with route map and split highlighting",
    },
    summary: {
      de: "Die Compare-Seite nutzt den Platz im oberen Bereich jetzt deutlich besser: Die Strecke steht zuerst im Fokus, und die Kilometer-Splits lassen sich direkt auf der Karte hervorheben.",
      en: "The compare page now uses the top area more efficiently: the route comes first, and kilometer splits can be highlighted directly on the map.",
    },
    bullets: {
      de: [
        "Oben steht jetzt zuerst die Karte der Basisaktivitaet statt eines grossen Vergleichsblocks.",
        "Bei Laufvergleichen sitzen die Kilometer-Splits direkt unter der Karte und heben beim Hover den passenden Streckenabschnitt hervor.",
        "Der textliche Direktvergleich wurde kompakter gemacht und danach in einen kleineren Ueberblicksblock verschoben.",
      ],
      en: [
        "The route map of the base activity now comes first instead of a large comparison block.",
        "For run comparisons, kilometer splits now sit directly below the map and highlight the matching route section on hover.",
        "The textual direct comparison has been condensed and moved into a smaller overview block below.",
      ],
    },
  },
  {
    id: "2026-04-10-distance-compare",
    date: "2026-04-10",
    tag: "analysis",
    title: {
      de: "Aktivitaetsvergleich zeigt jetzt feine Distanz-Charts",
      en: "Activity comparison now shows fine-grained distance charts",
    },
    summary: {
      de: "Vergleiche zweier Aktivitaeten laufen jetzt ueber fein aufgeloeste Distanzpunkte statt nur ueber grobe Kennzahlen. Dadurch zeigt PWRX Vorsprung, Rueckstand und Pace/Geschwindigkeit direkt ueber den Streckenverlauf.",
      en: "Activity comparisons now run on fine-grained distance points instead of only coarse summary metrics. This lets PWRX show ahead/behind and pace/speed directly across the route progression.",
    },
    bullets: {
      de: [
        "Die Compare-Seite hat jetzt einen fein aufgeloesten Vorsprung-/Rueckstand-Chart ueber die gemeinsame Distanz.",
        "Pace bei Laeufen und Geschwindigkeit bei Fahrten werden direkt ueber den Streckenverlauf gegenuebergestellt.",
        "Der bestehende KM-Split-Vergleich fuer Laeufe bleibt erhalten und sitzt jetzt unter dem neuen Distanzvergleich.",
      ],
      en: [
        "The compare page now includes a fine-grained ahead/behind chart across the shared distance.",
        "Run pace and ride speed are now compared directly along the route progression.",
        "The existing km split comparison for runs remains in place below the new distance comparison.",
      ],
    },
  },
  {
    id: "2026-04-10-run-compare-charts",
    date: "2026-04-10",
    tag: "analysis",
    title: {
      de: "Laufvergleiche zeigen jetzt Pace und Zeitverlauf pro Kilometer",
      en: "Run comparisons now show pace and time progression per kilometer",
    },
    summary: {
      de: "Die Compare-Seite spricht jetzt klarer von Vergleich statt Ziel und zeigt fuer Laeufe erstmals echte Charts und KM-Splits statt nur einer Auswahlansicht.",
      en: "The compare page now uses clearer comparison wording instead of target wording and, for runs, shows real charts and km splits instead of only a selection view.",
    },
    bullets: {
      de: [
        "Die Beschriftung auf der Compare-Seite wurde von Ziel-Logik auf direkte Vergleichsbegriffe umgestellt.",
        "Laeufe zeigen jetzt einen Vorsprung-/Rueckstand-Chart ueber den Kilometerverlauf.",
        "Zusaetzlich gibt es einen Pace-Vergleich pro km und eine Split-Tabelle mit Delta und kumuliertem Verlauf.",
      ],
      en: [
        "The compare page wording now uses direct comparison language instead of target language.",
        "Runs now show an ahead/behind chart across the kilometer progression.",
        "It also adds a pace comparison per km and a split table with delta and cumulative progression.",
      ],
    },
  },
  {
    id: "2026-04-10-activity-compare-entrypoints",
    date: "2026-04-10",
    tag: "analysis",
    title: {
      de: "Aktivitaetsvergleich bekommt klarere Einstiege",
      en: "Activity comparison gets clearer entry points",
    },
    summary: {
      de: "Vergleichbare Aktivitaeten sind in den Details jetzt klarer klickbar, und die Compare-Seite fuehrt mit serverseitig vorbereiteter Letzte-/Beste-Auswahl direkt in den Vergleich.",
      en: "Comparable activities are now more clearly clickable in activity details, and the compare page now leads directly into comparison with server-prepared latest/best targets.",
    },
    bullets: {
      de: [
        "Vergleichbare Aktivitaeten sind jetzt ueber die komplette Karte erreichbar und wirken klarer klickbar.",
        "Aktivitaetsdetails bieten direkte Einstiege fuer den Vergleich mit letzter Aktivitaet, bester Aktivitaet oder einer eigenen Compare-Seite.",
        "Die Compare-Seite startet mit vorbereiteten Kandidaten, Letzte-/Beste-Badges und Kennzahlen fuer den ersten Vergleichsschritt.",
      ],
      en: [
        "Comparable activities now open from the full card and feel more clearly clickable.",
        "Activity details offer direct entry points for comparing with the latest activity, the best activity, or a dedicated compare page.",
        "The compare page starts with prepared candidates, latest/best badges, and metrics for the first comparison step.",
      ],
    },
  },
  {
    id: "2026-04-09-footer-support-cta",
    date: "2026-04-09",
    tag: "ui",
    title: {
      de: "Footer zeigt den Support-Link jetzt kompakter",
      en: "Footer now shows the support link more compactly",
    },
    summary: {
      de: "Der Footer nutzt jetzt einen kompakteren Support-Link mit Coffee-Icon statt einer schlichten URL.",
      en: "The footer now uses a more compact support link with a coffee icon instead of a plain URL.",
    },
    bullets: {
      de: [
        "Der Buy-me-a-coffee-Link erscheint als sichtbarer Button mit Coffee-Icon.",
        "Die bisherige nackte URL im Footer wurde durch einen kompakteren CTA ersetzt.",
        "Der Footer bleibt dadurch aufgeraeumter, ohne den Support-Link zu verstecken.",
      ],
      en: [
        "The Buy Me a Coffee link now appears as a visible button with a coffee icon.",
        "The previous bare URL in the footer has been replaced with a more compact CTA.",
        "This keeps the footer cleaner without hiding the support link.",
      ],
    },
  },
  {
    id: "2026-04-08-training-recent-runs",
    date: "2026-04-08",
    tag: "training",
    title: {
      de: "Training und Dashboard zeigen Lauf- und Fitnesssignale klarer",
      en: "Training and dashboard show run and fitness signals more clearly",
    },
    summary: {
      de: "Die Laufansicht zeigt letzte Läufe jetzt kompakter und trainingsnäher. Gleichzeitig macht die CTL-Kachel im Dashboard statt des TSB-Werts direkt sichtbar, wie sich deine Fitness in den letzten 7 Tagen entwickelt hat.",
      en: "The running view now presents recent runs in a more training-focused way. At the same time, the dashboard CTL card now shows how your fitness changed over the last 7 days instead of only showing TSB.",
    },
    bullets: {
      de: [
        "Unter den Lauf-Charts erscheinen die letzten Läufe jetzt als kompakte Trainingskarten statt als reine Tabelle.",
        "Jede Karte verlinkt direkt in die jeweilige Aktivität und hebt Distanz, Höhenmeter, Pace, Dauer, Gelände und Effizienz stärker hervor.",
        "Auf dem Dashboard zeigt die CTL-Kachel jetzt den CTL-Unterschied der letzten 7 Tage statt des bisherigen TSB-Status.",
      ],
      en: [
        "Recent runs below the running charts now appear as compact training cards instead of a plain table.",
        "Each card links directly to the matching activity and gives more visual weight to distance, elevation, pace, duration, terrain, and efficiency.",
        "On the dashboard, the CTL card now shows the 7-day CTL change instead of the previous TSB status line.",
      ],
    },
  },
  {
    id: "2026-04-08-gear-history-visibility",
    date: "2026-04-08",
    tag: "gear",
    title: {
      de: "Gear-Verlauf zeigt Inaktivität und Zeitfenster klarer",
      en: "Gear history shows inactivity and time windows more clearly",
    },
    summary: {
      de: "Die Gear-Detailseite macht jetzt sichtbarer, wann ein Rad wirklich genutzt wurde und wann nicht. Zeitfilter und Achse orientieren sich klarer an der vorhandenen Historie.",
      en: "The gear detail page now makes it clearer when a bike was actually used and when it was not. Time filters and the axis now reflect the available history more clearly.",
    },
    bullets: {
      de: [
        "Inaktive Monate werden bis heute im Verlauf mitgeführt, damit längere Nutzungslücken sofort sichtbar sind.",
        "Die Zeitachse markiert Jahreswechsel klarer statt nur lose Monatskürzel anzuzeigen.",
        "Header und Filter zeigen klarer, welcher echte Aktivitätsbereich und welches Zeitfenster für das gewählte Rad angezeigt werden.",
      ],
      en: [
        "Inactive months are now carried through to today so longer usage gaps become visible immediately.",
        "The time axis highlights year changes more clearly instead of showing only loose month labels.",
        "Header and filters now make the real activity range and selected time window clearer for the chosen bike.",
      ],
    },
  },
  {
    id: "2026-04-07-comparable-activities-and-gear-sidebar",
    date: "2026-04-07",
    tag: "analysis",
    title: {
      de: "Aktivitäten vergleichen und Gear klarer auswerten",
      en: "Compare activities and read gear insights more clearly",
    },
    summary: {
      de: "Aktivitätsdetails zeigen jetzt nur noch echte Streckenvergleiche ab 90% Match. Gear-Details laufen als eigene Seite mit größerem Verlauf und näher platziertem Verschleiß-Tracking.",
      en: "Activity details now show only real route comparisons from a 90% match upward. Gear details now live on their own page with a larger long-term chart and maintenance tracking placed closer to the core stats.",
    },
    bullets: {
      de: [
        "Vergleichbare Aktivitäten werden strenger nach Strecken-Match gefiltert, verlinken direkt zur Aktivität und zeigen Speed-Unterschiede klarer.",
        "Gear bekommt mehr Platz: Details öffnen als eigene Seite, und Räder lassen sich in der Sidebar nach Strecke, Höhenmetern, Tempo und HM pro km vergleichen.",
        "Der Gear-Verlauf nutzt die verfügbare Historie mit inaktiven Monaten, klareren Jahresmarken, festen Zeitfiltern und direktem Verschleiß-Tracking.",
      ],
      en: [
        "Comparable activities are filtered more strictly by route match, link directly to the activity, and make speed differences easier to read.",
        "Gear gets more room: details open as their own page, and the sidebar compares bikes by distance, elevation, speed, and elevation per km.",
        "The gear trend uses the available history with inactive months, clearer year markers, fixed time filters, and direct maintenance tracking.",
      ],
    },
  },
  {
    id: "2026-04-07-activity-detail-sidebar-power-gear",
    date: "2026-04-07",
    tag: "ui",
    title: {
      de: "Aktivitätsdetails: Sidebar klarer und Gear-Hinweis direkter",
      en: "Activity details: clearer sidebar and direct gear hint",
    },
    summary: {
      de: "In den Aktivitätsdetails stehen Trainingsreiz, Power, Segmente und Ausrüstung jetzt in klarer Reihenfolge. Die Power-Kachel lässt sich zwischen Werten, Zonen und Bestwerten der Aktivität umschalten.",
      en: "In activity details, training stimulus, power, segments, and gear now follow a clearer order. The power card can switch between activity values, zones, and best efforts.",
    },
    bullets: {
      de: [
        "Die Sidebar fuehrt klarer durch Trainingsreiz, Power, Segmente und Ausruestung.",
        "Die Power-Kachel buendelt Aktivitaetswerte, Power-Zonen und Bestwerte je Zeitbereich in einer ruhigeren Ansicht.",
        "Wenn bei einer Fahrt noch kein Rad zugeordnet ist, erscheint ein klarer Hinweis mit direkter Korrekturmoeglichkeit.",
      ],
      en: [
        "The sidebar now guides more clearly through training stimulus, power, segments, and gear.",
        "The power card combines activity values, power zones, and best efforts by duration in a calmer view.",
        "If a ride has no bike assigned yet, the sidebar shows a clear hint with a direct correction path.",
      ],
    },
  },
  {
    id: "2026-04-07-dashboard-tips-card",
    date: "2026-04-07",
    tag: "dashboard",
    title: {
      de: "Dashboard: Tipps-Kachel mit kompakter Sidecar-Hilfe",
      en: "Dashboard: tips card with compact sidecar help",
    },
    summary: {
      de: "Die Tipps-Kachel verweist jetzt auf eine interne Sidecar-Hilfe mit klaren Installationsschritten und direkten Befehlen. Die Git-Doku folgt demselben kompakten Aufbau.",
      en: "The tips card now links to an internal sidecar help page with direct setup commands. The Git guide now follows the same compact structure.",
    },
    bullets: {
      de: [
        "Der erste Tipp lautet: „Automatisiere Deinen Datenabruf“.",
        "Die Hilfeseite erklaert klar, dass Sidecar ein externes Hilfstool und kein Schalter in PWRX ist.",
        "Installationsablauf, Health-Check und Startbefehle stehen jetzt konsistent in App-Hilfe und Git-Kurzanleitung.",
      ],
      en: [
        "The first tip reads: “Automate your data retrieval”.",
        "The help page explains clearly that sidecar is an external helper, not a toggle inside PWRX.",
        "Setup flow, health check, and start commands now stay consistent between in-app help and the Git quick guide.",
      ],
    },
  },
  {
    id: "2026-04-06-heatmap-hotspot-labels-restored",
    date: "2026-04-06",
    tag: "heatmap",
    title: {
      de: "Heatmap-Hotspots zeigen wieder Ortsnamen",
      en: "Heatmap hotspots now show location names again",
    },
    summary: {
      de: 'Hotspot-Bereiche werden wieder mit echten Ortsnamen statt nur "Bereich" angezeigt.',
      en: "Hotspot areas now show real place names again instead of only “Area”.",
    },
    bullets: {
      de: [
        "In der Seitenleiste stehen wieder konkrete Orte.",
        "Die Namen erscheinen direkt beim Oeffnen der Heatmap.",
        "Die Darstellung bleibt auch nach Aktualisierung konsistent.",
      ],
      en: [
        "The sidebar now shows concrete place names again.",
        "Names appear immediately when opening the heatmap.",
        "Results stay consistent after refresh.",
      ],
    },
  },
  {
    id: "2026-04-06-dashboard-streak-ctl-icon-alignment",
    date: "2026-04-06",
    tag: "ui",
    title: {
      de: "Dashboard-Kachel: Wochen und CTL visuell vereinheitlicht",
      en: "Dashboard card: unified visual layout for weeks and CTL",
    },
    summary: {
      de: "Wochenserie und CTL stehen jetzt mit gleich großen Zahlen auf gleicher Höhe; Icons ersetzen Emoji.",
      en: "Week streak and CTL now use equally sized values on the same visual level; icons replace emoji.",
    },
    bullets: {
      de: [
        "Beide Teilkacheln folgen jetzt derselben Zeilenstruktur (Icon+Label, Wert, Kurztext).",
        "Flammen- und Fitness-Icon statt Emoji/Textmarker.",
        "TSB-Status bleibt erhalten, ist aber kompakter unter dem CTL-Wert angeordnet.",
      ],
      en: [
        "Both sub-cards now follow the same row structure (icon+label, value, short text).",
        "Flame and fitness icons replace emoji/text markers.",
        "TSB status remains available with a more compact layout below the CTL value.",
      ],
    },
  },
  {
    id: "2026-04-06-training-heatmap-cache-prewarm",
    date: "2026-04-06",
    tag: "training",
    title: {
      de: "Training und Heatmap starten spuerbar schneller",
      en: "Training and heatmap now open noticeably faster",
    },
    summary: {
      de: "Die ersten Aufrufe in Training und Heatmap reagieren jetzt deutlich direkter, auch nach Neustart.",
      en: "First loads in training and heatmap are now much more responsive, including after restart.",
    },
    bullets: {
      de: [
        "Leistung-vs-Puls ist beim Oeffnen schneller verfuegbar.",
        "Die Heatmap samt Standard-Hotspots steht frueher bereit.",
        "Auch nach Datenupdates bleiben die Startzeiten stabil.",
      ],
      en: [
        "Power-vs-heart-rate is available faster on open.",
        "The heatmap including default hotspots is ready sooner.",
        "Startup performance remains consistent after data updates.",
      ],
    },
  },
  {
    id: "2026-04-06-dashboard-ctl-streak-card",
    date: "2026-04-06",
    tag: "dashboard",
    title: {
      de: "Dashboard: CTL Fitness direkt in der Wochenserie-Kachel",
      en: "Dashboard: CTL fitness directly in the weekly streak card",
    },
    summary: {
      de: "Die rechte Sidebar zeigt jetzt in der kompakten Streak-Kachel zusaetzlich CTL und TSB-Einordnung, ohne mehr Platz zu brauchen.",
      en: "The right sidebar now adds CTL and TSB form status inside the compact streak card without increasing layout footprint.",
    },
    bullets: {
      de: [
        "Wochenserie und CTL werden als 2-Spalten-Kachel kombiniert.",
        "TSB wird mit kurzer Form-Einordnung (Frisch, Ausgeglichen, Belastet) dargestellt.",
        "Ohne FTP erscheint ein klarer Hinweis statt leerer Werte.",
      ],
      en: [
        "Weekly streak and CTL are combined in a 2-column compact card.",
        "TSB is shown with a short form classification (Fresh, Balanced, Loaded).",
        "Without FTP, the card shows a clear hint instead of empty values.",
      ],
    },
  },
  {
    id: "2026-04-06-heatmap-header-overlap-fix",
    date: "2026-04-06",
    tag: "ui",
    title: {
      de: "Heatmap-Header: Ueberlagerung von Dashboard, Titel und Sidebar-Button behoben",
      en: "Heatmap header: fixed overlap between dashboard link, title, and sidebar toggle",
    },
    summary: {
      de: "Der Dashboard-Shortcut bleibt links oben, ohne den Titel zu ueberdecken; der Sidebar-Toggle ist klar getrennt.",
      en: "The dashboard shortcut stays top-left without covering the title; sidebar toggle behavior is now separated cleanly.",
    },
    bullets: {
      de: [
        "Floating-Toggle wird nur angezeigt, wenn die Sidebar eingeklappt ist.",
        "Innerhalb der Sidebar gibt es jetzt einen eigenen Schließen-Button im Header.",
        "Header-Spacing angepasst, damit Dashboard-Link und Heatmap-Titel nicht kollidieren.",
      ],
      en: [
        "Floating toggle is shown only when the sidebar is collapsed.",
        "Sidebar now has its own close button in the header.",
        "Header spacing adjusted so dashboard link and heatmap title no longer collide.",
      ],
    },
  },
  {
    id: "2026-04-06-performance-prewarm-and-heatmap-dashboard-link",
    date: "2026-04-06",
    tag: "ui",
    title: {
      de: "Schnellerer Einstieg in Training/Power und klarer Dashboard-Shortcut",
      en: "Faster training/power startup and clearer dashboard shortcut",
    },
    summary: {
      de: "Training und Power reagieren schneller, und der Rueckweg zum Dashboard ist in der Heatmap klarer platziert.",
      en: "Training and power respond faster, and returning to dashboard is clearer in heatmap.",
    },
    bullets: {
      de: [
        "Wichtige Trainingsansichten laden nach App-Start spuerbar flotter.",
        "Nach neuen Daten bleibt die Reaktion in Training/Power stabil.",
        "Dashboard-Link in der Heatmap ist jetzt schneller erreichbar.",
      ],
      en: [
        "Key training views load noticeably faster after app start.",
        "Training/power responsiveness stays stable after new data arrives.",
        "The dashboard link in heatmap is now easier to reach.",
      ],
    },
  },
  {
    id: "2026-04-06-heatmap-home-icon-top-left",
    date: "2026-04-06",
    tag: "ui",
    title: {
      de: "Heatmap: Home-Icon nach links oben verschoben",
      en: "Heatmap: moved home icon to top-left corner",
    },
    summary: {
      de: "Das Home-Symbol sitzt jetzt links oben in der Sidebar und ist damit schneller erreichbar.",
      en: "The home icon is now placed in the top-left corner of the sidebar for quicker access.",
    },
    bullets: {
      de: [
        "Home-Icon aus dem Header-Rechtsbereich entfernt.",
        "Als fester Shortcut links oben in der Sidebar platziert.",
        "Header-Abstand angepasst, damit nichts ueberlappt.",
      ],
      en: [
        "Removed home icon from the right side of the header.",
        "Placed it as a fixed shortcut in the top-left sidebar corner.",
        "Adjusted header spacing to avoid overlap.",
      ],
    },
  },
  {
    id: "2026-04-06-heatmap-payload-optimization",
    date: "2026-04-06",
    tag: "heatmap",
    title: {
      de: "Heatmap reagiert jetzt deutlich fluessiger",
      en: "Heatmap now feels much more responsive",
    },
    summary: {
      de: "Karte und Hotspots bauen sich schneller auf, auch bei vielen Aktivitaeten.",
      en: "Map and hotspots load faster, even with many activities.",
    },
    bullets: {
      de: [
        "Zoom und Verschieben reagieren ruhiger bei grossen Datenmengen.",
        "Neuladen der Heatmap dauert im Alltag kuerzer.",
        "Hotspot-Liste erscheint schneller neben der Karte.",
      ],
      en: [
        "Zoom and pan stay smoother with larger datasets.",
        "Reloading the heatmap takes less time in day-to-day use.",
        "The hotspot list appears faster alongside the map.",
      ],
    },
  },
  {
    id: "2026-04-06-training-load-cache-and-heatmap-refresh",
    date: "2026-04-06",
    tag: "training",
    title: {
      de: "Training-Load stabiler verfuegbar, Heatmap-Refresh verlaesslicher",
      en: "Training load now more stable, heatmap refresh more reliable",
    },
    summary: {
      de: "Trainingswerte sind schneller da, und beim Aktualisieren der Heatmap werden Karte und Hotspots sauber zusammen erneuert.",
      en: "Training values appear faster, and heatmap refresh now updates map and hotspots together.",
    },
    bullets: {
      de: [
        "Weniger Wartezeit beim Oeffnen der Trainingsseite.",
        "Aktualisierte Daten sind nach Sync konsistent sichtbar.",
        "Heatmap-Refresh wirkt sich direkt auf Karte und Hotspot-Liste aus.",
      ],
      en: [
        "Less waiting when opening the training page.",
        "Updated data stays consistent after sync.",
        "Heatmap refresh applies immediately to map and hotspot list.",
      ],
    },
  },
  {
    id: "2026-04-06-strain-classification-and-settings-deeplink",
    date: "2026-04-06",
    tag: "training",
    title: {
      de: "Strain-Einordnung und direkter Settings-Sprung ergänzt",
      en: "Added strain classification and direct settings deep link",
    },
    summary: {
      de: "Der Strain-Wert wird jetzt relativ zur eigenen Basis eingeordnet, und der Link springt direkt zu den relevanten Profilfeldern.",
      en: "Strain is now classified relative to personal baseline, and the link jumps directly to the relevant profile fields.",
    },
    bullets: {
      de: [
        "Strain zeigt jetzt Einordnung (unter Basis, im Rahmen, erhöht, deutlich erhöht).",
        "Zusätzliche Anzeige als Multiplikator gegen die eigene Basis.",
        "Link aus Training führt direkt zu Settings > Body/FTP mit erklärenden Feldhinweisen.",
      ],
      en: [
        "Strain now shows a classification (below baseline, in range, elevated, clearly elevated).",
        "Additional display as multiplier versus personal baseline.",
        "Training link now jumps directly to Settings > Body/FTP with explanatory field hints.",
      ],
    },
  },
  {
    id: "2026-04-06-acwr-monotony-settings-hint",
    date: "2026-04-06",
    tag: "training",
    title: {
      de: "ACWR/Monotony jetzt mit Kurzerklaerung und Settings-Hinweis",
      en: "ACWR/Monotony now include short explanation and settings hint",
    },
    summary: {
      de: "Im Training-Block gibt es jetzt eine direkte Erklaerung der Kennzahlen plus sichtbaren Verweis auf relevante Einstellungen.",
      en: "The training block now includes direct metric explanations plus a visible pointer to relevant settings.",
    },
    bullets: {
      de: [
        "ACWR und Monotony/Strain in der UI kurz verstaendlich erklaert.",
        "Hinweis auf FTP/Koerpergewicht als wichtige Basis fuer die Auswertung.",
        "Direkter Link auf die Settings-Seite aus dem Training-Block.",
      ],
      en: [
        "ACWR and Monotony/Strain are explained directly in the UI.",
        "Hint that FTP/body weight are key inputs for reliable analysis.",
        "Direct link to the settings page from the training block.",
      ],
    },
  },
  {
    id: "2026-04-06-training-hints-compact-layout",
    date: "2026-04-06",
    tag: "training",
    title: {
      de: "Trainingshinweise kompakter und neue Kennzahlen klarer markiert",
      en: "Training hints made more compact and new metrics highlighted",
    },
    summary: {
      de: "Der Trainingsbereich nutzt jetzt ein platzsparenderes Hinweis-Layout, und ACWR sowie Monotony/Strain sind deutlicher als neue Kennzahlen erkennbar.",
      en: "The training section now uses a more space-efficient hint layout, and ACWR plus Monotony/Strain are more clearly marked as new metrics.",
    },
    bullets: {
      de: [
        "Hinweise priorisiert und standardmäßig als kompakte Karten dargestellt.",
        "Option „Alle anzeigen“, um bei Bedarf wieder auf die vollständigen Texte zu gehen.",
        "ACWR und Monotony/Strain mit „NEU“-Kennzeichnung in der Kennzahlenzeile.",
      ],
      en: [
        "Hints are prioritized and shown as compact cards by default.",
        "“Show all” option to expand to full texts when needed.",
        "ACWR and Monotony/Strain now include a “NEW” marker in the metric row.",
      ],
    },
  },
  {
    id: "2026-04-06-manual-sync-start-fix",
    date: "2026-04-06",
    tag: "sync",
    title: {
      de: "Manueller Sync startet zuverlaessiger",
      en: "Manual sync now starts more reliably",
    },
    summary: {
      de: "Der manuelle Sync gibt jetzt klares Feedback und vermeidet verwirrende Fehlmeldungen bei bereits laufenden Jobs.",
      en: "Manual sync now gives clear feedback and avoids confusing errors when a job is already running.",
    },
    bullets: {
      de: [
        "Bei laufendem Sync erscheint ein klarer Hinweis statt Abbruchmeldung.",
        "Der Start aus dem Dashboard funktioniert konsistenter.",
        "Der Sync-Status ist im Alltag besser nachvollziehbar.",
      ],
      en: [
        "When sync is already running, users now get a clear notice instead of a hard error.",
        "Starting sync from the dashboard works more consistently.",
        "Sync status is easier to understand in day-to-day use.",
      ],
    },
  },
  {
    id: "2026-04-06-pmc-acwr-monotony-strain",
    date: "2026-04-06",
    tag: "training",
    title: {
      de: "PMC um ACWR sowie Monotony/Strain erweitert",
      en: "PMC expanded with ACWR and Monotony/Strain",
    },
    summary: {
      de: "Die Training-Load-Karte zeigt jetzt zusätzliche Steuerungskennzahlen, um Belastungssprünge und Wochenstruktur besser einzuordnen.",
      en: "The training-load card now adds steering metrics to better classify load jumps and weekly structure.",
    },
    bullets: {
      de: [
        "Neue ACWR-Kachel (7-Tage-Load vs. 28-Tage-Load) mit Statusbereich.",
        "Neue Monotony/Strain-Kachel mit Wochen-Interpretation.",
        "Erläuterungen im PMC-Block um Formeln und Zielbereiche ergänzt.",
      ],
      en: [
        "New ACWR tile (7-day load vs 28-day load) with status range.",
        "New Monotony/Strain tile with weekly interpretation.",
        "PMC explanation extended with formulas and target ranges.",
      ],
    },
  },
  {
    id: "2026-04-06-cached-power-vs-heart-rate",
    date: "2026-04-06",
    tag: "training",
    title: {
      de: "Leistung-vs-Puls und Fahrerprofil oeffnen schneller",
      en: "Power-vs-heart-rate and rider profile open faster",
    },
    summary: {
      de: "Gerade beim ersten Wechsel auf Training oder Power gibt es deutlich weniger Wartezeit.",
      en: "Especially on first open of training or power, waiting times are much shorter.",
    },
    bullets: {
      de: [
        "Wichtige Auswertungen sind direkt verfuegbar, wenn keine neuen Daten noetig sind.",
        "Aktualisierungen laufen im Hintergrund, ohne den Bildschirm zu blockieren.",
        "Die Seiten reagieren im Alltag konsistenter.",
      ],
      en: [
        "Key analytics are available immediately when no fresh recalculation is needed.",
        "Updates happen in the background without blocking the view.",
        "Day-to-day responsiveness is more consistent.",
      ],
    },
  },
  {
    id: "2026-04-04-rider-profile-cache-and-faster-power-page",
    date: "2026-04-04",
    tag: "power",
    title: {
      de: "Fahrerprofil gecached und Power-Ansicht beschleunigt",
      en: "Rider profile cached and power view made faster",
    },
    summary: {
      de: "Die Fahreranalyse im Power-Bereich wird jetzt serverseitig zwischengespeichert und bei unveränderten Daten direkt aus dem Cache geliefert.",
      en: "The rider analysis on the power page is now cached on the server and returned from cache when source data has not changed.",
    },
    bullets: {
      de: [
        "Fahrerprofil erscheint schneller beim Oeffnen der Power-Seite.",
        "Wiederholte Aufrufe sind deutlich fluessiger.",
        "Die Analyse bleibt im Alltag stabil und gut nutzbar.",
      ],
      en: [
        "Rider profile appears faster when opening the power page.",
        "Repeated visits are noticeably smoother.",
        "The analysis stays stable and practical in daily use.",
      ],
    },
  },
  {
    id: "2026-03-18-dashboard-and-in-app-updates",
    date: "2026-03-18",
    tag: "dashboard",
    title: {
      de: "Dashboard und In-App-Updates ausgebaut",
      en: "Dashboard and in-app updates expanded",
    },
    summary: {
      de: "Dashboard und App zeigen jetzt klarer, was neu ist, und fassen zusätzliche Alltagsmetriken direkt in der Sidebar zusammen.",
      en: "Dashboard and the app now make recent changes more visible and add extra everyday metrics directly in the sidebar.",
    },
    bullets: {
      de: [
        "Neue Kalorien-Kachel mit Summen für 7 Tage, 30 Tage und das laufende Jahr.",
        "Kalorien lassen sich zusätzlich über einfache Alltagsvergleiche wie Pizza, Banane oder Croissant einordnen.",
        "Version und Feature-Log sind jetzt direkt in der App sichtbar und schneller erreichbar.",
      ],
      en: [
        "New calories card with totals for 7 days, 30 days and the current year.",
        "Calories can now also be put into perspective with simple comparisons such as pizza, banana or croissant.",
        "Version and feature log are now visible directly inside the app and easier to reach.",
      ],
    },
  },
  {
    id: "2026-03-17-running-and-cycling-training-insights",
    date: "2026-03-17",
    tag: "training",
    title: {
      de: "Trainingsansicht für Laufen und Radfahren aufgewertet",
      en: "Training view upgraded for running and cycling",
    },
    summary: {
      de: "Die Trainingsseite zeigt jetzt mehr leistungsbezogene Metriken, verbindet Puls und Leistung klarer und ist visuell ruhiger aufgebaut.",
      en: "The training page now shows more performance-focused metrics, connects heart rate and output more clearly and uses a calmer layout.",
    },
    bullets: {
      de: [
        "Laufen bewertet jetzt Pace und Effizienz in Relation zur Herzfrequenz.",
        "Radfahren zeigt Leistung vs. Puls inklusive Cardiac Drift und Durability.",
        "Sidebars, Zonen und Charts wurden kompakter, ruhiger und im Dashboard-Stil vereinheitlicht.",
      ],
      en: [
        "Running now evaluates pace and efficiency in relation to heart rate.",
        "Cycling now shows power vs heart rate including cardiac drift and durability.",
        "Sidebars, zones and charts were made more compact, calmer and aligned with the dashboard style.",
      ],
    },
  },
  {
    id: "2026-03-17-public-core-and-private-strava",
    date: "2026-03-17",
    tag: "platform",
    title: {
      de: "Public-Core sauberer von privatem Strava getrennt",
      en: "Public core separated more cleanly from private Strava",
    },
    summary: {
      de: "Der Standardweg fuer neue Nutzer ist jetzt klarer: Datei-Import als stabile Basis, optionale Strava-Wege getrennt dokumentiert.",
      en: "The default path for new users is now clearer: file import as the stable baseline, optional Strava paths documented separately.",
    },
    bullets: {
      de: [
        "Das Public-Repo ist fuer den normalen Start ohne API-Zugang ausgelegt.",
        "Private Strava-Setups sind weiterhin moeglich, aber getrennt vom Standardpfad.",
        "Die Dokumentation trennt jetzt klar zwischen Standardbetrieb und Spezialsetup.",
      ],
      en: [
        "The public repo is now optimized for normal startup without API access.",
        "Private Strava setups remain possible, but separate from the default path.",
        "Documentation now clearly separates standard operation from advanced setups.",
      ],
    },
  },
  {
    id: "2026-03-17-activity-photo-lightbox",
    date: "2026-03-17",
    tag: "activities",
    title: {
      de: "Aktivitätsfotos jetzt als Lightbox",
      en: "Activity photos now open in a lightbox",
    },
    summary: {
      de: "Fotos aus Aktivitäten lassen sich jetzt direkt als Overlay öffnen und komfortabel durchblättern.",
      en: "Activity photos can now be opened directly in an overlay and browsed more comfortably.",
    },
    bullets: {
      de: [
        "Klick auf ein Foto öffnet ein Overlay im selben Fenster.",
        "Navigation per Pfeilen und Tastatur ist direkt eingebaut.",
        "Die Originaldatei lässt sich weiterhin separat öffnen.",
      ],
      en: [
        "Clicking a photo now opens an overlay in the same window.",
        "Arrow buttons and keyboard navigation are built in.",
        "The original image can still be opened separately.",
      ],
    },
  },
  {
    id: "2026-03-16-segment-ux-and-manual-actions",
    date: "2026-03-16",
    tag: "segments",
    title: {
      de: "Segment-UX in Aktivität und Detailansicht verbessert",
      en: "Segment UX improved in activity and detail views",
    },
    summary: {
      de: "Segmente sind sichtbarer, klarer klickbar und manuelle Segmente können wieder entfernt werden.",
      en: "Segments are now more visible, more clearly clickable, and manual segments can be removed again.",
    },
    bullets: {
      de: [
        "Segmentliste wurde in die Aktivitäts-Sidebar verlegt und als klickbare Karten aufgebaut.",
        "Segmentdetails zeigen jetzt zusätzliche Geschwindigkeitswerte.",
        "Manuelle Segmente können direkt aus der App gelöscht werden.",
      ],
      en: [
        "The segment list moved into the activity sidebar and now uses fully clickable cards.",
        "Segment details now show additional speed-related metrics.",
        "Manual segments can now be deleted directly in the app.",
      ],
    },
  },
  {
    id: "2026-03-16-local-segment-quality",
    date: "2026-03-16",
    tag: "segments",
    title: {
      de: "Lokales Segment-Matching robuster gemacht",
      en: "Local segment matching made more robust",
    },
    summary: {
      de: "Lokale Segmente verhalten sich jetzt treffsicherer und wirken in der Nutzung stabiler.",
      en: "Local segments now behave more accurately and feel more stable in daily use.",
    },
    bullets: {
      de: [
        "Weniger falsche Treffer bei manuell gepflegten Segmenten.",
        "Fehlende Segmentdaten werden gezielt nachgezogen.",
        "Die Alltagsoberflaeche bleibt dadurch uebersichtlicher.",
      ],
      en: [
        "Fewer false matches for manually managed segments.",
        "Missing segment data is filled selectively in the background.",
        "The day-to-day UI stays cleaner as a result.",
      ],
    },
  },
];

export const getFeatureLogLocale = (language?: string) =>
  language?.startsWith("de") ? "de" : "en";

export const getFeatureLogText = <
  T extends Pick<FeatureLogEntry, "title" | "summary" | "bullets"> & Partial<Pick<FeatureLogEntry, "images">>,
>(
  entry: T,
  language?: string,
) => {
  const locale = getFeatureLogLocale(language);
  return {
    title: entry.title[locale],
    summary: entry.summary[locale],
    bullets: entry.bullets[locale],
    images: entry.images?.map((image) => ({
      src: image.src,
      alt: image.alt[locale],
      caption: image.caption?.[locale],
    })),
  };
};

export const FEATURE_LOG_LATEST_ENTRY = FEATURE_LOG_ENTRIES[0];
