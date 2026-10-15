# hochitom.travel

Reise-Webseite von Thomas Hochörtler. Astro, Vanilla CSS, Markdown als Datenquelle, Karten mit Leaflet und OpenStreetMap. Gehostet bei Netlify unter <https://hochitom.travel>.

## Befehle

```bash
npm install
npm run dev       # lokal auf http://localhost:4321
npm run build     # statische Seite nach dist/
npm run preview   # Build ansehen
npm run import    # Artikel aus dem alten WordPress-Blog holen (siehe unten)
```

Node 22.12 oder neuer (Astro 7 verlangt das, Netlify baut mit Node 22).

## Inhalte schreiben

Alles liegt in `src/content/reisen/`. **Die Ebene ergibt sich aus dem Pfad:**

| Pfad | Ebene |
|---|---|
| `<reise>/index.md` | Reise |
| `<reise>/<etappe>/index.md` | Etappe (z. B. ein Land der Weltreise) |
| `<reise>/[<etappe>/]<name>.md` | Bericht bzw. Kapitel |

- Eine einfache Reise ist ein einziger Ordner mit einer `index.md`.
- Eine große Reise (Lofoten) hat zusätzlich Kapitel-Dateien im selben Ordner, sortiert nach Dateiname oder `reihenfolge`.
- Die Weltreise hat Etappen, jede mit eigenem Kontinent, Land und Zeitraum. Jede Etappe taucht in der Jahres- und Kontinentansicht für sich auf.
- Dateien und Ordner mit `_` am Anfang werden ignoriert. In `_vorlagen/` liegen Vorlagen zum Kopieren.
- `entwurf: true` im Frontmatter versteckt einen Eintrag.

**Pins auf der Weltkarte:** Jeder Bericht mit `position` (lat/lng) bekommt einen Pin. Reisen und Etappen bekommen nur dann einen Pin, wenn kein Bericht darunter einen hat.

**Bilder** liegen neben der Markdown-Datei (`./bilder/...`) und werden von Astro beim Build optimiert.

## Bilder und Galerien

Bilder liegen neben dem Beitrag im Ordner `bilder/`. Ein Bild allein in einer Zeile wird als Einzelbild eingeklebt.
Der Text in Anführungszeichen ist die Beschriftung:

```md
![Alt-Text](./bilder/foto.jpg "Beschriftung")
```

Mehrere Bilder lassen sich zwischen `:::art` und `:::` gruppieren. Leere Zeilen dazwischen sind egal.

```md
:::galerie
![Alt-Text](./bilder/a.jpg "Beschriftung")
![Alt-Text](./bilder/b.jpg)
:::
```

| Art       | Aussehen                                              |
| --------- | ----------------------------------------------------- |
| `raster`  | kleine, gleich große Kacheln (4:3)                    |
| `galerie` | Spalten, die Bilder behalten ihr Seitenformat         |
| `slider`  | große Bilder zum seitlichen Wischen, mit Zähler (1/7) |

Jedes Bild öffnet sich per Klick in einer Lightbox (Pfeile, Esc, Klick daneben). Technik: das HTML-Attribut
`popover`, also kein Framework. Das kleine Skript `src/scripts/lightbox.js` ergänzt Pfeiltasten und sauberes
Blättern, die Lightbox funktioniert aber auch ohne. Falsche Syntax (nicht geschlossen, Text zwischen den Bildern)
bricht den Build mit einer Meldung ab.

In `.astro`-Seiten gibt es dieselben Gruppen als Komponenten `Raster`, `Galerie` und `Slider`:

```astro
---
import Galerie from '../components/Galerie.astro';
import a from '../content/reisen/2026-lofoten/bilder/a-schmiede.jpg';
---
<Galerie bilder={[{ src: a, alt: 'Schmiede', titel: 'Die alte Schmiede' }]} />
```

Das Markup erzeugen `src/lib/bilder-html.mjs` (umhüllt den Berichtstext in `src/components/MitBildern.astro`, unabhängig vom Markdown-Prozessor) und die Komponenten gleich, gestaltet wird es von `src/styles/bilder.css`.

