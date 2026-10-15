/**
 * Kern der 3D-Modelle: zeichnet ein Gelände mit Weg als Skizze im Logbuch-Stil (Papier, Tinte, Höhenlinien,
 * Stempelrot, Handschrift). Reines Canvas 2D, keine Bibliothek, gezeichnet wird nur nach Eingabe.
 *
 * Ein Modell ist eine Datei in src/scripts/modelle/, die ein Objekt exportiert (default). Der Kern kümmert
 * sich um Darstellung, Bedienung (Drehen, Zoomen, Regler, Hinaufwandern), Dunkelmodus und Tastatur.
 *
 *   export default {
 *     titel: 'Reinebringen',                 // Zettel oben links (Überschriftenschrift)
 *     untertitel: 'Stufenweg, Skizze',       // darunter in Handschrift
 *     bereich: { x: [-760, 760], z: [-520, 900], nx: 86, nz: 80 },   // Ausschnitt in m, Gitterpunkte
 *     hoehe: (x, z) => 0,                    // Geländehöhe in m (unter 0 = Wasser)
 *     ueberhoehung: 1.5,                     // Faktor für die Höhe in der Darstellung
 *     hoeheMax: 484,                         // höchster Punkt, bestimmt Bildausschnitt
 *     ansicht: { gier: -0.25, neigung: 0.42, zoom: 1 },
 *     hoehenlinien: { abstand: 25, stark: 100 },
 *     weg: {
 *       meter: 1100,                         // Länge des Wegs in m (nominal)
 *       punkte: () => [{ x, y, z }, ...],    // Weg von unten nach oben, ca. 300 Punkte, y in m
 *       dauer: 22,                           // Sekunden für „Hinaufwandern“
 *     },
 *     abschnitte: [                          // Anteile 0..1 am Weg, aufsteigend
 *       { bis: 0.909, art: 'stufen', anzahl: 1978, einheit: 'Stufe' },
 *       { bis: 1, art: 'pfad', name: 'ohne Stufen' },
 *     ],
 *     marken: [{ t: 0, text: 'Start · Reine' }, { t: 1, text: 'Gipfel · 484 m', art: 'fahne' }],
 *     stufenmarken: [500, 1000, 1500],       // optionale Beschriftungen entlang des Wegs
 *     hoehenmarken: [100, 200, 300, 400],    // optionale Beschriftungen in Höhenmetern
 *     stempel: { kopf: 'Gipfel', titel: '484 m', zusatz: 'ü. M.' },   // Passstempel unten rechts
 *     beschreibung: 'Text für Screenreader',
 *   };
 *
 * Meta-Angaben für den Artikel (Vorschau-Text, Bildunterschrift) stehen in meta.mjs.
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
  p.lichtFarbe = hell ? p.papier2 : mische(p.papier2, p.linie, 0.85);
  p.schattenFarbe = hell ? mische(p.papier2, p.linie, 0.95) : p.papier;
  p.wasser = mische(p.papier2, p.meer, hell ? 0.2 : 0.35);
  p.schriftHand = getComputedStyle(el).getPropertyValue('--hand').trim() || 'cursive';
  p.schriftKopf = getComputedStyle(el).getPropertyValue('--serif-kopf').trim() || 'serif';
  return p;
}

// ---- Gitter, Höhenlinien -----------------------------------------------------------------------------

function baueGitter(m) {
  const { x: [x0, x1], z: [z0, z1], nx, nz } = m.bereich;
  const px = (i) => x0 + ((x1 - x0) * i) / (nx - 1);
  const pz = (j) => z0 + ((z1 - z0) * j) / (nz - 1);
  const hoehe = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) hoehe[j * nx + i] = m.hoehe(px(i), pz(j));

  const { abstand = 25, stark = 100 } = m.hoehenlinien || {};
  const sonne = [-0.45, 0.8, 0.4];
  const sl = Math.hypot(...sonne);
  const zellen = [];

  const dreieck = (A, B, C, lin) => {
    const lo = Math.min(A[1], B[1], C[1]), hi = Math.max(A[1], B[1], C[1]);
    for (let L = Math.ceil((lo + 0.001) / abstand) * abstand; L < hi; L += abstand) {
      const pkt = [];
      for (const [P, Q] of [[A, B], [B, C], [C, A]]) {
        const a = P[1] - L - 0.001, b = Q[1] - L - 0.001;
        if (a * b < 0) {
          const t = a / (a - b);
          pkt.push([P[0] + (Q[0] - P[0]) * t, L, P[2] + (Q[2] - P[2]) * t]);
        }
      }
      if (pkt.length === 2) lin.push({ a: pkt[0], b: pkt[1], stark: L % stark === 0, kueste: L === 0 });
    }
  };

  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const hh = (di, dj) => hoehe[(j + dj) * nx + i + di];
      const [h00, h10, h01, h11] = [hh(0, 0), hh(1, 0), hh(0, 1), hh(1, 1)];
      const mitte = (h00 + h10 + h01 + h11) / 4;
      const wasser = mitte < 0.5;
      const dx = px(i + 1) - px(i), dz = pz(j + 1) - pz(j);
      const nxv = -((h10 + h11) - (h00 + h01)) / (2 * dx);
      const nzv = -((h01 + h11) - (h00 + h10)) / (2 * dz);
      const nl = Math.hypot(nxv, 1, nzv);
      const licht = Math.max(0, ((nxv / nl) * sonne[0] + (1 / nl) * sonne[1] + (nzv / nl) * sonne[2]) / sl);
      const P = [[px(i), h00, pz(j)], [px(i + 1), h10, pz(j)], [px(i + 1), h11, pz(j + 1)], [px(i), h01, pz(j + 1)]];
      const lin = [];
      if (!wasser || Math.min(h00, h10, h01, h11) < 0.5) {
        dreieck(P[0], P[1], P[2], lin);
        dreieck(P[0], P[2], P[3], lin);
      }
      zellen.push({
        P, wasser, licht, lin,
        mx: (px(i) + px(i + 1)) / 2, my: wasser ? 0 : mitte, mz: (pz(j) + pz(j + 1)) / 2,
        welle: wasser && (i * 3 + j * 5) % 11 === 0,
      });
    }
  }
  return zellen;
}

function baueWeg(m) {
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
  const SEG = weg.length - 1;
  const zellen = baueGitter(m);
  const ueber = m.ueberhoehung ?? 1.5;
  const hoeheMax = m.hoeheMax ?? Math.max(...weg.map((p) => p.y));
  const bereich = m.bereich;
  const mitte = m.mitte ?? {
    x: (bereich.x[0] + bereich.x[1]) / 2,
    y: hoeheMax * 0.4,
    z: (bereich.z[0] + bereich.z[1]) / 2,
  };
  const radius = Math.hypot(bereich.x[1] - bereich.x[0], bereich.z[1] - bereich.z[0]) / 2;
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

  // Oberfläche
  const blatt = document.createElement('div');
  blatt.className = 'modell__blatt';
  const leinwand = document.createElement('canvas');
  leinwand.className = 'modell__leinwand';
  leinwand.tabIndex = 0;
  leinwand.setAttribute('role', 'img');
  leinwand.setAttribute(
    'aria-label',
    `${m.beschreibung || m.titel}. Mit der Maus ziehen oder den Pfeiltasten drehen, mit Plus und Minus zoomen.`,
  );
  blatt.append(leinwand);

  const kopf = document.createElement('div');
  kopf.className = 'modell__bedienung';
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
  buehne.append(blatt, kopf);

  const regler = kopf.querySelector('input');
  const wertEl = (id) => kopf.querySelector(`[data-wert="${id}"]`);
  const hinweis = kopf.querySelector('[data-hinweis]');
  const ctx = leinwand.getContext('2d');

  const START = { gier: m.ansicht?.gier ?? -0.25, neigung: m.ansicht?.neigung ?? 0.42, zoom: m.ansicht?.zoom ?? 1 };
  let ansicht = { ...START };
  let position = 0;
  let farben = palette(buehne);
  let b = 0, h = 0, dpr = 1;
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
    neuZeichnen();
  }

  function projektion() {
    const cg = Math.cos(ansicht.gier), sg = Math.sin(ansicht.gier);
    const cn = Math.cos(ansicht.neigung), sn = Math.sin(ansicht.neigung);
    const D = radius * 3.1;
    const skala = (Math.min(b, h * 1.5) / (radius * 1.45)) * 0.8 * ansicht.zoom;
    return (x, y, z) => {
      x -= mitte.x; y = y * ueber - mitte.y * ueber; z -= mitte.z;
      const x1 = x * cg + z * sg;
      const z1 = -x * sg + z * cg;
      const y2 = y * cn - z1 * sn;
      const z2 = y * sn + z1 * cn; // größer = näher an der Kamera
      const p = D / (D - z2);
      return { sx: b / 2 + x1 * p * skala, sy: h * 0.58 - y2 * p * skala, tiefe: z2 };
    };
  }

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
      ctx.fillText(s.zusatz, 0, hh / 2 - 12);
    }
    ctx.restore();
  }

  function rahmen() {
    ctx.strokeStyle = rgb(farben.linie);
    ctx.lineWidth = 1;
    ctx.strokeRect(9.5, 9.5, b - 19, h - 19);
    ctx.strokeRect(13.5, 13.5, b - 27, h - 27);
  }

  function zeichnen() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, b, h);
    ctx.fillStyle = rgb(farben.papier2);
    ctx.fillRect(0, 0, b, h);
    const P = projektion();

    const objekte = [];
    for (const z of zellen) {
      objekte.push({ t: P(z.mx, z.my, z.mz).tiefe, z, bild: z.P.map((q) => P(q[0], q[1], q[2])) });
    }
    for (let i = 0; i < SEG; i++) {
      const a = P(weg[i].x, weg[i].y + 2, weg[i].z);
      const c = P(weg[i + 1].x, weg[i + 1].y + 2, weg[i + 1].z);
      objekte.push({ t: (a.tiefe + c.tiefe) / 2 + radius * 0.07, i, a, c });
    }
    objekte.sort((u, v) => u.t - v.t);

    const dicke = Math.max(0.7, ansicht.zoom * 0.9);
    for (const o of objekte) {
      if (o.z) {
        const z = o.z;
        const fl = z.wasser ? farben.wasser : mische(farben.schattenFarbe, farben.lichtFarbe, 0.25 + 0.75 * Math.min(1, z.licht * 1.15));
        ctx.beginPath();
        ctx.moveTo(o.bild[0].sx, o.bild[0].sy);
        for (let k = 1; k < 4; k++) ctx.lineTo(o.bild[k].sx, o.bild[k].sy);
        ctx.closePath();
        ctx.fillStyle = rgb(fl);
        ctx.fill();
        ctx.strokeStyle = rgb(fl);
        ctx.lineWidth = 1;
        ctx.stroke();
        if (z.welle) {
          const w0 = P(z.mx - 12, 0, z.mz), w1 = P(z.mx + 12, 0, z.mz);
          ctx.beginPath();
          ctx.moveTo(w0.sx, w0.sy);
          ctx.quadraticCurveTo((w0.sx + w1.sx) / 2, w0.sy - 2.2, w1.sx, w1.sy);
          ctx.strokeStyle = rgb(farben.meer, 0.5);
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        if (z.lin.length) {
          for (const stufe of [0, 1, 2]) {
            ctx.beginPath();
            let n = 0;
            for (const l of z.lin) {
              const art = l.kueste ? 2 : l.stark ? 1 : 0;
              if (art !== stufe) continue;
              const a = P(l.a[0], l.a[1], l.a[2]), c = P(l.b[0], l.b[1], l.b[2]);
              ctx.moveTo(a.sx, a.sy);
              ctx.lineTo(c.sx, c.sy);
              n++;
            }
            if (!n) continue;
            ctx.strokeStyle = stufe === 2 ? rgb(farben.meer) : rgb(farben.tinte, stufe === 1 ? 0.55 : 0.28);
            ctx.lineWidth = (stufe === 2 ? 1.5 : stufe === 1 ? 1.05 : 0.7) * dicke;
            ctx.stroke();
          }
        }
      } else {
        const anteil = (o.i + 0.5) / SEG;
        const { a: abs } = abschnittBei(anteil);
        const stufen = abs.art === 'stufen';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(o.a.sx, o.a.sy);
        ctx.lineTo(o.c.sx, o.c.sy);
        ctx.strokeStyle = rgb(farben.papier2, 0.95);
        ctx.lineWidth = 6 * dicke;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(o.a.sx, o.a.sy);
        ctx.lineTo(o.c.sx, o.c.sy);
        ctx.strokeStyle = rgb(farben.akzent);
        ctx.lineWidth = (o.i < position * SEG ? 3.6 : 2.6) * dicke;
        ctx.setLineDash(stufen ? [] : [5, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        if (stufen) {
          const s0 = stufenBei(o.i / SEG), s1 = stufenBei((o.i + 1) / SEG);
          if (Math.floor(s1 / 100) > Math.floor(s0 / 100)) {
            ctx.beginPath();
            ctx.arc(o.c.sx, o.c.sy, 3.4 * dicke, 0, 7);
            ctx.fillStyle = rgb(farben.papier2);
            ctx.fill();
            ctx.strokeStyle = rgb(farben.tinte);
            ctx.lineWidth = 1.1;
            ctx.stroke();
          }
        }
      }
    }

    // Marken und Zettel liegen über allem
    const proj = (anteil, hoch = 0) => {
      const q = punktBei(anteil);
      return P(q.x, q.y + 2 + hoch, q.z);
    };
    for (const k of m.stufenmarken || []) {
      const q = proj(anteilBeiStufe(k));
      zettel(`${k.toLocaleString('de-AT')}`, q.sx + 24, q.sy + 16, { groesse: 14, drehung: 2, farbe: farben.leise, rand: false });
    }
    for (const k of m.hoehenmarken || []) {
      const q = proj(anteilBeiHoehe(k));
      zettel(`${k} m`, q.sx - 28, q.sy - 10, { groesse: 14, drehung: -3, farbe: farben.leise, rand: false });
    }
    for (const k of m.marken || []) {
      const q = proj(k.t);
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

    rahmen();
    // Titelzettel oben links
    ctx.save();
    ctx.translate(24, 26);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = rgb(farben.tinte);
    ctx.font = `${Math.round(Math.min(30, Math.max(22, b / 24)))}px ${farben.schriftKopf}`;
    ctx.fillText(m.titel, 0, 18);
    if (m.untertitel) {
      ctx.font = `17px ${farben.schriftHand}`;
      ctx.fillStyle = rgb(farben.leise);
      ctx.fillText(m.untertitel, 0, 40);
    }
    ctx.restore();
    if (m.stempel && b > 420) stempel(m.stempel, b - 78, h - 52);
  }

  // ---- Anzeige, Bedienung -----
  function anzeigen() {
    const q = punktBei(position);
    const meter = Math.round(position * m.weg.meter);
    wertEl('weg').textContent = `${meter.toLocaleString('de-AT')} m`;
    const se = wertEl('stufe');
    if (se) se.innerHTML = `${Math.round(stufenBei(position)).toLocaleString('de-AT')}<small> von ${stufenGesamt.toLocaleString('de-AT')}</small>`;
    wertEl('hoehe').textContent = `${Math.round(Math.min(hoeheMax, q.y))} m`;
    const { a } = abschnittBei(position);
    hinweis.textContent = a.art !== 'stufen' && position > 0 && a.name ? `Dieser Abschnitt: ${a.name}.` : '';
  }
  function setzePosition(p) {
    position = Math.min(1, Math.max(0, p));
    regler.value = String(Math.round(position * m.weg.meter));
    anzeigen();
    neuZeichnen();
  }
  regler.addEventListener('input', () => {
    stoppen();
    setzePosition(Number(regler.value) / m.weg.meter);
  });

  const zeiger = new Map();
  let letzterAbstand = 0;
  const kippen = (n) => Math.min(1.35, Math.max(0.05, n));
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
    } else if (zeiger.size === 2) {
      zeiger.set(e.pointerId, neu);
      const [p, q] = [...zeiger.values()];
      const abstand = Math.hypot(p.x - q.x, p.y - q.y);
      if (letzterAbstand) ansicht.zoom = Math.min(2.6, Math.max(0.6, ansicht.zoom * (abstand / letzterAbstand)));
      letzterAbstand = abstand;
    }
    zeiger.set(e.pointerId, neu);
    neuZeichnen();
  });
  const loslassen = (e) => zeiger.delete(e.pointerId);
  leinwand.addEventListener('pointerup', loslassen);
  leinwand.addEventListener('pointercancel', loslassen);
  leinwand.addEventListener('wheel', (e) => {
    e.preventDefault();
    ansicht.zoom = Math.min(2.6, Math.max(0.6, ansicht.zoom * Math.exp(-e.deltaY * 0.0015)));
    neuZeichnen();
  }, { passive: false });
  leinwand.addEventListener('keydown', (e) => {
    const s = { ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, -0.06], ArrowDown: [0, 0.06] }[e.key];
    if (s) {
      e.preventDefault();
      ansicht.gier += s[0];
      ansicht.neigung = kippen(ansicht.neigung + s[1]);
    } else if (e.key === '+' || e.key === '=') ansicht.zoom = Math.min(2.6, ansicht.zoom * 1.12);
    else if (e.key === '-') ansicht.zoom = Math.max(0.6, ansicht.zoom / 1.12);
    else return;
    neuZeichnen();
  });

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
  anzeigen();
}
