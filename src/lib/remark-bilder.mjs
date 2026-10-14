/**
 * Remark-Plugin für Bilder in Markdown. Keine Abhängigkeiten, kein JavaScript im Browser.
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
 * Das erzeugte Markup entspricht den Astro-Komponenten (src/components/Raster.astro usw.) und wird
 * von src/styles/bilder.css gestaltet. Die Lightbox ist ein `popover`, siehe dort.
 *
 * Technik: Die neuen Elemente sind mdast-Knoten mit `data.hName` und `data.hProperties`. Die echten
 * `image`-Knoten bleiben erhalten, damit Astro sie wie jedes Markdown-Bild optimiert.
 */

const GRUPPEN = { raster: 'bildraster', galerie: 'bildgalerie', slider: 'bildslider' };
const MARKER_AUF = /^:::(raster|galerie|slider)$/;
const MARKER_ZU = /^:::$/;

// ---------------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------------

/** Ein HTML-Element, getarnt als mdast-Absatz. remark-rehype macht daraus `hName` mit `hProperties`. */
const el = (hName, hProperties, children = []) => ({
  type: 'paragraph',
  data: { hName, hProperties },
  children,
});

const text = (value) => ({ type: 'text', value });

/** Frischer image-Knoten. Der Titel wandert in die Beschriftung, damit er nicht doppelt als Tooltip erscheint. */
const bildKnoten = (b) => ({ type: 'image', url: b.url, alt: b.alt ?? '', title: null });

const zaehler = (i, n) => el('span', { className: ['bildzaehler'] }, [text(`${i + 1} / ${n}`)]);

/** figcaption mit optionalem Zähler und Beschriftung, oder nichts */
function unterschrift(b, i, n, mitZaehler) {
  const teile = [];
  if (mitZaehler && n > 1) teile.push(zaehler(i, n));
  if (b.title) teile.push(text(b.title));
  return teile.length ? [el('figcaption', {}, teile)] : [];
}

/** Button um das Bild, öffnet das Popover mit der Lightbox */
const oeffner = (b, popoverId) =>
  el(
    'button',
    {
      type: 'button',
      className: ['bild__auf'],
      popovertarget: popoverId,
      ariaLabel: `${b.alt || 'Bild'} – vergrößern`,
    },
    [bildKnoten(b)],
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
      {
        type: 'button',
        className: ['lightbox__zu'],
        popovertarget: id,
        popovertargetaction: 'hide',
        ariaLabel: 'Schließen',
        autofocus: true,
      },
      [text('×')],
    ),
    el('figure', { className: ['lightbox__bild'] }, [bildKnoten(bilder[i]), ...unterschrift(bilder[i], i, n, true)]),
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

/** Zerlegt einen Absatz in Marker, Bilder und anderen Text */
function lies(absatz) {
  const teile = [];
  for (const kind of absatz.children) {
    if (kind.type === 'image') {
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
  if (k.type !== 'paragraph') return false;
  const inhalt = k.children.filter((c) => !(c.type === 'text' && !c.value.trim()));
  return inhalt.length === 1 && inhalt[0].type === 'image';
};

const beginntGruppe = (k) => k.type === 'paragraph' && lies(k)[0]?.art === 'auf';

/** Liest eine Gruppe ab Index `start`. Bricht den Build mit einer klaren Meldung ab, wenn sie kaputt ist. */
function leseGruppe(kinder, start, datei) {
  const fehler = (meldung, knoten) => {
    const text = `Bildgruppe: ${meldung}`;
    if (typeof datei.fail === 'function') datei.fail(text, knoten.position);
    throw new Error(text);
  };

  let art;
  const bilder = [];
  for (let j = start; j < kinder.length; j++) {
    const absatz = kinder[j];
    if (absatz.type !== 'paragraph') fehler('Vor dem schließenden ::: steht etwas anderes als Bilder.', absatz);
    const teile = lies(absatz);
    for (let t = 0; t < teile.length; t++) {
      const teil = teile[t];
      if (teil.art === 'auf') {
        if (art) fehler('Gruppen dürfen nicht verschachtelt werden.', absatz);
        art = teil.gruppe;
      } else if (teil.art === 'bild') {
        bilder.push(teil.knoten);
      } else if (teil.art === 'zu') {
        if (teile.slice(t + 1).length) fehler('Nach dem schließenden ::: darf im selben Absatz nichts mehr stehen.', absatz);
        if (!bilder.length) fehler(`Die Gruppe "${art}" enthält kein Bild.`, absatz);
        return { art, bilder, ende: j };
      } else {
        fehler(`Zwischen den Markern ist nur Bild-Syntax erlaubt, gefunden: ${teil.wert ?? 'anderer Inhalt'}`, absatz);
      }
    }
  }
  fehler(`Die Gruppe "${art}" wird nie mit ::: geschlossen.`, kinder[start]);
}

/** Kurzer, stabiler Hash, damit die Popover-IDs mehrerer Seiten nicht kollidieren */
function kurzerHash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36).slice(0, 5);
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export default function remarkBilder() {
  return (baum, datei) => {
    const praefix = kurzerHash(String(datei?.path ?? datei?.history?.[0] ?? ''));
    let nummer = 0;
    const neueBasis = () => `lb-${praefix}-${++nummer}`;

    const kinder = baum.children;
    const ergebnis = [];
    for (let i = 0; i < kinder.length; i++) {
      const k = kinder[i];
      if (beginntGruppe(k)) {
        const g = leseGruppe(kinder, i, datei);
        ergebnis.push(...baueGruppe(g.art, g.bilder, neueBasis()));
        i = g.ende;
      } else if (istBildAbsatz(k)) {
        const bild = k.children.find((c) => c.type === 'image');
        ergebnis.push(...baueEinzelbild(bild, neueBasis()));
      } else {
        ergebnis.push(k);
      }
    }
    baum.children = ergebnis;
  };
}