### Interaktive 3D-Modelle

Eine einzelne Zeile `:::modell <name>` (eigener Absatz) setzt ein frei gezeichnetes 3D-Modell in den Beitrag, z. B. ein Gelände mit Weg, Abschnitten und Regler zum Hinaufwandern. Derzeit gibt es keins, im Einsatz sind nur die Berg-Skizzen unten. Es lädt erst nach Klick auf „3D-Modell starten“, vorher wird kein Modell-Code geladen. Alle Modelle teilen sich dieselbe Darstellung im Logbuch-Stil (Papier, Höhenlinien, Stempelrot, Eintragskopf, Hell/Dunkel).

Aufbau:

- `src/scripts/modelle/kern.js`: der gemeinsame Renderer. Die Konfiguration steht im Kopfkommentar (Gelände, Weg, Abschnitte, Marken, Stempel).
- `src/scripts/modelle/<name>.js`: nur die Konfiguration eines Modells (Geländefunktion, Weg, Texte), oder eine async-Funktion, die sie aus den data-Attributen der Figur baut (z. B. `berg.js`).
- `src/scripts/modelle/meta.mjs`: Vorschautext und Bildunterschrift (wird beim Build gelesen).
- `src/scripts/modell.js`: Lader, findet `modelle/<name>.js` automatisch.
- `src/styles/modell.css`: Aussehen.

**Neues Modell:** 1. `src/scripts/modelle/<name>.js` anlegen (Aufbau im Kopfkommentar von `kern.js`; das frühere Stufenweg-Modell des Reinebringen liegt als Vorlage in der Git-Geschichte, Commit `416388b`). 2. Eintrag in `MODELLE` in `meta.mjs`. 3. Im Beitrag `:::modell <name>`.

### Berg-Skizzen aus öffentlichen Daten

