/**
 * Markup für eine Berg-Skizze (drehbares 3D-Modell eines einzelnen Bergs aus öffentlichen Daten).
 * Wird von src/components/Berg.astro und vom Marker `:::berg` in Markdown (src/lib/bilder-html.mjs) benutzt.
 * Läuft beim Bauen in Node. Der Modell-Code (src/scripts/modelle/berg.js) und die Daten werden erst nach Klick geladen.
 *
 * Marker in Markdown, eine eigene Zeile (eigener Absatz), Teile mit | getrennt:
 *
 *   :::berg Festvågtind | 68.1783, 14.2248 | 541 m
 *   :::berg Großglockner | 47.0745, 12.6938 | 3798 m | 6 km
 *
 * Erster Teil ist der Name. Danach in beliebiger Reihenfolge: Lage als "Breite, Länge" (Grad, Punkt als
 * Dezimalzeichen), Höhe als "541 m", Wikidata-Kennung "Q…", Ausschnitt als "3 km". Lage oder Wikidata muss sein.
 * Die Lage darf ungefähr sein, die Skizze sucht den höchsten Punkt im Umkreis von etwa 350 m.
 */

export const BERG_STANDARD = { breite: 3000, ueberhoehung: 1.3 };

const maske = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const zahl = (n) => n.toLocaleString('de-AT', { maximumFractionDigits: 1 });

/**
 * @param {object} p
 * @param {string} p.name           Name des Bergs
 * @param {number} [p.lat]          Breite in Grad (ungefähr reicht)
 * @param {number} [p.lon]          Länge in Grad
 * @param {number} [p.hoehe]        Gipfelhöhe in m (sonst Wikidata, sonst aus dem Gelände)
 * @param {string} [p.wikidata]     Wikidata-Kennung, Q mit Zahl
 * @param {number} [p.breite]       Kantenlänge des Ausschnitts in m
 * @param {number} [p.ueberhoehung] Faktor für die Höhe in der Darstellung
 * @param {string} [p.unterschrift] eigene Bildunterschrift (HTML-sicherer Text), ersetzt den ersten Satz
 */
export function bergFigur({ name, lat, lon, hoehe, wikidata, breite = BERG_STANDARD.breite, ueberhoehung = BERG_STANDARD.ueberhoehung, unterschrift } = {}) {
  const fehler = (m) => {
    throw new Error(`Berg${name ? ` "${name}"` : ''}: ${m}`);
  };
  if (!name || !String(name).trim()) fehler('Name fehlt.');
  const hatLage = lat !== undefined && lon !== undefined;
  if (hatLage && !(Math.abs(lat) <= 85 && Math.abs(lon) <= 180)) fehler(`ungültige Lage ${lat}, ${lon}.`);
  if (wikidata !== undefined && !/^Q\d+$/.test(wikidata)) fehler(`ungültige Wikidata-Kennung "${wikidata}".`);
  if (!hatLage && !wikidata) fehler('Lage (lat, lon) oder Wikidata-Kennung fehlt.');
  if (hoehe !== undefined && !(hoehe > 0 && hoehe < 9000)) fehler(`ungültige Höhe ${hoehe}.`);
  if (!(breite >= 500 && breite <= 20000)) fehler('Ausschnitt muss zwischen 0,5 und 20 km liegen.');

  const daten = { name, lat, lon, hoehe, wikidata, breite, ueberhoehung };
  const attribute = Object.entries(daten)
    .filter(([, w]) => w !== undefined)
    .map(([k, w]) => ` data-${k}="${maske(w)}"`)
    .join('');
  const km = zahl(breite / 1000);
  const vorschau = `${maske(name)}${hoehe ? `, ${zahl(hoehe)} m` : ''}: Skizze aus öffentlichen Höhendaten, Ausschnitt ${km} × ${km} km.`;
  const quellen =
    'Gelände: <a href="https://registry.opendata.aws/terrain-tiles/">Terrain Tiles</a> (Mapzen/Tilezen, Open Data on AWS)' +
    (wikidata ? `, Gipfel: <a href="https://www.wikidata.org/wiki/${wikidata}">Wikidata</a>` : '');
  const satz = unterschrift || `Skizze aus Höhendaten, Höhe ${zahl(ueberhoehung)}-fach überhöht, die Fahne steht am höchsten Punkt.`;
  return (
    `<figure class="modell modell--berg" data-modell="berg"${attribute}>` +
    `<div class="modell__buehne"><p class="modell__vorschau">${vorschau}</p>` +
    `<button type="button" class="modell__start">3D-Skizze starten</button></div>` +
    `<figcaption>${satz} ${quellen}. Die Daten lädt dein Browser erst nach dem Klick.</figcaption>` +
    `</figure>`
  );
}

/** Liest die Angaben hinter `:::berg` (Klartext, ohne HTML). Fehler mit Hinweis auf die Syntax. */
export function bergAusMarker(text) {
  const [name, ...teile] = text.split('|').map((t) => t.trim());
  const p = { name };
  for (const t of teile) {
    let m;
    if ((m = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(t))) [p.lat, p.lon] = [Number(m[1]), Number(m[2])];
    else if ((m = /^(\d+(?:[.,]\d+)?)\s*m$/.exec(t))) p.hoehe = Number(m[1].replace(',', '.'));
    else if ((m = /^(\d+(?:[.,]\d+)?)\s*km$/.exec(t))) p.breite = Number(m[1].replace(',', '.')) * 1000;
    else if (/^Q\d+$/.test(t)) p.wikidata = t;
    else throw new Error(`Berg "${name}": unbekannte Angabe "${t}". Erlaubt: "Breite, Länge", "541 m", "3 km", "Q…".`);
  }
  return p;
}
