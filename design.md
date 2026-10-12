# Design-Grundsätze – hochitom.travel

> Dieses Dokument legt fest, wie hochitom.travel aussieht und sich anfühlt.
> Es ist die Referenz für jede Gestaltungsentscheidung. Was hier nicht steht, wird nach den Leitgedanken entschieden.

Status: Entwurf, Richtung „altes Logbuch“ – zum gemeinsamen Schärfen.

---

## 1. Leitgedanken

1. **Die Seite ist ein Logbuch.** Wie das Bordbuch eines Schiffs: Einträge mit Datum und Ort, Randnotizen, eingeklebte Fotos, Stempel, Kartenskizzen. Jede Reise ist ein Eintrag, den man aufschlägt.
2. **Verspielt außen, ruhig beim Lesen.** Die Verspieltheit sitzt in Rahmen, Rändern, Stempeln und Karten. Der Fließtext bleibt ruhig und gut lesbar.
3. **Die Karte ist die Seekarte.** Der Einstieg ist eine Weltkarte mit Routen und Stecknadeln. Dort steckt das Spiel, dort darf es auffallen.
4. **Echt statt künstlich alt.** Kein Vintage-Filter über alles. Papier, Tinte und Stempel wirken, weil sie sparsam und stimmig eingesetzt sind.
5. **Schlicht und schnell.** Die Wirkung kommt aus CSS, Farben und Schrift, nicht aus schweren Bildern oder Skripten. Die Seite funktioniert auch bei schlechtem Netz unterwegs.

---

## 2. Charakter und Tonalität

- Persönlich, neugierig, ein bisschen schelmisch. Hochis Reisetagebuch, kein Reiseportal.
- Texte in Ich-Form, neutral und erzählend. Randnotizen dürfen augenzwinkernd sein („Hier hat es drei Tage geregnet.“).
- Die Logbuch-Idee zeigt sich in der Sprache: „Eintrag“, „Kurs“, „Station“, „Logbuch“. Aber nur dort, wo es sich natürlich anfühlt, und immer verständlich.
- Keine Pop-ups, kein Auto-Play, kein Tracking von Drittanbietern.

**Das eine Highlight:** die Seekarte auf der Startseite mit Route, Stecknadeln und Stempeln. Alles andere bleibt dagegen leiser.

---

## 3. Farben

Eigene Welt statt Standard-Palette: Seekartenpapier, Tinte, Meer, Stempelrot. Alles als CSS-Variablen, Richtwerte zum Verfeinern.

| Variable | Name | Richtwert | Verwendung |
|---|---|---|---|
| `--color-paper` | Seekartenpapier | `#E3E2D0` | Seitenhintergrund, leicht grünstichig statt Creme |
| `--color-paper-light` | Lesepapier | `#F1F0E3` | Textflächen, Eintragsseiten |
| `--color-ink` | Tinte | `#1E2A38` | Fließtext, blauschwarz statt Schwarz |
| `--color-sea` | Meerblau | `#2F5D6B` | Karte, Wasser, Links, Linien |
| `--color-stamp` | Stempelrot | `#A32638` | **Akzent:** Stecknadeln, Stempel, wichtige Marker |
| `--color-line` | Bleistiftlinie | `#B9B8A2` | Trenner, Rahmen, Rasterlinien |

Regeln:

- **Eine Akzentfarbe:** Stempelrot. Meerblau ist eine Sachfarbe für Karte und Links, kein zweiter Akzent.
- Kontrast für Fließtext mindestens **WCAG AA** (4,5:1). Tinte auf Lesepapier erfüllt das deutlich.
- Dunkelmodus („Nachtwache“): Papier wird tiefes Blau-Grau, Tinte wird helles Papier. Nur über Variablen, über `prefers-color-scheme`.

---

## 4. Typografie

Die Schrift trägt die Stimmung. Maximal **drei Familien**, jede mit klarer Aufgabe, alle selbst gehostet (`woff2`, `font-display: swap`).

| Rolle | Vorschlag | Einsatz |
|---|---|---|
| Überschriften | **IM Fell English** (Schrift nach alten Drucken, OFL) | Reisetitel, Kapitel, große Zahlen |
| Fließtext | **Newsreader** (gut lesbare Serife) | Berichte, Beschreibungen |
| Handschrift | **Reenie Beanie** oder ähnlich | **nur** kurze Randnotizen, Bildunterschriften, Ortsnamen auf der Karte |

Regeln:

- Handschrift nie für Absätze. Maximal zwei Zeilen am Stück, dann wird sie anstrengend.
- Fließtext 17–19 px (`1.0625–1.125rem`), Zeilenhöhe ca. 1,65 (Serife braucht etwas mehr Luft).
- Zeilenlänge **60–70 Zeichen** (`max-width: 65ch`).
- Größen fließend mit `clamp()`.
- Genau ein `h1` pro Seite. Überschriften dürfen Charakter zeigen (Größe, Gewicht, Laufweite), aber der Text bleibt gerade.
- Keine Großbuchstaben-Etiketten über jeder Überschrift. Beschriftungen nur, wenn sie Information tragen.
- Sprachen und Sonderzeichen: Schriften müssen Umlaute und Satzzeichen sauber abdecken, vor der Auswahl testen.

