# Next Product Steps

Dieses Dokument sammelt die naechsten Produktideen, damit sie nicht in
kurzen Chat-Notizen verloren gehen. Es ist bewusst ein Planungsdokument,
keine Umsetzungszusage fuer einen bestimmten Release.

## Ziel

PWRX soll als lokales Trainings-Dashboard weiter wachsen, ohne die
Bedienung zu ueberladen. Neue Funktionen sollen:

- bestehende Trainingsdaten besser einordnen
- manuell erfassbare Uebungen ermoeglichen
- Navigation und Informationsarchitektur tragfaehiger machen
- weiterhin zum lokalen, datei-/datenzentrierten Public-Core passen

## Track 1: Aktuelle Form vs. All-Time

Status:
- Vorgeschlagen als naechster Analytics-Schritt.
- Teilweise bereits begonnen durch aktuelle-Jahr-vs-All-Time-Vergleiche.

Problem:
- Records und Power zeigen starke All-Time-Werte.
- Nutzer muessen noch zu viel selbst ableiten, ob die aktuelle Form steigt,
  stagniert oder faellt.

Plan:
- Zeitfenster fuer 30, 90 und 365 Tage einbauen.
- Werte gegen All-Time und gegen vorheriges gleich langes Fenster vergleichen.
- Gleiche Logik fuer Rad-Power und Lauf-Bestzeiten verwenden.

Moegliche UI:
- Umschalter: `All-Time`, `Dieses Jahr`, `90 Tage`, `365 Tage`
- kompakte Deltas auf bestehenden Karten, z. B. `+4% vs. vorherige 90 Tage`
- Standardansicht bleibt All-Time, damit bestehende Nutzer nicht umdenken
  muessen.

Offene Fragen:
- Reicht `Dieses Jahr` als eigener Filter oder soll alles ueber rollierende
  Fenster laufen?
- Soll der Vergleich pro Sportart separat gespeichert werden?

## Track 2: Insights Feed

Status:
- Vorgeschlagen als sichtbarer Produktmehrwert nach den aktuellen
  Cache-/Records-Arbeiten.

Problem:
- Relevante Veraenderungen liegen verteilt ueber Dashboard, Training, Power,
  Records und Aktivitaeten.
- Nutzer muessen mehrere Seiten pruefen, um Trends zu bemerken.

Plan:
- Einen deterministischen Insights Feed aus bestehenden Metriken erzeugen.
- Kein AI-Abhaengigkeit im ersten Schritt.
- Insights aus Cache-Daten ableiten.

Erste Insight-Typen:
- neuer All-Time-Bestwert
- bester Wert der letzten 90 Tage
- Trainingsumfang steigt oder faellt gegen vorheriges Fenster
- Pace/Power bei aehnlicher Herzfrequenz verbessert oder verschlechtert
- auffaellige Konsistenz- oder Belastungsaenderung

Moegliche UI:
- Dashboard-Panel mit 3 bis 5 Insights.
- Jeder Insight verlinkt auf Quelle: Aktivitaet, Records, Power oder Training.
- Sortierung nach Aktualitaet und Relevanz.

Offene Fragen:
- Sollen Insights bestaetigt/ausgeblendet werden koennen?
- Brauchen wir eine gespeicherte Insight-Historie oder reicht Berechnung on
  demand?

## Track 3: Datenqualitaet und Cache-Sichtbarkeit

Status:
- Sinnvoller Begleit-Track fuer belastbarere Analytics.

Problem:
- Viele Werte sind gecached oder aus Streams abgeleitet.
- Nutzer sehen nicht immer, wie frisch oder belastbar ein Wert ist.

Plan:
- Gemeinsame kleine Status-Komponente fuer Cache-/Qualitaetshinweise.
- Anzeigen, wann Daten zuletzt berechnet wurden.
- Anzeigen, ob Ausreisser oder fehlerhafte Kandidaten gefiltert wurden.

Moegliche UI:
- dezente Zeile unter Charts oder Tabellen
- Beispiel: `Cache aktualisiert: heute 08:15`
- Beispiel: `3 GPS-Ausreisser gefiltert`

Offene Fragen:
- Welche Seiten brauchen das zuerst: Records, Power, Training oder Import?
- Wie viel Detail ist hilfreich, ohne technisch zu wirken?

## Track 4: Manuelles Uebungs-Log

Status:
- Neue Produktidee.
- Noch nicht fuer Umsetzung entschieden.

Kurzidee:
- Nutzer koennen regelmaessige Uebungen manuell dokumentieren.
- Eine Uebung kann entweder ueber Wiederholungen oder ueber Dauer gemessen
  werden.
- Beispiele:
  - Liegestuetze: `x Wiederholungen`
  - Wandsitz: `x Sekunden`
  - Plank: `x Sekunden`
  - Kniebeugen: `x Wiederholungen`

Warum das gut zu PWRX passt:
- Es erweitert PWRX von reinen Ausdaueraktivitaeten zu einem vollstaendigeren
  Trainingstagebuch.
