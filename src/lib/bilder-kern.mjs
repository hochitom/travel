/**
 * Kern der Bild-Syntax für Markdown, unabhängig vom Markdown-Prozessor. Arbeitet auf dem HTML-Baum (hast):
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
 * Das erzeugte Markup entspricht den Astro-Komponenten (src/components/Bildgruppe.astro) und wird von
 * src/styles/bilder.css gestaltet. Die Lightbox ist ein `popover`, siehe dort.
 *
 * Die `img`-Elemente bleiben echte Elemente mit dem Pfad aus dem Markdown, damit Astro sie wie jedes
 * Markdown-Bild optimiert.
 */

const GRUPPEN = { raster: 'bildraster', galerie: 'bildgalerie', slider: 'bildslider' };
const MARKER_AUF = /^:::(raster|galerie|slider)$/;
const MARKER_ZU = /^:::$/;

// ---------------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------------

const el = (tagName, properties = {}, children = []) => ({ type: 'element', tagName, properties, children });
const text = (value) => ({ type: 'text', value });

const istLeer = (k) => k.type === 'text' && !k.value.trim();
const istImg = (k) => k.type === 'element' && k.tagName === 'img';

/** Bild als schlichte Daten, ohne den Titel (der wird zur Beschriftung) */
const bildDaten = (img) => ({
  img,
  alt: String(img.properties?.alt ?? ''),
  titel: img.properties?.title ? String(img.properties.title) : '',
});

/** Kopie des img-Elements ohne title, damit der Titel nicht zusätzlich als Tooltip erscheint */
function bildKopie(b) {
  const { title, ...rest } = b.img.properties ?? {};
  return { ...b.img, properties: rest };
}

const zaehler = (i, n) => el('span', { className: ['bildzaehler'] }, [text(`${i + 1} / ${n}`)]);

function unterschrift(b, i, n, mitZaehler) {
  const teile = [];
  if (mitZaehler && n > 1) teile.push(zaehler(i, n));
  if (b.titel) teile.push(text(b.titel));
  return teile.length ? [el('figcaption', {}, teile)] : [];
}

const oeffner = (b, popoverId) =>
  el(
    'button',
    { type: 'button', className: ['bild__auf'], popovertarget: popoverId, ariaLabel: `${b.alt || 'Bild'} – vergrößern` },
    [bildKopie(b)],
  );

const navKnopf = (richtung, zeichen, beschriftung, zielId) =>
  el(
    'button',
    {
      type: 'button',
      className: ['lightbox__nav', `lightbox__nav--${richtung}`],
      popovertarget: zielId,
      popovertargetaction: 'show',
      ariaLabel: beschriftung,
    },
    [text(zeichen)],
  );

/** Das Popover für Bild i einer Gruppe. Mit Pfeilen, wenn es mehr als ein Bild gibt (rundherum). */
function lightbox(bilder, i, ids) {
  const n = bilder.length;
  const id = ids[i];
  const kinder = [
    el(
      'button',
      { type: 'button', className: ['lightbox__zu'], popovertarget: id, popovertargetaction: 'hide', ariaLabel: 'Schließen', autofocus: true },
      [text('×')],
    ),
    el('figure', { className: ['lightbox__bild'] }, [bildKopie(bilder[i]), ...unterschrift(bilder[i], i, n, true)]),
  ];
  if (n > 1) {
    kinder.push(
      navKnopf('zurueck', '‹', 'Vorheriges Bild', ids[(i - 1 + n) % n]),
      navKnopf('weiter', '›', 'Nächstes Bild', ids[(i + 1) % n]),
    );
  }
  return el('div', { id, className: ['lightbox'], popover: 'auto', role: 'dialog', ariaLabel: 'Bildansicht' }, kinder);
}

function baueEinzelbild(b, basis) {
  const ids = [`${basis}-1`];
  return [el('figure', { className: ['bild'] }, [oeffner(b, ids[0]), ...unterschrift(b, 0, 1, false)]), lightbox([b], 0, ids)];
}

