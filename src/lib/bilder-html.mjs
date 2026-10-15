/**
 * Bildgruppen und Lightbox für Markdown, unabhängig vom Markdown-Prozessor. Läuft auf dem fertigen
 * HTML eines Berichts (siehe src/components/MitBildern.astro), also nach Astros Bildoptimierung.
 *
 * 1. Bildgruppen mit Markern (leere Zeilen zwischen den Bildern sind egal):
 *
 *      :::galerie
 *      ![Alt-Text](./bilder/a.jpg "Beschriftung")
 *      ![Alt-Text](./bilder/b.jpg)
 *      :::
 *
 *    Es gibt drei Arten: raster, galerie, slider. Der Titel in Anführungszeichen ist die Beschriftung.
 *
 * 2. Jedes Bild, das allein in einem Absatz steht, wird zum Einzelbild mit Lightbox.
 *
 * Das erzeugte Markup entspricht src/components/Bildgruppe.astro und wird von src/styles/bilder.css
 * gestaltet. Die Lightbox ist ein `popover`, siehe dort.
 *
 * Gearbeitet wird nur mit `<p>`-Blöcken und `<img>`-Tags, mehr erzeugt Markdown für Bilder nicht.
 */

import { MODELLE } from '../scripts/modelle/meta.mjs';
import { bergAusMarker, bergFigur } from './berg-html.mjs';

const GRUPPEN = { raster: 'bildraster', galerie: 'bildgalerie', slider: 'bildslider' };
const MARKER_AUF = /^:::(raster|galerie|slider)$/;
const MARKER_ZU = /^:::$/;
const MARKER_MODELL = /^:::modell\s+([a-z0-9-]+)$/;
const MARKER_BERG = /^:::berg\s+(.+)$/;

// Interaktive 3D-Modelle: Texte stehen in src/scripts/modelle/meta.mjs, der Code wird erst nach Klick geladen.
// Berg-Skizzen (:::berg Name | Breite, Länge | …) siehe src/lib/berg-html.mjs.

const ABSATZ = /<p>([\s\S]*?)<\/p>/g;
const IMG = /<img\b[^>]*>/g;

// ---------------------------------------------------------------------------
// Kleine Helfer für HTML-Text
// ---------------------------------------------------------------------------

/** Wert eines Attributs, so wie er im HTML steht (also schon maskiert) */
function attribut(tag, name) {
  const m = new RegExp(`\\s${name}=(?:"([^"]*)"|'([^']*)')`).exec(tag);
  return m ? (m[1] ?? m[2]) : '';
}

/** Tag ohne ein bestimmtes Attribut */
const ohneAttribut = (tag, name) => tag.replace(new RegExp(`\\s${name}=(?:"[^"]*"|'[^']*')`), '');

const klartext = (s) => s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

// ---------------------------------------------------------------------------
// Bausteine (HTML-Strings)
// ---------------------------------------------------------------------------

/** Bild als schlichte Daten. alt und titel stehen schon als HTML-sicherer Text da. */
function bildDaten(tag) {
  return { tag: ohneAttribut(tag, 'title'), alt: attribut(tag, 'alt'), titel: attribut(tag, 'title') };
}

const zaehler = (i, n) => `<span class="bildzaehler">${i + 1} / ${n}</span>`;

function unterschrift(b, i, n, mitZaehler) {
  const teile = (mitZaehler && n > 1 ? zaehler(i, n) : '') + b.titel;
  return teile ? `<figcaption>${teile}</figcaption>` : '';
}

const oeffner = (b, id) =>
  `<button type="button" class="bild__auf" popovertarget="${id}" aria-label="${b.alt || 'Bild'} – vergrößern">${b.tag}</button>`;

const navKnopf = (richtung, zeichen, beschriftung, zielId) =>
  `<button type="button" class="lightbox__nav lightbox__nav--${richtung}" popovertarget="${zielId}" popovertargetaction="show" aria-label="${beschriftung}">${zeichen}</button>`;

/** Das Popover für Bild i einer Gruppe. Mit Pfeilen, wenn es mehr als ein Bild gibt (rundherum). */
function lightbox(bilder, i, ids) {
  const n = bilder.length;
  const id = ids[i];
  const nav =
    n > 1
      ? navKnopf('zurueck', '‹', 'Vorheriges Bild', ids[(i - 1 + n) % n]) + navKnopf('weiter', '›', 'Nächstes Bild', ids[(i + 1) % n])
      : '';
  return (
    `<div id="${id}" class="lightbox" popover="auto" role="dialog" aria-label="Bildansicht">` +
    `<button type="button" class="lightbox__zu" popovertarget="${id}" popovertargetaction="hide" aria-label="Schließen" autofocus>×</button>` +
    `<figure class="lightbox__bild">${bilder[i].tag}${unterschrift(bilder[i], i, n, true)}</figure>` +
    nav +
    `</div>`
  );
}

function baueEinzelbild(b, basis) {
  const ids = [`${basis}-1`];
  return `<figure class="bild">${oeffner(b, ids[0])}${unterschrift(b, 0, 1, false)}</figure>` + lightbox([b], 0, ids);
}

function baueGruppe(art, bilder, basis) {
  const n = bilder.length;
  const ids = bilder.map((_, i) => `${basis}-${i + 1}`);
  const slider = art === 'slider' ? ' tabindex="0" role="group" aria-label="Bildergalerie, seitlich wischen"' : '';
  const kacheln = bilder
    .map((b, i) => `<figure class="bildgruppe__bild">${oeffner(b, ids[i])}${unterschrift(b, i, n, art === 'slider')}</figure>`)
    .join('');
  return `<div class="${GRUPPEN[art]}"${slider}>${kacheln}</div>` + bilder.map((_, i) => lightbox(bilder, i, ids)).join('');
}

