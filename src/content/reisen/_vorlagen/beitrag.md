---
# Vorlage für einen Bericht bzw. ein Kapitel:
# src/content/reisen/<reise>/[<etappe>/]<datum>-<name>.md
titel: 'Eine Radtour auf Quokka Island'
zusammenfassung: 'Optional, ein bis zwei Sätze.'
datum: 2018-12-04
titelbild: ./bilder/rottnest-01.jpg
titelbildAlt: ''
# Pin auf der Weltkarte. Fehlt die Position, gibt es keinen Pin für diesen Bericht.
position: { name: 'Rottnest Island', lat: -32.0, lng: 115.52 }
# Optional: gefahrene Strecke oder Stationen dieses Berichts
route: []
tags: []
---

Text in Markdown. Bilder liegen neben der Datei und werden relativ eingebunden:

![Quokka auf Rottnest Island](./bilder/rottnest-01.jpg)

Mehrere Bilder zusammen als `raster`, `galerie` oder `slider` (jedes öffnet sich in der Lightbox):

:::galerie
![Quokka im Gras](./bilder/rottnest-02.jpg "Beschriftung")
![Strand auf Rottnest Island](./bilder/rottnest-03.jpg)
:::