function baueGruppe(art, bilder, basis) {
  const n = bilder.length;
  const ids = bilder.map((_, i) => `${basis}-${i + 1}`);
  const eigenschaften = { className: [GRUPPEN[art]] };
  if (art === 'slider') {
    // Fokussierbar, damit man mit den Pfeiltasten blättern kann
    Object.assign(eigenschaften, { tabIndex: 0, role: 'group', ariaLabel: 'Bildergalerie, seitlich wischen' });
  }
  const kacheln = bilder.map((b, i) =>
    el('figure', { className: ['bildgruppe__bild'] }, [oeffner(b, ids[i]), ...unterschrift(b, i, n, art === 'slider')]),
  );
  return [el('div', eigenschaften, kacheln), ...bilder.map((_, i) => lightbox(bilder, i, ids))];
}

// ---------------------------------------------------------------------------
// Erkennen
// ---------------------------------------------------------------------------

const istAbsatz = (k) => k.type === 'element' && k.tagName === 'p';

/** Zerlegt einen Absatz in Marker, Bilder und anderen Text */
function lies(absatz) {
  const teile = [];
  for (const kind of absatz.children) {
    if (istImg(kind)) {
      teile.push({ art: 'bild', knoten: kind });
    } else if (kind.type === 'text') {
      for (const zeile of kind.value.split('\n').map((z) => z.trim()).filter(Boolean)) {
        const auf = MARKER_AUF.exec(zeile);
        if (auf) teile.push({ art: 'auf', gruppe: auf[1] });
        else if (MARKER_ZU.test(zeile)) teile.push({ art: 'zu' });
        else teile.push({ art: 'text', wert: zeile });
      }
    } else {
      teile.push({ art: 'fremd' });
    }
  }
  return teile;
}

const istBildAbsatz = (k) => {
  if (!istAbsatz(k)) return false;
  const inhalt = k.children.filter((c) => !istLeer(c));
  return inhalt.length === 1 && istImg(inhalt[0]);
};

const beginntGruppe = (k) => istAbsatz(k) && lies(k)[0]?.art === 'auf';

/** Liest eine Gruppe ab Index `start`. Bricht den Build mit einer klaren Meldung ab, wenn sie kaputt ist. */
function leseGruppe(kinder, start) {
  const fehler = (meldung) => {
    throw new Error(`Bildgruppe: ${meldung}`);
  };

  let art;
  const bilder = [];
  for (let j = start; j < kinder.length; j++) {
    const absatz = kinder[j];
    if (istLeer(absatz)) continue; // Zeilenumbruch zwischen zwei Blöcken
    if (!istAbsatz(absatz)) fehler('Vor dem schließenden ::: steht etwas anderes als Bilder.');
    const teile = lies(absatz);
    for (let t = 0; t < teile.length; t++) {
      const teil = teile[t];
      if (teil.art === 'auf') {
        if (art) fehler('Gruppen dürfen nicht verschachtelt werden.');
        art = teil.gruppe;
      } else if (teil.art === 'bild') {
        bilder.push(bildDaten(teil.knoten));
      } else if (teil.art === 'zu') {
        if (teile.slice(t + 1).length) fehler('Nach dem schließenden ::: darf im selben Absatz nichts mehr stehen.');
        if (!bilder.length) fehler(`Die Gruppe "${art}" enthält kein Bild.`);
        return { art, bilder, ende: j };
      } else {
        fehler(`Zwischen den Markern ist nur Bild-Syntax erlaubt, gefunden: ${teil.wert ?? 'anderer Inhalt'}`);
      }
    }
  }
  return fehler(`Die Gruppe "${art}" wird nie mit ::: geschlossen.`);
}

/** Kurzer, stabiler Hash, damit die Popover-IDs mehrerer Seiten nicht kollidieren */
function kurzerHash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36).slice(0, 5);
}

/**
 * Wandelt die Kinder des Wurzelknotens um und gibt die neue Liste zurück.
 * `quelle` ist der Dateipfad (nur für stabile, eindeutige IDs).
 */
export function bilderUmwandeln(kinder, quelle = '') {
  const praefix = kurzerHash(String(quelle));
  let nummer = 0;
  const neueBasis = () => `lb-${praefix}-${++nummer}`;

  const ergebnis = [];
  for (let i = 0; i < kinder.length; i++) {
    const k = kinder[i];
    if (beginntGruppe(k)) {
      const g = leseGruppe(kinder, i);
      ergebnis.push(...baueGruppe(g.art, g.bilder, neueBasis()));
      i = g.ende;
    } else if (istBildAbsatz(k)) {
      const bild = k.children.find(istImg);
      ergebnis.push(...baueEinzelbild(bildDaten(bild), neueBasis()));
    } else {
      ergebnis.push(k);
    }
  }
  return ergebnis;
}
