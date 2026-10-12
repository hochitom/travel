---
# Vorlage für eine Reise: kopieren nach src/content/reisen/<jahr>-<name>/index.md
# Ordner und Dateien mit "_" am Anfang werden von der Seite ignoriert.
titel: 'Lofoten im Herbst'
zusammenfassung: 'Ein Satz, der in Kacheln und Suchergebnissen steht.'
kontinent: europa # europa | asien | afrika | nordamerika | suedamerika | ozeanien | antarktis
laender: ['Norwegen']
von: 2025-09-10
bis: 2025-09-20
titelbild: ./bilder/titel.jpg # relativ zu dieser Datei
titelbildAlt: 'Beschreibung des Bildes für Screenreader'
# Pin auf der Weltkarte (nur nötig, wenn die Reise keine Berichte mit eigener Position hat)
position: { name: 'Svolvær', lat: 68.234, lng: 14.567 }
# Stationen für die Detailkarte, in Reihenfolge der Reise
route:
  - { name: 'Svolvær', lat: 68.234, lng: 14.567, notiz: 'Start' }
  - { name: 'Reine', lat: 67.932, lng: 13.089 }
tags: ['wandern', 'roadtrip']
entwurf: false # true = wird nicht veröffentlicht
---

Einleitung der Reise in Markdown.

Weitere Dateien im selben Ordner (`01-anreise.md`, `02-...md`) werden automatisch zu Kapiteln.