---

## 5. Logbuch-Elemente

Der Werkzeugkasten für das Verspielte. Jedes Element erzählt etwas und ist keine Dekoration:

- **Stempel:** Pro Land oder Station ein Stempel (Datum, Ort). Auf Reiseseiten und in der Übersicht. Leicht gedreht, Stempelrot, leicht unregelmäßig.
- **Eingeklebte Fotos:** Fotos mit Papierrand oder Fotoecken, leicht schräg (max. ±2°). Die Fotos selbst bleiben scharf und unverfälscht.
- **Randnotizen:** Kurze Kommentare in Handschrift neben dem Text, am Handy darunter.
- **Eintragskopf:** Datum, Ort, Wetter oder Entfernung in einer klaren, ruhigen Zeile, ähnlich dem Kopf einer Logbuch-Seite.
- **Kompassrose:** Dezent als Zeichen für Orientierung, z. B. auf der Karte und beim Seitenende. Nicht überall.
- **Lesebändchen und Seitenkanten:** Optional als feine Details bei langen Berichten.
- **Tintenflecken, Knicke, Kaffeeränder:** Höchstens ein bis zwei, am Seitenrand, nie hinter Text.

Regeln:

- Verspieltes sitzt **neben** dem Text, nicht dahinter. Hinter dem Fließtext liegt ruhiges Papier.
- Schrägstellung nur bei Bildern, Stempeln und Zetteln. Text steht immer gerade.
- Eine Nummerierung gibt es nur, wo wirklich eine Reihenfolge besteht (Stationen einer Route, Tage einer Reise).

---

## 6. Layout und Abstände

- **Mobile first.** Zuerst fürs Handy gestalten, dann erweitern.
- Breakpoints sparsam: zwei bis drei.
- Abstandsskala auf 8-px-Basis: `--space-1` bis `--space-8`.
- Lesespalte schmal (`65ch`), Fotos, Karten und Stempel dürfen aus der Spalte ausbrechen, wie eingeklebt.
- Am Desktop darf der Rand der Seite Platz für Randnotizen und Fotos bieten, am Handy rutscht alles in einen Fluss.
- Layout mit **CSS Grid** und **Flexbox**. Einheitliche Rundungen gibt es nicht: Karten, Stempel, Fotos dürfen unterschiedlich aussehen, weil sie Unterschiedliches sind.

---

## 7. Bilder und Fotos

- Fotos sind groß und gut platziert, nie vom Effekt überdeckt.
- Immer `width`/`height` bzw. `aspect-ratio` (kein Springen beim Laden).
- Responsive Bilder (`srcset`/`sizes`), AVIF/WebP, `loading="lazy"` unterhalb des sichtbaren Bereichs.
- **EXIF-/GPS-Daten der Originale bleiben erhalten**, weil sie für die Karte gebraucht werden.
- Jedes Bild bekommt einen sinnvollen `alt`-Text.
- Papierrand, Fotoecken und Schatten kommen aus CSS, nicht aus eingebrannten Bilddateien.

---

## 8. Die Seekarte

Das Herzstück und die eine große Bühne für Verspieltheit:

- **Startseite:** Weltkarte im Look einer Seekarte: Papierton, feine Linien, Kompassrose, handgeschriebene Ortsnamen.
- **Stecknadeln** pro Reise in Stempelrot, gut treffbar (mind. 44 × 44 px). Klick führt zum Eintrag.
- **Routen** als gestrichelte Linie. Bei der Weltreise 2018/19 verbindet sie alle Stationen.
- **Vorschau** beim Antippen oder Überfahren: kleiner Zettel mit Titel, Zeitraum und Foto.
- **Ein einziger Auftritt:** Beim ersten Laden zeichnet sich die Route einmal ein. Danach ist Ruhe.
- Auf Reiseseiten gibt es eine eigene Karte mit Stationen.
- Bedienbar per Tastatur, mit einer **Liste als Alternative**, die dieselben Reisen zeigt.
- Karten-Skript wird nur dort geladen, wo es gebraucht wird.

---

## 9. Navigation und Struktur

- Reisen gruppiert nach **Jahr** und **Kontinent**, wie Kapitel im Logbuch.
- Hauptnavigation klein: Karte, Reisen, Über mich.
- Immer klar: Wo bin ich, wie komme ich zurück?
- Lange Berichte (z. B. Lofoten) bekommen ein Inhaltsverzeichnis. Eine Reise kann aus mehreren Teilen bestehen, mit Vor/Zurück dazwischen.

