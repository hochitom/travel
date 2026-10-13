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

## Design

Die Seite ist ein Logbuch: Seekartenpapier, Tinte, Meerblau und ein Akzent in Stempelrot. Die Grundsätze stehen in [`design.md`](design.md), alle Farben, Schriften und Abstände als Variablen oben in `src/styles/global.css`. Stempel (Passstempel, rund) sind die Komponente `Stempel.astro`, das Logo `Logo.astro`, Briefmarke mit Poststempel in der Fußzeile `Briefmarke.astro`.

**Vorschaubilder (Open Graph):** Für jede Seite liegt ein Bild unter `public/og/<pfad>.png` (1200 × 630), dazu `standard.png`. Das Layout setzt `og:image` und `twitter:card` (Prop `bild`, Reiseseiten übergeben ihren Pfad). Erzeugt werden sie mit `scripts/og_bilder.py` aus Titel, Zusammenfassung, Route und Land, nicht im Build, die PNGs sind eingecheckt. Nach neuen oder geänderten Berichten neu erzeugen: `pip install pyyaml pillow playwright`, Google-Fonts-Ordner `ofl` mit den drei Schriften bereithalten und `python3 scripts/og_bilder.py --schriften <pfad>/ofl` ausführen (`--nur 2026-lofoten` für einzelne Reisen).

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