Ein einzelner Berg als drehbare 3D-Skizze im selben Stil, ohne eigenes Modell. Das Gelände kommt aus den [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Mapzen/Tilezen, Open Data on AWS, frei, ohne Schlüssel), optional liefert [Wikidata](https://www.wikidata.org/) Name, Gipfelhöhe und Lage. Beides lädt der Browser erst, wenn die Skizze in die Nähe des sichtbaren Bereichs kommt (mit Datensparmodus erst nach Klick auf „3D-Skizze starten“). Bedienung: nur Drehen (Ziehen oder Pfeiltasten).

In Markdown eine eigene Zeile, Teile mit `|` getrennt:

```md
:::berg Festvågtind | 68.1783, 14.2248 | 541 m
:::berg Großglockner | 47.0745, 12.6938 | 3798 m | 6 km
```

Erster Teil ist der Name, danach in beliebiger Reihenfolge: Lage `Breite, Länge` (ungefähr reicht, der höchste Punkt im Umkreis von etwa 350 m wird gesucht), Höhe `541 m` (sonst aus Wikidata, sonst aus dem Gelände), Wikidata-Kennung `Q…`, Ausschnitt `3 km` (Standard), `genau` (Lage exakt übernehmen, ohne Gipfelsuche, z. B. beim Reinebringen, dessen Grat nach Westen weiter ansteigt). Lage oder Wikidata muss sein.

In Astro-Seiten dasselbe als Komponente:

```astro
<Berg name="Festvågtind" lat={68.1783} lon={14.2248} hoehe={541} />
```

Aufbau: `src/components/Berg.astro` und `src/lib/berg-html.mjs` (Markup, Marker), `src/scripts/modelle/berg.js` (baut das Modell aus den Daten), `src/scripts/modelle/hoehendaten.js` (Höhenkacheln und Wikidata laden).

## Design

Die Seite ist ein Logbuch: Seekartenpapier, Tinte, Meerblau und ein Akzent in Stempelrot. Die Grundsätze stehen in [`design.md`](design.md), alle Farben, Schriften und Abstände als Variablen oben in `src/styles/global.css`. Stempel (Passstempel, rund) sind die Komponente `Stempel.astro`, das Logo `Logo.astro`, Briefmarke mit Poststempel in der Fußzeile `Briefmarke.astro`.

**Vorschaubilder (Open Graph):** Für jede Seite entsteht beim Build ein Bild unter `/og/<pfad>.png` (1200 × 630), dazu `/og/standard.png`. Das Layout setzt `og:image` und `twitter:card` (Prop `bild`, Reiseseiten übergeben ihren Pfad). Der Endpoint ist `src/pages/og/[...pfad].png.ts`, das Design steht in `src/lib/og.ts` (Satori und resvg): Titel, Zusammenfassung, Mini-Routenkarte aus `route` bzw. `position`, Passstempel mit Land und Jahr, Wortmarke. Satori kann kein woff2 und keine Variable Fonts, deshalb liegt IM Fell English als TTF in `src/assets/fonts/` (OFL). Neue Berichte bekommen ihr Bild automatisch.

**Schriften:** IM Fell English (Überschriften), Newsreader (Text) und Reenie Beanie (kurze Handschrift), alle unter der SIL Open Font License. Sie kommen über die Fonts-API von Astro (`fonts` in `astro.config.mjs`). Astro lädt die Dateien beim Build herunter und liefert sie von der eigenen Domain aus, Besucher schicken keine Anfrage an Google. Der Build braucht dafür Internetzugang. Eingebunden werden sie mit `<Font>` in `src/layouts/Layout.astro`, benutzt über die Variablen `--font-kopf`, `--font-text` und `--font-hand`. Eine weitere Schrift: Eintrag in `astro.config.mjs` ergänzen, `<Font>` im Layout hinzufügen.

## Seiten

| Route | Inhalt |
|---|---|
| `/` | Weltkarte mit allen Pins, zuletzt unterwegs |
| `/reisen/` | Alle Reisen, umschaltbar nach Jahr oder Kontinent |
| `/reisen/<pfad>/` | Reise, Etappe oder Bericht (mit Karte, Kapitelliste, Blättern) |
| `/jahr/<jahr>/` | Reisen eines Jahres mit Karte |
| `/kontinent/<name>/` | Reisen eines Kontinents mit Karte |

## Weltreise 2018/19 neu aufbauen

Die Inhalte kommen aus dem alten Blog (WordPress), werden aber **neu geschrieben**: Ich-Form, ohne Bezug zur Hochzeitsreise, ohne Namen Dritter.

1. `npm install && npm run import` holt alle Artikel als Rohfassung nach `_raw/` (nicht im Git). Dort liegen `uebersicht.md` (alle Artikel, Etappen, auffällige Wörter), `beitraege/*.md`, `etappen.json` und `medien.json`.
2. Bilder sortieren, siehe `scripts/bilder/sortiere_bilder.py` (Download, GPS-Stichprobe, Gesichtserkennung, Kontaktbogen zum Durchklicken).
3. Die Texte etappenweise umschreiben und nach `src/content/reisen/2018-weltreise/<etappe>/` legen. Neues Frontmatter laut `_vorlagen/`.

### Wichtig: das Repo ist öffentlich

- `_raw/` steht in `.gitignore` und darf nie committet werden. Dort liegen die alten Texte und ungeprüfte Fotos.
- Bilder kommen erst ins Repo, nachdem sie im Kontaktbogen freigegeben wurden. Was einmal in der Git-History liegt, bleibt dort auch nach dem Löschen.
- Positionen auf der Karte nicht genauer als nötig angeben, keine Wohnadressen.

## Deployment

Netlify baut bei jedem Push (`netlify.toml`): `npm run build`, Ordner `dist`. Pull Requests bekommen eine eigene Vorschau-URL. Die Domain `hochitom.travel` wird in Netlify unter *Domain management* verbunden.

Vor dem Livegang: Platzhalter in `src/pages/impressum.astro` und `src/pages/datenschutz.astro` ausfüllen und prüfen.