---

## 10. Komponenten

Wenige Bausteine, jeweils als Astro-Komponente mit eigenem Vanilla-CSS:

- **Reise-Eintrag** (Teaser: Foto, Titel, Zeitraum, Stempel)
- **Eingeklebtes Foto** (mit Rand, Ecken, Unterschrift in Handschrift)
- **Foto-Galerie** (Raster, optional Großansicht)
- **Stempel**
- **Randnotiz**
- **Eintragskopf** (Datum, Ort, Dauer)
- **Stecknadel mit Zettel**

Regel: Eine neue Komponente nur, wenn sie an mindestens zwei Stellen gebraucht wird.

---

## 11. CSS-Konventionen

- **Vanilla CSS**, kein Tailwind, kein CSS-Framework.
- Globale Basis in einer Datei: Variablen (`:root`), Reset, Typografie, Papier-Grundlage.
- Komponenten-CSS bleibt bei der Komponente (Astro `<style>`, gescopt).
- Benennung sprechend und flach (`.stamp`, `.photo-note`, `.entry__title`).
- Werte kommen aus Variablen. Keine harten Farb- und Abstandswerte in Komponenten.
- Papier-Textur und Rauschen als **kleines CSS/SVG**, nicht als große Bilddatei.
- Moderne Features erwünscht: Custom Properties, `clamp()`, `:has()`, Container Queries, `aspect-ratio`, `rotate`.
- Vorsicht bei Spezifität: Abschnitts- und Komponentenklassen so bauen, dass sie sich nicht gegenseitig überschreiben.

---

## 12. Bewegung

- **Ein** großer Moment: die Route auf der Karte zeichnet sich einmal ein.
- Ansonsten nur Antworten auf Handlungen: ein Stempel „drückt“ sich auf, wenn man eine Stecknadel öffnet, ein Zettel klappt auf.
- Keine Einblend-Effekte bei jedem Abschnitt, kein Parallax.
- `prefers-reduced-motion` wird immer respektiert: Dann gibt es keine Animation, nur den Endzustand.

---

## 13. Barrierefreiheit

- Semantisches HTML zuerst (`header`, `nav`, `main`, `article`, `figure`).
- Sichtbarer Fokus-Rahmen, nie entfernen. Er darf zum Stil passen (z. B. Tintenkreis), muss aber klar erkennbar sein.
- Kontrast nach WCAG AA, Touch-Ziele mindestens 44 px.
- Handschrift und Stempel tragen **keine** wichtige Information allein. Alles Wesentliche steht auch in normalem Text.
- Dekorative Elemente erhalten leeres `alt` oder `aria-hidden`.
- Sprache pro Seite setzen (`lang="de"`).

---

## 14. Performance-Budget

- Ziel Lighthouse: **90+** in allen vier Kategorien.
- Wenig JavaScript, nur für die Karte und die Großansicht.
- Texturen, Stempel, Kompassrose als SVG oder CSS, klein halten.
- Bilder sind der größte Hebel: richtig dimensionieren, komprimieren, lazy laden.
- Maximal drei Schriftfamilien, nur benötigte Schnitte, selbst gehostet.

---

## 15. Do & Don't

**Do**
- Verspieltheit an den Rändern und auf der Karte
- Ruhiges Papier hinter allem, was gelesen wird
- Stempel, Notizen und Fotoecken mit Bedeutung
- Eine Akzentfarbe: Stempelrot

**Don't**
- Vintage-Filter über Fotos oder die ganze Seite
- Schräg gestellter oder verschmierter Fließtext
- Handschrift für lange Texte
- Zehn Effekte statt einem guten
- Große Textur-Bilder, die Ladezeit fressen

---

## 16. Offene Punkte

- [ ] Farbwerte am echten Bildschirm und mit echten Fotos prüfen
- [x] Schriften: IM Fell English, Newsreader und Reenie Beanie über die Fonts-API von Astro, selbst ausgeliefert (siehe README). Umlaute und Lesbarkeit am Handy noch prüfen
- [x] Kartenlösung: bleibt bei Leaflet mit CARTO-Kacheln (OpenStreetMap). Der Seekarten-Look kommt aus CSS (Kachelfilter, Papierrahmen, Kompassrose, Stecknadeln, Zettel-Popups)
- [ ] Stempelmotive: aktuell ein runder Stempel aus Land und Jahr bzw. Datum, später eigene Gestaltung?
- [ ] Logo/Wortmarke für „hochitom.travel“ (aktuell Schriftzug plus Favicon mit Kompassrose)
- [ ] Darstellung der Weltreise 2018/19 (viele Stationen, eine durchgehende Route?)
- [x] Dunkelmodus „Nachtwache“: umgesetzt über die Farbvariablen
- [ ] Fotos: im Repo liegen noch keine, die Kacheln zeigen bis dahin einen Papierstreifen mit „Foto folgt“