- Es bleibt lokal, einfach und datenorientiert.
- Es ergaenzt Laufen/Radfahren sinnvoll, ohne eine komplette Krafttrainings-App
  nachzubauen.

Wichtige Produktentscheidung:
- Diese Uebungen sollten wahrscheinlich nicht als normale GPS-Aktivitaeten
  modelliert werden.
- Sinnvoller ist ein eigener einfacher Datentyp fuer manuelle
  `exercise_entries`.

Moegliches Datenmodell:
- `exercise_types`
  - `id`
  - `name`
  - `default_unit` (`reps`, `seconds`, optional spaeter `kg`, `meters`)
  - `category` (`strength`, `mobility`, `core`, `hold`, `custom`)
  - `created_at`, `updated_at`
- `exercise_entries`
  - `id`
  - `exercise_type_id`
  - `performed_at`
  - `value`
  - `unit`
  - `notes`
  - `activity_id` optional, falls eine Uebung an eine vorhandene Aktivitaet
    gekoppelt werden soll
  - `created_at`, `updated_at`

Erste UI-Idee:
- Seite oder Bereich `Uebungen`
- Uebung auswaehlen oder neue Uebung anlegen
- Einheit waehlen: Wiederholungen oder Sekunden
- Wert erfassen
- optional Notiz
- Verlauf pro Uebung anzeigen
- Filter nach Uebungstyp, Kategorie und Zeitraum

Auswertungen:
- Verlauf pro Uebung
- Bestwert pro Uebung
- Summe pro Woche/Monat
- Streaks fuer regelmaessige Uebungen
- einfache Entwicklung: letzter Wert vs. 30-Tage-Median

Offene Fragen:
- Soll eine Uebung immer eigenstaendig sein oder optional an eine Aktivitaet
  gekoppelt werden?
- Brauchen wir Sets, z. B. `3 x 12`, direkt im MVP oder reicht ein Wert pro
  Eintrag?
- Sollen nur `reps` und `seconds` starten, oder direkt Gewichte ermoeglichen?
- Sollen vordefinierte Uebungen mitgeliefert werden oder startet alles als
  Nutzerdefinition?

Empfohlener MVP:
- eigene Uebungstypen anlegen
- Eintrag mit Datum, Wert, Einheit, Notiz erfassen
- Liste + Verlauf pro Uebung
- Filter nach Uebung und Zeitraum
- keine Gewichte, keine komplexen Sets im ersten Schritt

## Track 5: Navigation und Informationsarchitektur

Status:
- Durch neue Bereiche wird die obere Leiste absehbar zu voll.
- Sollte vor weiteren grossen UI-Erweiterungen geplant werden.

Problem:
- Aktuelle Top-Level-Navigation waechst mit jeder neuen Seite.
- Mit Import, Settings, Training, Power, Records, Segments, Gear, Club und
  kuenftig Uebungen wird die Leiste schwerer scannbar.

Planungsrichtung:
- Top-Level-Navigation reduzieren.
- Fachliche Gruppen bilden.
- Haefig genutzte Ziele schnell erreichbar halten.

Moegliche Struktur:
- `Dashboard`
- `Aktivitaeten`
  - Aktivitaeten
  - Import
  - Compare
- `Analyse`
  - Training
  - Power
  - Records
  - Heatmap
  - Segmente
- `Training`
  - Uebungen
  - Gear
  - Club optional nur bei aktivierter Capability
- `System`
  - Settings
  - Feature-Log
  - Hilfe

Alternative:
- Seitliche Navigation statt voller Top-Bar.
- Top-Bar nur fuer Hauptbereiche, Unterpunkte in der Sidebar.

Offene Fragen:
- Soll die App langfristig eher Dashboard/SaaS-artig mit Sidebar wirken?
- Welche Seiten sind Daily-Use und welche gehoeren eher in Settings/System?
- Soll Import als eigener Hauptpunkt bleiben oder unter Aktivitaeten wandern?

Empfehlung:
- Vor dem Uebungs-Log zuerst ein kleines Navigationskonzept entscheiden.
- Fuer den ersten Schritt reicht eventuell ein gruppiertes Menue, ohne ein
  grosses Layout-Redesign.

## Priorisierte Arbeitsreihenfolge

1. Navigation skizzieren und entscheiden, ob Top-Bar, Dropdown-Gruppen oder
   Sidebar besser passt.
2. Track 1 abschliessen: aktuelle Zeitfenster fuer Records/Power sauber
   definieren.
3. Track 4 MVP fachlich spezifizieren: Uebungstypen, Eintraege, Einheiten,
   Filter.
4. Track 2 als Dashboard-Mehrwert planen: deterministische Insights.
5. Track 3 als Qualitaetslayer einbauen, sobald weitere Analytics-Ausgaben
   entstehen.

## Naechster konkreter Planungsschritt

Eine kurze UI-/Datenmodell-Spezifikation fuer das Uebungs-Log erstellen:

- Seitenstruktur
- Formularfelder
- Tabellen/Endpoints
- minimale Auswertungen
- Navigationsplatzierung

Danach kann entschieden werden, ob zuerst Navigation oder Uebungs-Log gebaut
wird.
