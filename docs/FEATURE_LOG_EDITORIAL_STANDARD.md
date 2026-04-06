# Feature-Log Redaktionsstandard

Ziel: Das Feature-Log soll fuer normale Anwender sofort verstaendlich sein.
Es beschreibt den Nutzen in der App, nicht die technische Umsetzung.

## Zielgruppe

- Hauptziel: aktive Sportler, die PWRX nutzen.
- Nebenziel: Betreiber, die schnell sehen wollen, was sich fuer Nutzer sichtbar verbessert hat.

## Format pro Eintrag

- `title`: kurzer, sichtbarer Nutzen (kein Interna-Wording).
- `summary`: genau ein Satz, der den praktischen Effekt beschreibt.
- `bullets`: maximal 3 Punkte, jeweils als beobachtbarer Mehrwert.
- `tag`: thematisch (z. B. `training`, `heatmap`, `dashboard`, `power`, `segments`, `sync`, `ui`, `platform`).

## Sprachregeln

- Nutzernahe Sprache: Was ist jetzt schneller, klarer, stabiler, einfacher.
- Keine API/HTTP/DB-Details, sofern nicht fuer Anwender direkt relevant.
- Keine internen Begriffe wie Endpoint-Namen, Cache-Key, Migrationsnamen, Commit-Hashes im Text.
- Keine Release- oder Commit-IDs als `tag`.
- DE und EN muessen inhaltlich deckungsgleich sein.

## Was nicht ins Feature-Log gehoert

- Reine Refactorings ohne sichtbaren Effekt.
- Tooling-Only-Aenderungen (Lint, CI, Build) ohne Produktauswirkung.
- Infrastruktur-Details ohne direkten Nutzerwert.

## Review-Checkliste vor Commit

1. Versteht ein Nicht-Entwickler den Eintrag ohne Zusatzwissen?
2. Ist der Nutzen in den ersten 2 Zeilen klar?
3. Enthalten die Bullets nur sichtbare oder direkt spürbare Effekte?
4. Sind DE/EN konsistent?
5. Ist der Tag fachlich statt technisch?

## Beispiel

Statt:
- "Fallback-Routen fuer /api/sync ergaenzt, 409-Handling angepasst."

Besser:
- "Manueller Sync startet zuverlaessiger und zeigt bei laufendem Job eine klare Rueckmeldung."
