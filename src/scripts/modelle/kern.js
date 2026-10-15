/**
 * Kern der 3D-Modelle: zeichnet ein Gelände (optional mit Weg) als Skizze im Logbuch-Stil (Papier, Tinte,
 * Höhenlinien, Stempelrot, Handschrift). Reines Canvas 2D, keine Bibliothek, gezeichnet wird nur nach Eingabe.
 *
 * Ein Modell ist eine Datei in src/scripts/modelle/. Sie exportiert (default) entweder das Objekt unten oder
 * eine async-Funktion, die es aus den data-Attributen der Figur baut (so lädt berg.js seine Daten).
 * Der Kern kümmert sich um Darstellung, Bedienung, Dunkelmodus und Tastatur.
 *
 *   export default {
 *     titel: 'Reinebringen',                 // Zettel oben links (Überschriftenschrift)
 *     untertitel: 'Stufenweg, Skizze',       // darunter in Handschrift
 *     bereich: { x: [-760, 760], z: [-520, 900], nx: 86, nz: 80 },   // Ausschnitt in m (x Ost, z Süd), Gitterpunkte
 *     hoehe: (x, z) => 0,                    // Geländehöhe in m (unter 0,5 = Wasser)
 *     ueberhoehung: 1.5,                     // Faktor für die Höhe in der Darstellung
 *     hoeheMax: 484,                         // höchster Punkt, bestimmt Bildausschnitt
 *     ansicht: { gier: -0.25, neigung: 0.42, zoom: 1 },
 *     hoehenlinien: { abstand: 25, stark: 100 },
 *     sockel: false,                         // Schnittkanten am Rand zeigen (für Ausschnitte aus echtem Gelände)
 *     nordpfeil: false,                      // kleine Kompassnadel oben rechts, dreht mit
 *     einpassen: false,                      // Gelände in der Startansicht senkrecht mittig ins Blatt setzen
 *     bedienung: 'voll',                     // 'voll' (Drehen, Zoomen, Weg) oder 'drehen' (nur Drehen)
 *     weg: {                                 // optional, ohne Weg gibt es nur Drehen
 *       meter: 1100,                         // Länge des Wegs in m (nominal)
 *       punkte: () => [{ x, y, z }, ...],    // Weg von unten nach oben, ca. 300 Punkte, y in m
 *       dauer: 22,                           // Sekunden für „Hinaufwandern“
 *     },
 *     abschnitte: [                          // Anteile 0..1 am Weg, aufsteigend
 *       { bis: 0.909, art: 'stufen', anzahl: 1978, einheit: 'Stufe' },
 *       { bis: 1, art: 'pfad', name: 'ohne Stufen' },
 *     ],
 *     marken: [                              // t: Anteil am Weg, oder feste Lage x, y, z in m
 *       { t: 0, text: 'Start · Reine' },
 *       { x: 0, y: 484, z: 0, text: 'Gipfel', art: 'fahne' },
 *     ],
 *     stufenmarken: [500, 1000, 1500],       // optionale Beschriftungen entlang des Wegs
 *     hoehenmarken: [100, 200, 300, 400],    // optionale Beschriftungen in Höhenmetern
 *     stempel: { kopf: 'Gipfel', titel: '484 m', zusatz: 'ü. M.' },   // Passstempel unten rechts
 *     kopf: [{ name: 'Höhe', wert: '541 m', klein: 'ü. M.' }],        // Eintragskopf, nur ohne Weg
 *     beschreibung: 'Text für Screenreader',
 *   };
 *
 * Meta-Angaben für den Artikel (Vorschau-Text, Bildunterschrift) stehen in meta.mjs bzw. src/lib/berg-html.mjs.
 *
 * Darstellung: Pro Bild wird jeder Gitterpunkt genau einmal projiziert. Das Meer ist eine einzige Ebene auf
 * Höhe 0 (liegt immer hinter dem Land, solange man von oben schaut), Küstenzellen werden an der Wasserlinie
 * abgeschnitten. Nur Landzellen und Wegstücke werden nach Tiefe sortiert. Füllfarben sind vorberechnet und werden nur beim Wechsel Hell/Dunkel neu gebaut.
 */

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mische = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function hash(i, j) {
  let h = (i * 374761393 + j * 668265263) ^ 0x5bd1e995;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
/** Weiches Wertrauschen 0..1, `skala` ist die Wellenlänge in m */
function rauschen(x, z, skala) {
  const gx = x / skala, gz = z / skala;
  const i = Math.floor(gx), j = Math.floor(gz);
  const fx = smooth(0, 1, gx - i), fz = smooth(0, 1, gz - j);
  const oben = hash(i, j) + (hash(i + 1, j) - hash(i, j)) * fx;
  const unten = hash(i, j + 1) + (hash(i + 1, j + 1) - hash(i, j + 1)) * fx;
  return oben + (unten - oben) * fz;
}

/** Hilfen für Modell-Dateien */
export const werkzeug = { glatt: smooth, rauschen, mische };

// ---- Farben aus den CSS-Variablen der Seite ----------------------------------------------------------

function lesen(el, name) {
  const wert = getComputedStyle(el).getPropertyValue(name).trim();
  if (wert[0] === '#') {
    const h = wert.length === 4 ? '#' + [...wert.slice(1)].map((c) => c + c).join('') : wert;
    return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  return (wert.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
}
const rgb = (c, a = 1) => `rgb(${c[0] | 0} ${c[1] | 0} ${c[2] | 0}${a < 1 ? ` / ${a}` : ''})`;

const LICHTSTUFEN = 48;

function palette(el) {
  const p = {
    papier: lesen(el, '--papier'),
    papier2: lesen(el, '--papier-2'),
    tinte: lesen(el, '--tinte'),
    leise: lesen(el, '--tinte-leise'),
    linie: lesen(el, '--linie'),
    meer: lesen(el, '--meer'),
    akzent: lesen(el, '--akzent'),
  };
  const hell = (p.papier2[0] + p.papier2[1] + p.papier2[2]) / 3 > 128;
  p.dunkel = !hell;
  // Fläche: beleuchtet = Lesepapier, im Schatten = Bleistifttönung (im Dunkelmodus umgekehrt: Licht heller)
  const licht = hell ? p.papier2 : mische(p.papier2, p.linie, 0.85);
  const schatten = hell ? mische(p.papier2, p.linie, 0.95) : p.papier;
  p.schattenFarbe = schatten;
  p.wasser = mische(p.papier2, p.meer, hell ? 0.2 : 0.35);
  // Füllfarben einmal pro Palette statt einmal pro Zelle und Bild
  p.flaechen = Array.from({ length: LICHTSTUFEN + 1 }, (_, k) =>
    rgb(mische(schatten, licht, 0.25 + 0.75 * Math.min(1, (k / LICHTSTUFEN) * 1.15))),
  );
  p.sockel = rgb(mische(schatten, p.linie, hell ? 0.35 : 0.2));
  p.schriftHand = getComputedStyle(el).getPropertyValue('--hand').trim() || 'cursive';
  p.schriftKopf = getComputedStyle(el).getPropertyValue('--serif-kopf').trim() || 'serif';
  return p;
}

// ---- Gitter, Höhenlinien -----------------------------------------------------------------------------

/**
 * Gelände als flache Typed Arrays: Höhen pro Gitterpunkt, pro Zelle Licht und Höhenlinien.
 * Zelle c liegt zwischen den Punkten (i, j) und (i + 1, j + 1) mit i = c % (nx - 1), j = c / (nx - 1).
 */
function baueGitter(m) {
  const { x: [x0, x1], z: [z0, z1], nx, nz } = m.bereich;
  const X = new Float32Array(nx), Z = new Float32Array(nz);
  for (let i = 0; i < nx; i++) X[i] = x0 + ((x1 - x0) * i) / (nx - 1);
  for (let j = 0; j < nz; j++) Z[j] = z0 + ((z1 - z0) * j) / (nz - 1);
  const H = new Float32Array(nx * nz);
  let min = Infinity, max = -Infinity;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const wert = m.hoehe(X[i], Z[j]);
      H[j * nx + i] = wert;
      if (wert < min) min = wert;
      if (wert > max) max = wert;
    }
  }

  const { abstand = 25, stark = 100 } = m.hoehenlinien || {};
  const sonne = [-0.45, 0.8, 0.4];
  const sl = Math.hypot(...sonne);
  const cx = nx - 1, cz = nz - 1;
  const licht = new Uint8Array(cx * cz);
  const linien = new Array(cx * cz).fill(null);
  const land = [], wellen = [];
  const kueste = new Array(cx * cz).fill(null);

  // Höhenlinien in einem Dreieck, je Art (0 fein, 1 stark, 2 Küste) eine flache Liste ax ay az bx by bz …
  const dreieck = (A, B, C, lin) => {
    const lo = Math.min(A[1], B[1], C[1]), hi = Math.max(A[1], B[1], C[1]);
    for (let L = Math.ceil((lo + 0.001) / abstand) * abstand; L < hi; L += abstand) {
      const pkt = [];
      for (const [P, Q] of [[A, B], [B, C], [C, A]]) {
        const a = P[1] - L - 0.001, b = Q[1] - L - 0.001;
        if (a * b < 0) {
          const t = a / (a - b);
          pkt.push(P[0] + (Q[0] - P[0]) * t, L, P[2] + (Q[2] - P[2]) * t);
        }
      }
      if (pkt.length === 6) lin[L === 0 ? 2 : L % stark === 0 ? 1 : 0].push(...pkt);
    }
  };

  for (let j = 0; j < cz; j++) {
    for (let i = 0; i < cx; i++) {
      const c = j * cx + i;
      const v = j * nx + i;
      const h00 = H[v], h10 = H[v + 1], h01 = H[v + nx], h11 = H[v + nx + 1];
      const hoch = Math.max(h00, h10, h01, h11);
      const dx = X[i + 1] - X[i], dz = Z[j + 1] - Z[j];
      const nxv = -((h10 + h11) - (h00 + h01)) / (2 * dx);
      const nzv = -((h01 + h11) - (h00 + h10)) / (2 * dz);
      const nl = Math.hypot(nxv, 1, nzv);
      const l = Math.max(0, ((nxv / nl) * sonne[0] + (1 / nl) * sonne[1] + (nzv / nl) * sonne[2]) / sl);
      licht[c] = Math.round(Math.min(1, l) * LICHTSTUFEN);
      if (hoch < 0.5) {
        // Ganz unter Wasser: nichts zeichnen, die Meeresebene liegt darunter
        if ((i * 3 + j * 5) % 11 === 0) wellen.push(c);
        continue;
      }
      land.push(c);
      const P = [[X[i], h00, Z[j]], [X[i + 1], h10, Z[j]], [X[i + 1], h11, Z[j + 1]], [X[i], h01, Z[j + 1]]];
      const lin = [[], [], []];
      dreieck(P[0], P[1], P[2], lin);
      dreieck(P[0], P[2], P[3], lin);
      if (lin.some((l) => l.length)) linien[c] = lin.map((l) => (l.length ? Float32Array.from(l) : null));
      // Küstenzelle: Fläche an der Wasserlinie (Höhe 0) abschneiden, damit die Küste glatt statt treppig ist
      if (Math.min(h00, h10, h01, h11) < 0) {
        const rand = [];
        for (let k = 0; k < 4; k++) {
          const A = P[k], B = P[(k + 1) % 4];
          if (A[1] >= 0) rand.push(A[0], A[1], A[2]);
          if (A[1] >= 0 !== B[1] >= 0) {
            const t = A[1] / (A[1] - B[1]);
            rand.push(A[0] + (B[0] - A[0]) * t, 0, A[2] + (B[2] - A[2]) * t);
          }
        }
        kueste[c] = Float32Array.from(rand);
      }
    }
  }
  return {
    nx, nz, cx, cz, X, Z, H, min, max, licht, linien, kueste,
    land: Int32Array.from(land), wellen: Int32Array.from(wellen), meer: min < 0.5,
  };
}

function baueWeg(m) {
  if (!m.weg) return [];
  const pkt = m.weg.punkte().map((p) => ({ ...p }));
  let laenge = 0;
  pkt[0].s = 0;
  for (let i = 1; i < pkt.length; i++) {
    laenge += Math.hypot(pkt[i].x - pkt[i - 1].x, pkt[i].y - pkt[i - 1].y, pkt[i].z - pkt[i - 1].z);
    pkt[i].s = laenge;
  }
  pkt.forEach((p) => (p.anteil = p.s / laenge));
  return pkt;
}

// ---- Darstellung -------------------------------------------------------------------------------------

export function starten(buehne, m) {
  buehne.innerHTML = '';
  buehne.classList.add('modell__buehne--aktiv');

  const weg = baueWeg(m);
  const SEG = Math.max(0, weg.length - 1);
  const nurDrehen = !SEG || m.bedienung === 'drehen';
  const g = baueGitter(m);
  const ueber = m.ueberhoehung ?? 1.5;
  const hoeheMax = m.hoeheMax ?? (SEG ? Math.max(...weg.map((p) => p.y)) : g.max);
  const bereich = m.bereich;
  const mitte = m.mitte ?? {
    x: (bereich.x[0] + bereich.x[1]) / 2,
    y: hoeheMax * 0.4,
    z: (bereich.z[0] + bereich.z[1]) / 2,
  };
  const radius = Math.hypot(bereich.x[1] - bereich.x[0], bereich.z[1] - bereich.z[0]) / 2;
  const sockelBasis = Math.min(0, g.min) - Math.max(20, (g.max - Math.min(0, g.min)) * 0.08);
  const abschnitte = m.abschnitte ?? [{ bis: 1, art: 'pfad' }];
  const stufenGesamt = abschnitte.filter((a) => a.art === 'stufen').reduce((s, a) => s + a.anzahl, 0);
  const stufenEinheit = abschnitte.find((a) => a.art === 'stufen')?.einheit ?? 'Stufe';

  // Anteil am Weg -> Abschnitt, Stufenzahl
  function abschnittBei(anteil) {
    let von = 0;
    for (const a of abschnitte) {
      if (anteil <= a.bis + 1e-9) return { a, von };
      von = a.bis;
    }
    return { a: abschnitte[abschnitte.length - 1], von };
  }
  function stufenBei(anteil) {
    let n = 0, von = 0;
    for (const a of abschnitte) {
      const bis = Math.min(a.bis, anteil);
      if (a.art === 'stufen' && bis > von) n += a.anzahl * ((bis - von) / (a.bis - von));
      von = a.bis;
      if (anteil <= a.bis) break;
    }
    return n;
  }
  function anteilBeiStufe(stufe) {
    let rest = stufe, von = 0;
    for (const a of abschnitte) {
      if (a.art === 'stufen') {
        if (rest <= a.anzahl) return von + (a.bis - von) * (rest / a.anzahl);
        rest -= a.anzahl;
      }
      von = a.bis;
    }
    return 1;
  }
  function punktBei(anteil) {
    const i = Math.min(SEG - 1, Math.max(0, Math.floor(anteil * SEG)));
    const a = weg[i], c = weg[i + 1];
    const t = Math.min(1, Math.max(0, (anteil - a.anteil) / (c.anteil - a.anteil || 1)));
    return { x: a.x + (c.x - a.x) * t, y: a.y + (c.y - a.y) * t, z: a.z + (c.z - a.z) * t };
  }
  function anteilBeiHoehe(h) {
    for (let i = 1; i < weg.length; i++) if (weg[i].y >= h) return weg[i].anteil;
    return 1;
  }

  // Abschnittsart und Stufen-Marker pro Wegstück einmal vorab statt in jedem Bild
  const segStufen = new Uint8Array(SEG);
  const segPunkt = new Uint8Array(SEG);
  for (let i = 0; i < SEG; i++) {
    segStufen[i] = abschnittBei((i + 0.5) / SEG).a.art === 'stufen' ? 1 : 0;
    if (segStufen[i] && Math.floor(stufenBei((i + 1) / SEG) / 100) > Math.floor(stufenBei(i / SEG) / 100)) segPunkt[i] = 1;
  }

  // Oberfläche
  const blatt = document.createElement('div');
  blatt.className = 'modell__blatt';
  const leinwand = document.createElement('canvas');
  leinwand.className = 'modell__leinwand';
  leinwand.tabIndex = 0;
  leinwand.setAttribute('role', 'img');
  leinwand.setAttribute(
    'aria-label',
    `${m.beschreibung || m.titel}. ${nurDrehen ? 'Mit der Maus ziehen oder den Pfeiltasten drehen.' : 'Mit der Maus ziehen oder den Pfeiltasten drehen, mit Plus und Minus zoomen.'}`,
  );
  blatt.append(leinwand);

  const kopf = document.createElement('div');
  kopf.className = 'modell__bedienung';
  if (nurDrehen) {
    // Eintragskopf mit festen Werten, per DOM statt innerHTML, weil Werte aus fremden Daten kommen können
    const dl = document.createElement('dl');
    dl.className = 'modell__kopf';
    for (const k of m.kopf || []) {
      const zeile = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = k.name;
      dd.textContent = k.wert;
      if (k.klein) dd.append(Object.assign(document.createElement('small'), { textContent: ` ${k.klein}` }));
      zeile.append(dt, dd);
      dl.append(zeile);
    }
    const hilfe = Object.assign(document.createElement('p'), {
      className: 'modell__hinweis',
      textContent: 'Zum Drehen am Bild ziehen oder die Pfeiltasten nutzen.',
    });
    if (dl.children.length) kopf.append(dl);
    kopf.append(hilfe);
  } else {
    const zeilen = [['Weg', 'weg'], ...(stufenGesamt ? [[stufenEinheit === 'Stufe' ? 'Stufen' : stufenEinheit, 'stufe']] : []), ['Höhe', 'hoehe']];
    kopf.innerHTML = `
      <dl class="modell__kopf">
        ${zeilen.map(([name, id]) => `<div><dt>${name}</dt><dd data-wert="${id}"></dd></div>`).join('')}
      </dl>
      <label class="modell__regler">
        <span class="modell__regler-name">Auf dem Weg</span>
        <input type="range" min="0" max="${m.weg.meter}" step="1" value="0" aria-label="Position auf dem Weg in Metern" />
      </label>
      <p class="modell__hinweis" data-hinweis></p>
      <div class="modell__knoepfe">
        <button type="button" data-aktion="abspielen">Hinaufwandern</button>
        <button type="button" data-aktion="zuruecksetzen">Ansicht zurücksetzen</button>
      </div>`;
  }
  buehne.append(blatt, kopf);

  const ctx = leinwand.getContext('2d');

  const START = { gier: m.ansicht?.gier ?? -0.25, neigung: m.ansicht?.neigung ?? 0.42, zoom: m.ansicht?.zoom ?? 1 };
  let ansicht = { ...START };
  let position = 0;
  let farben = palette(buehne);
  let b = 0, h = 0, dpr = 1;
  let hoehe0 = 0.58; // senkrechte Lage der Mitte als Anteil der Blatthöhe
  let geplant = false;
  const neuZeichnen = () => {
    if (geplant) return;
    geplant = true;
    requestAnimationFrame(() => {
      geplant = false;
      zeichnen();
    });
  };

  function groesse() {
    const r = leinwand.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    b = Math.max(260, r.width);
    h = r.height;
    leinwand.width = Math.round(b * dpr);
    leinwand.height = Math.round(h * dpr);
    if (m.einpassen) einpassen();
    neuZeichnen();
  }

  /** Startansicht: Quader um das Gelände projizieren und dessen Mitte senkrecht ins Blatt setzen */
  function einpassen() {
    const merken = ansicht;
    ansicht = { ...START };
    hoehe0 = 0.58;
    kamera();
    let oben = Infinity, unten = -Infinity;
    for (const x of bereich.x) for (const z of bereich.z) for (const y of [m.sockel ? sockelBasis : 0, hoeheMax]) {
      P(x, y, z);
      oben = Math.min(oben, aus.sy);
      unten = Math.max(unten, aus.sy);
    }
    hoehe0 += (0.53 * h - (oben + unten) / 2) / h;
    ansicht = merken;
  }

  // Kamera: wird pro Bild einmal gesetzt, P() projiziert dann ohne neue Objekte (Ergebnis in `aus`)
  let cg = 1, sg = 0, cn = 1, sn = 0, D = 1, skala = 1;
  const aus = { sx: 0, sy: 0, tiefe: 0 };
  function kamera() {
    cg = Math.cos(ansicht.gier); sg = Math.sin(ansicht.gier);
    cn = Math.cos(ansicht.neigung); sn = Math.sin(ansicht.neigung);
    D = radius * 3.1;
    skala = (Math.min(b, h * 1.5) / (radius * 1.45)) * 0.8 * ansicht.zoom;
  }
  function P(x, y, z, ziel = aus) {
    x -= mitte.x; y = (y - mitte.y) * ueber; z -= mitte.z;
    const x1 = x * cg + z * sg;
    const z1 = -x * sg + z * cg;
    const y2 = y * cn - z1 * sn;
    const z2 = y * sn + z1 * cn; // größer = näher an der Kamera
    const p = D / (D - z2);
    ziel.sx = b / 2 + x1 * p * skala;
    ziel.sy = h * hoehe0 - y2 * p * skala;
    ziel.tiefe = z2;
    return ziel;
  }
  const kopie = (x, y, z) => P(x, y, z, {});

  // Puffer, die zwischen den Bildern wiederverwendet werden
  const nV = g.nx * g.nz;
  const SX = new Float32Array(nV), SY = new Float32Array(nV), T = new Float32Array(nV);
  const nObj = g.land.length + SEG;
  const tiefe = new Float32Array(nObj);
  const reihe = Array.from({ length: nObj }, (_, k) => k);
  const nachTiefe = (u, v) => tiefe[u] - tiefe[v];

  // ---- Zeichnen -----
  function zettel(text, sx, sy, { drehung = -2, schrift = 'hand', groesse: gr = 16, farbe, rand = true } = {}) {
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate((drehung * Math.PI) / 180);
    ctx.font = `${gr}px ${schrift === 'hand' ? farben.schriftHand : farben.schriftKopf}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 14;
    const hh = gr + 8;
    if (rand) {
      ctx.fillStyle = rgb(farben.papier2, 0.96);
      ctx.strokeStyle = rgb(farben.linie);
      ctx.lineWidth = 1;
      ctx.shadowColor = 'rgb(30 42 56 / 0.25)';
      ctx.shadowOffsetX = 1.5;
      ctx.shadowOffsetY = 2;
      ctx.fillRect(-w / 2, -hh / 2, w, hh);
      ctx.shadowColor = 'transparent';
      ctx.strokeRect(-w / 2 + 0.5, -hh / 2 + 0.5, w - 1, hh - 1);
    }
    ctx.fillStyle = rgb(farbe || farben.tinte);
    ctx.fillText(text, 0, 1);
    ctx.restore();
  }

  function stempel(s, sx, sy) {
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate((-6 * Math.PI) / 180);
    const w = 104, hh = 58;
    ctx.globalAlpha = 0.92;
    ctx.strokeStyle = rgb(farben.akzent);
    ctx.fillStyle = rgb(farben.akzent);
    ctx.lineWidth = 2;
    ctx.strokeRect(-w / 2, -hh / 2, w, hh);
    ctx.lineWidth = 1;
    ctx.strokeRect(-w / 2 + 4, -hh / 2 + 4, w - 8, hh - 8);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 9px system-ui, sans-serif`;
    ctx.fillText((s.kopf || '').toUpperCase().split('').join(' '), 0, -hh / 2 + 13);
    ctx.font = `22px ${farben.schriftKopf}`;
    ctx.fillText(s.titel || '', 0, 3);
    if (s.zusatz) {
      ctx.font = `600 9px system-ui, sans-serif`;
      ctx.fillText(s.zusatz.length > 18 ? `${s.zusatz.slice(0, 17)}…` : s.zusatz, 0, hh / 2 - 12);
    }
    ctx.restore();
  }

  function rahmen() {
    ctx.strokeStyle = rgb(farben.linie);
    ctx.lineWidth = 1;
    ctx.strokeRect(9.5, 9.5, b - 19, h - 19);
    ctx.strokeRect(13.5, 13.5, b - 27, h - 27);
  }

  /** Kompassnadel oben rechts, zeigt nach Norden (−z) und dreht mit der Ansicht */
  function nordpfeil() {
    const a = kopie(mitte.x, 0, mitte.z);
    const n = P(mitte.x, 0, mitte.z - radius * 0.25);
    const winkel = Math.atan2(n.sy - a.sy, n.sx - a.sx);
    const r = 15;
    ctx.save();
    ctx.translate(b - 42, 46);
    ctx.strokeStyle = rgb(farben.linie);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r + 4, 0, 7);
    ctx.stroke();
    ctx.rotate(winkel);
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(0, -4);
    ctx.lineTo(0, 4);
    ctx.closePath();
    ctx.fillStyle = rgb(farben.akzent);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(0, -4);
    ctx.lineTo(0, 4);
    ctx.closePath();
    ctx.fillStyle = rgb(farben.tinte);
    ctx.fill();
    ctx.translate(r + 13, 0);
    ctx.rotate(-winkel);
    ctx.fillStyle = rgb(farben.tinte);
    ctx.font = `14px ${farben.schriftKopf}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', 0, 1);
    ctx.restore();
  }

  /** Schnittkanten am Rand des Ausschnitts, nur die zur Kamera gewandten (die anderen verdeckt das Gelände) */
  function sockel() {
    const { nx, nz } = g;
    const kanten = [
      { n: [0, -1], punkte: Array.from({ length: nx }, (_, i) => i) },
      { n: [0, 1], punkte: Array.from({ length: nx }, (_, i) => (nz - 1) * nx + i) },
      { n: [-1, 0], punkte: Array.from({ length: nz }, (_, j) => j * nx) },
      { n: [1, 0], punkte: Array.from({ length: nz }, (_, j) => j * nx + nx - 1) },
    ];
    const unten = (v) => P(g.X[v % nx], sockelBasis, g.Z[(v / nx) | 0]);
    for (const k of kanten) {
      if (-k.n[0] * sg + k.n[1] * cg < 0.12) continue; // abgewandt oder fast genau von der Kante gesehen
      const pk = k.punkte;
      ctx.beginPath();
      ctx.moveTo(SX[pk[0]], SY[pk[0]]);
      for (let q = 1; q < pk.length; q++) ctx.lineTo(SX[pk[q]], SY[pk[q]]);
      for (let q = pk.length - 1; q >= 0; q--) {
        unten(pk[q]);
        ctx.lineTo(aus.sx, aus.sy);
      }
      ctx.closePath();
      ctx.fillStyle = farben.sockel;
      ctx.fill();
      // Schraffur wie bei einem Geländeschnitt
      ctx.beginPath();
      for (let q = 2; q < pk.length - 1; q += 3) {
        ctx.moveTo(SX[pk[q]], SY[pk[q]]);
        unten(pk[q]);
        ctx.lineTo(aus.sx, aus.sy);
      }
      ctx.strokeStyle = rgb(farben.tinte, 0.16);
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(SX[pk[0]], SY[pk[0]]);
      for (let q = 1; q < pk.length; q++) ctx.lineTo(SX[pk[q]], SY[pk[q]]);
      ctx.strokeStyle = rgb(farben.tinte, 0.6);
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.beginPath();
      for (const q of [0, pk.length - 1]) {
        ctx.moveTo(SX[pk[q]], SY[pk[q]]);
        unten(pk[q]);
        ctx.lineTo(aus.sx, aus.sy);
      }
      unten(pk[0]);
      ctx.moveTo(aus.sx, aus.sy);
      for (let q = 1; q < pk.length; q++) {
        unten(pk[q]);
        ctx.lineTo(aus.sx, aus.sy);
      }
      ctx.strokeStyle = rgb(farben.tinte, 0.45);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function zellenPfad(c) {
    const v = ((c / g.cx) | 0) * g.nx + (c % g.cx);
    const n = g.nx;
    ctx.moveTo(SX[v], SY[v]);
    ctx.lineTo(SX[v + 1], SY[v + 1]);
    ctx.lineTo(SX[v + n + 1], SY[v + n + 1]);
    ctx.lineTo(SX[v + n], SY[v + n]);
    ctx.closePath();
  }

  const LINIEN_ALPHA = [0.28, 0.55, 1];
  const LINIEN_BREITE = [0.7, 1.05, 1.5];
  function hoehenlinien(c, dicke) {
    const lin = g.linien[c];
    if (!lin) return;
    for (let art = 0; art < 3; art++) {
      const l = lin[art];
      if (!l) continue;
      ctx.beginPath();
      for (let k = 0; k < l.length; k += 6) {
        P(l[k], l[k + 1], l[k + 2]);
        ctx.moveTo(aus.sx, aus.sy);
        P(l[k + 3], l[k + 4], l[k + 5]);
        ctx.lineTo(aus.sx, aus.sy);
      }
      ctx.strokeStyle = art === 2 ? rgb(farben.meer) : rgb(farben.tinte, LINIEN_ALPHA[art]);
      ctx.lineWidth = LINIEN_BREITE[art] * dicke;
      ctx.stroke();
    }
  }

  function zeichnen() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = rgb(farben.papier2);
    ctx.fillRect(0, 0, b, h);
    kamera();

    // Jeden Gitterpunkt genau einmal projizieren
    for (let j = 0, v = 0; j < g.nz; j++) {
      for (let i = 0; i < g.nx; i++, v++) {
        P(g.X[i], g.H[v], g.Z[j]);
        SX[v] = aus.sx; SY[v] = aus.sy; T[v] = aus.tiefe;
      }
    }
    const dicke = Math.max(0.7, ansicht.zoom * 0.9);

    // Meer: eine Ebene auf Höhe 0 über den ganzen Ausschnitt, liegt hinter allem Land
    if (g.meer) {
      const [x0, x1] = bereich.x, [z0, z1] = bereich.z;
      ctx.beginPath();
      for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) {
        P(x, 0, z);
        ctx.lineTo(aus.sx, aus.sy);
      }
      ctx.closePath();
      ctx.fillStyle = rgb(farben.wasser);
      ctx.fill();
      ctx.beginPath();
      for (const c of g.wellen) {
        const mx = (g.X[c % g.cx] + g.X[(c % g.cx) + 1]) / 2;
        const mz = (g.Z[(c / g.cx) | 0] + g.Z[((c / g.cx) | 0) + 1]) / 2;
        const w0 = kopie(mx - 12, 0, mz), w1 = P(mx + 12, 0, mz);
        ctx.moveTo(w0.sx, w0.sy);
        ctx.quadraticCurveTo((w0.sx + w1.sx) / 2, w0.sy - 2.2, w1.sx, w1.sy);
      }
      ctx.strokeStyle = rgb(farben.meer, 0.5);
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Land und Weg von hinten nach vorne
    const L = g.land.length;
    for (let k = 0; k < L; k++) {
      const c = g.land[k];
      const v = ((c / g.cx) | 0) * g.nx + (c % g.cx);
      tiefe[k] = (T[v] + T[v + 1] + T[v + g.nx] + T[v + g.nx + 1]) * 0.25;
    }
    const wegPunkte = SEG ? weg.map((p) => kopie(p.x, p.y + 2, p.z)) : [];
    for (let i = 0; i < SEG; i++) tiefe[L + i] = (wegPunkte[i].tiefe + wegPunkte[i + 1].tiefe) / 2 + radius * 0.07;
    reihe.sort(nachTiefe);

    ctx.lineWidth = 1;
    for (const o of reihe) {
      if (o < L) {
        const c = g.land[o];
        const fl = farben.flaechen[g.licht[c]];
        ctx.beginPath();
        const rand = g.kueste[c];
        if (rand) {
          for (let k = 0; k < rand.length; k += 3) {
            P(rand[k], rand[k + 1], rand[k + 2]);
            ctx.lineTo(aus.sx, aus.sy);
          }
          ctx.closePath();
        } else zellenPfad(c);
        ctx.fillStyle = fl;
        ctx.fill();
        ctx.strokeStyle = fl;
        ctx.lineWidth = 1;
        ctx.stroke();
        hoehenlinien(c, dicke);
      } else {
        const i = o - L;
        const a = wegPunkte[i], c = wegPunkte[i + 1];
        // Saum mit geraden Enden, sonst übermalt er das rote Ende des vorigen Stücks
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(c.sx, c.sy);
        ctx.strokeStyle = rgb(farben.papier2, 0.95);
        ctx.lineWidth = 6 * dicke;
        ctx.stroke();
        ctx.lineCap = 'round';
        ctx.strokeStyle = rgb(farben.akzent);
        ctx.lineWidth = (i < position * SEG ? 3.6 : 2.6) * dicke;
        ctx.setLineDash(segStufen[i] ? [] : [5, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        if (segPunkt[i]) {
          ctx.beginPath();
          ctx.arc(c.sx, c.sy, 3.4 * dicke, 0, 7);
          ctx.fillStyle = rgb(farben.papier2);
          ctx.fill();
          ctx.strokeStyle = rgb(farben.tinte);
          ctx.lineWidth = 1.1;
          ctx.stroke();
        }
        ctx.lineCap = 'butt';
      }
    }

    if (m.sockel) sockel();

    // Marken und Zettel liegen über allem
    const proj = (anteil, hoch = 0) => {
      const q = punktBei(anteil);
      return kopie(q.x, q.y + 2 + hoch, q.z);
    };
    for (const k of SEG ? m.stufenmarken || [] : []) {
      const q = proj(anteilBeiStufe(k));
      zettel(`${k.toLocaleString('de-AT')}`, q.sx + 24, q.sy + 16, { groesse: 14, drehung: 2, farbe: farben.leise, rand: false });
    }
    for (const k of SEG ? m.hoehenmarken || [] : []) {
      const q = proj(anteilBeiHoehe(k));
      zettel(`${k} m`, q.sx - 28, q.sy - 10, { groesse: 14, drehung: -3, farbe: farben.leise, rand: false });
    }
    for (const k of m.marken || []) {
      if (k.t !== undefined && !SEG) continue;
      const q = k.t !== undefined ? proj(k.t) : kopie(k.x, k.y + 2, k.z);
      if (k.art === 'fahne') {
        ctx.beginPath();
        ctx.moveTo(q.sx, q.sy);
        ctx.lineTo(q.sx, q.sy - 22);
        ctx.strokeStyle = rgb(farben.tinte);
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(q.sx, q.sy - 22);
        ctx.lineTo(q.sx + 13, q.sy - 18);
        ctx.lineTo(q.sx, q.sy - 13);
        ctx.closePath();
        ctx.fillStyle = rgb(farben.akzent);
        ctx.fill();
        zettel(k.text, q.sx, q.sy - 40, { drehung: -2 });
      } else {
        zettel(k.text, q.sx, q.sy - 22, { drehung: 1.5 });
        ctx.beginPath();
        ctx.moveTo(q.sx, q.sy - 12);
        ctx.lineTo(q.sx, q.sy);
        ctx.strokeStyle = rgb(farben.tinte);
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }

    // Marker für die aktuelle Position: Stecknadel in Stempelrot
    if (SEG) {
      const q = proj(position);
      ctx.beginPath();
      ctx.arc(q.sx, q.sy, 8.5, 0, 7);
      ctx.fillStyle = rgb(farben.papier2);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = rgb(farben.akzent);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(q.sx, q.sy, 3, 0, 7);
      ctx.fillStyle = rgb(farben.tinte);
      ctx.fill();
    }

    rahmen();
    if (m.nordpfeil) nordpfeil();
    // Titelzettel oben links
    ctx.save();
    ctx.translate(24, 26);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = rgb(farben.tinte);
    ctx.font = `${Math.round(Math.min(30, Math.max(22, b / 24)))}px ${farben.schriftKopf}`;
    ctx.fillText(m.titel, 0, 18);
    if (m.untertitel && b > 480) {
      ctx.font = `17px ${farben.schriftHand}`;
      ctx.fillStyle = rgb(farben.leise);
      ctx.fillText(m.untertitel, 0, 40);
    }
    ctx.restore();
    if (m.stempel && b > 420) stempel(m.stempel, b - 78, h - 52);
  }

  // ---- Bedienung: Drehen (immer) -----
  const zeiger = new Map();
  let letzterAbstand = 0;
  const kippen = (n) => Math.min(1.35, Math.max(0.05, n));
  const zoomen = (z) => Math.min(2.6, Math.max(0.6, z));
  leinwand.addEventListener('pointerdown', (e) => {
    leinwand.setPointerCapture(e.pointerId);
    zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY });
    letzterAbstand = 0;
  });
  leinwand.addEventListener('pointermove', (e) => {
    const alt = zeiger.get(e.pointerId);
    if (!alt) return;
    const neu = { x: e.clientX, y: e.clientY };
    if (zeiger.size === 1) {
      ansicht.gier += (neu.x - alt.x) * 0.008;
      ansicht.neigung = kippen(ansicht.neigung + (neu.y - alt.y) * 0.006);
    } else if (zeiger.size === 2 && !nurDrehen) {
      zeiger.set(e.pointerId, neu);
      const [p, q] = [...zeiger.values()];
      const abstand = Math.hypot(p.x - q.x, p.y - q.y);
      if (letzterAbstand) ansicht.zoom = zoomen(ansicht.zoom * (abstand / letzterAbstand));
      letzterAbstand = abstand;
    }
    zeiger.set(e.pointerId, neu);
    neuZeichnen();
  });
  const loslassen = (e) => zeiger.delete(e.pointerId);
  leinwand.addEventListener('pointerup', loslassen);
  leinwand.addEventListener('pointercancel', loslassen);
  leinwand.addEventListener('keydown', (e) => {
    const s = { ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, -0.06], ArrowDown: [0, 0.06] }[e.key];
    if (s) {
      e.preventDefault();
      ansicht.gier += s[0];
      ansicht.neigung = kippen(ansicht.neigung + s[1]);
    } else if (!nurDrehen && (e.key === '+' || e.key === '=')) ansicht.zoom = zoomen(ansicht.zoom * 1.12);
    else if (!nurDrehen && e.key === '-') ansicht.zoom = zoomen(ansicht.zoom / 1.12);
    else return;
    neuZeichnen();
  });

  // ---- Bedienung: Zoom, Weg, Hinaufwandern (nur im vollen Modus) -----
  if (!nurDrehen) {
    const regler = kopf.querySelector('input');
    const wertEl = (id) => kopf.querySelector(`[data-wert="${id}"]`);
    const hinweis = kopf.querySelector('[data-hinweis]');
    const anzeigen = () => {
      const q = punktBei(position);
      const meter = Math.round(position * m.weg.meter);
      wertEl('weg').textContent = `${meter.toLocaleString('de-AT')} m`;
      const se = wertEl('stufe');
      if (se) se.innerHTML = `${Math.round(stufenBei(position)).toLocaleString('de-AT')}<small> von ${stufenGesamt.toLocaleString('de-AT')}</small>`;
      wertEl('hoehe').textContent = `${Math.round(Math.min(hoeheMax, q.y))} m`;
      const { a } = abschnittBei(position);
      hinweis.textContent = a.art !== 'stufen' && position > 0 && a.name ? `Dieser Abschnitt: ${a.name}.` : '';
    };
    const setzePosition = (p) => {
      position = Math.min(1, Math.max(0, p));
      regler.value = String(Math.round(position * m.weg.meter));
      anzeigen();
      neuZeichnen();
    };
    regler.addEventListener('input', () => {
      stoppen();
      setzePosition(Number(regler.value) / m.weg.meter);
    });
    leinwand.addEventListener('wheel', (e) => {
      e.preventDefault();
      ansicht.zoom = zoomen(ansicht.zoom * Math.exp(-e.deltaY * 0.0015));
      neuZeichnen();
    }, { passive: false });

    let lauf = 0;
    const abspielen = kopf.querySelector('[data-aktion="abspielen"]');
    function stoppen() {
      cancelAnimationFrame(lauf);
      lauf = 0;
      abspielen.textContent = 'Hinaufwandern';
    }
    abspielen.addEventListener('click', () => {
      if (lauf) return stoppen();
      if (position >= 1) setzePosition(0);
      abspielen.textContent = 'Anhalten';
      let zuletzt = performance.now();
      const dauer = (m.weg.dauer ?? 22) * 1000;
      const schritt = (jetzt) => {
        setzePosition(position + (jetzt - zuletzt) / dauer);
        zuletzt = jetzt;
        if (position >= 1) return stoppen();
        lauf = requestAnimationFrame(schritt);
      };
      lauf = requestAnimationFrame(schritt);
    });
    kopf.querySelector('[data-aktion="zuruecksetzen"]').addEventListener('click', () => {
      ansicht = { ...START };
      neuZeichnen();
    });
    anzeigen();
  }

  // Hell/Dunkel-Wechsel und späte Schriften
  const farbschema = window.matchMedia('(prefers-color-scheme: dark)');
  farbschema.addEventListener?.('change', () => {
    farben = palette(buehne);
    neuZeichnen();
  });
  document.fonts?.ready.then(() => {
    farben = palette(buehne);
    neuZeichnen();
  });

  new ResizeObserver(groesse).observe(leinwand);
  groesse();
}