// ---------------------------------------------------------------------------
// Erkennen
// ---------------------------------------------------------------------------

/** Zerlegt den Inhalt eines Absatzes in Marker, Bilder und anderen Text */
function lies(inneres) {
  const teile = [];
  const textteil = (t) => {
    for (const zeile of klartext(t).split('\n').map((z) => z.trim()).filter(Boolean)) {
      const auf = MARKER_AUF.exec(zeile);
      if (auf) teile.push({ art: 'auf', gruppe: auf[1] });
      else if (MARKER_ZU.test(zeile)) teile.push({ art: 'zu' });
      else teile.push({ art: 'text', wert: zeile });
    }
  };
  // Links, Hervorhebungen usw. im Absatz: kein reiner Bildabsatz, nicht anfassen
  if (/<(?!img\b)[a-z]/i.test(inneres.replace(IMG, ''))) {
    teile.push({ art: 'text', wert: 'anderer Inhalt' });
    return teile;
  }
  let pos = 0;
  for (const m of inneres.matchAll(IMG)) {
    // Text zwischen den Bildern: Zeilen mit Markern oder Text. Andere Tags (Links usw.) zählen als Text.
    textteil(inneres.slice(pos, m.index).replace(/<br\s*\/?>/g, '\n'));
    teile.push({ art: 'bild', tag: m[0] });
    pos = m.index + m[0].length;
  }
  textteil(inneres.slice(pos).replace(/<br\s*\/?>/g, '\n'));
  return teile;
}

function baueModell(name) {
  const m = MODELLE[name];
  if (!m) throw new Error(`Modell: unbekanntes Modell "${name}". Bekannt: ${Object.keys(MODELLE).join(', ')}`);
  return `<figure class="modell" data-modell="${name}"><div class="modell__buehne"><p class="modell__vorschau">${m.vorschau}</p><button type="button" class="modell__start">3D-Modell starten</button></div><figcaption>${m.unterschrift}</figcaption></figure>`;
}

/** Hash, damit die Popover-IDs mehrerer Seiten nicht kollidieren */
function kurzerHash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36).slice(0, 5);
}

/**
 * Wandelt Bildabsätze und Bildgruppen im HTML um. `quelle` ist nur für stabile, eindeutige IDs.
 * Ohne Marker und ohne Einzelbild kommt das HTML unverändert zurück.
 */
export function bilderUmwandeln(html, quelle = '') {
  const praefix = kurzerHash(String(quelle));
  let nummer = 0;
  const neueBasis = () => `lb-${praefix}-${++nummer}`;
  const fehler = (meldung) => {
    throw new Error(`Bildgruppe: ${meldung}`);
  };

  const absaetze = [...html.matchAll(ABSATZ)].map((m) => ({ start: m.index, ende: m.index + m[0].length, teile: lies(m[1]) }));
  let ergebnis = '';
  let pos = 0;

  for (let a = 0; a < absaetze.length; a++) {
    const p = absaetze[a];
    const eigenes = p.teile;

    const einzeln = eigenes.length === 1 && eigenes[0].art === 'text' ? eigenes[0].wert : '';
    const modell = MARKER_MODELL.exec(einzeln);
    const berg = MARKER_BERG.exec(einzeln);
    if (modell) {
      ergebnis += html.slice(pos, p.start) + baueModell(modell[1]);
      pos = p.ende;
    } else if (berg) {
      ergebnis += html.slice(pos, p.start) + bergFigur(bergAusMarker(berg[1]));
      pos = p.ende;
    } else if (eigenes[0]?.art === 'auf') {
      // Gruppe lesen, bis zum schließenden :::
      let art;
      const bilder = [];
      let b = a;
      let fertig = false;
      for (; b < absaetze.length && !fertig; b++) {
        const q = absaetze[b];
        if (b > a && html.slice(absaetze[b - 1].ende, q.start).trim()) {
          fehler('Vor dem schließenden ::: steht etwas anderes als Bilder.');
        }
        for (let t = 0; t < q.teile.length; t++) {
          const teil = q.teile[t];
          if (teil.art === 'auf') {
            if (art) fehler('Gruppen dürfen nicht verschachtelt werden.');
            art = teil.gruppe;
          } else if (teil.art === 'bild') {
            bilder.push(bildDaten(teil.tag));
          } else if (teil.art === 'zu') {
            if (q.teile.slice(t + 1).length) fehler('Nach dem schließenden ::: darf im selben Absatz nichts mehr stehen.');
            if (!bilder.length) fehler(`Die Gruppe "${art}" enthält kein Bild.`);
            fertig = true;
            break;
          } else {
            fehler(`Zwischen den Markern ist nur Bild-Syntax erlaubt, gefunden: ${teil.wert}`);
          }
        }
      }
      if (!fertig) fehler(`Die Gruppe "${art}" wird nie mit ::: geschlossen.`);
      const letzter = absaetze[b - 1];
      ergebnis += html.slice(pos, p.start) + baueGruppe(art, bilder, neueBasis());
      pos = letzter.ende;
      a = b - 1;
    } else if (eigenes.length === 1 && eigenes[0].art === 'bild') {
      ergebnis += html.slice(pos, p.start) + baueEinzelbild(bildDaten(eigenes[0].tag), neueBasis());
      pos = p.ende;
    }
  }
  return ergebnis + html.slice(pos);
}
