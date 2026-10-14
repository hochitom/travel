/**
 * Schematisches 3D-Modell des Reinebringen mit dem Stufenweg. Reines Canvas 2D, ohne Bibliothek.
 *
 * Wichtig: Das ist KEIN vermessenes Gelände. Es gibt weder Höhendaten noch einen GPS-Track dahinter.
 * Fest sind nur die Angaben von der Infotafel am Start: 484 m Höhe, 1.978 Stufen, etwa 1,1 km Weg,
 * die letzten 100 m ohne Stufen. Form des Berges und Kurven des Wegs sind frei gezeichnet.
 * Gibt es später eine GPX-Datei, ersetzt man `wegPunkt()` und `gelaende()` durch die echten Daten.
 */

const GX = [-760, 760], GZ = [-520, 900], NX = 86, NZ = 80; // Ausschnitt in m und Gitterpunkte
const GIPFEL = 484; // m
const STUFEN = 1978;
const WEG_M = 1100; // m, nominal laut Tafel
const OHNE_STUFEN_M = 100; // letzte Meter ohne Stufen
const UEBERHOEHUNG = 1.5;

// ---- Gelände ---------------------------------------------------------------------------------------

const X0 = -520; // Start des Wegs
const X1 = 520; // Gipfel
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Höhe der Kammlinie (0 am Start, 484 am Gipfel, die letzten 10 % flacher) */
function kamm(x) {
  const t = (x - X0) / (X1 - X0);
  if (t <= 0) return 0;
  if (t <= 0.9) return GIPFEL * 0.93 * Math.pow(t / 0.9, 1.3);
  if (t <= 1) return GIPFEL * (0.93 + ((t - 0.9) / 0.1) * 0.07);
  return GIPFEL * Math.pow(Math.max(0, 1 - (t - 1) / 0.35), 0.9);
}
const kammZ = (x) => 30 * Math.sin(x / 240);

function hash(i, j) {
  let h = (i * 374761393 + j * 668265263) ^ 0x5bd1e995;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function wert(x, z, skala) {
  const gx = x / skala, gz = z / skala;
  const i = Math.floor(gx), j = Math.floor(gz);
  const fx = smooth(0, 1, gx - i), fz = smooth(0, 1, gz - j);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fz;
}

function gelaende(x, z) {
  const v = z - kammZ(x); // v > 0: steile Seite zum Wasser
  const h0 = kamm(x);
  let h;
  if (v > 0) {
    h = h0 * Math.max(0, 1 - Math.pow(v / 330, 1.4));
  } else {
    const c = Math.max(0, 1 - Math.pow(-v / 620, 1.3));
    h = h0 * c + 45 * smooth(0, 300, -v) * (1 - c);
  }
  // Fels-Unruhe, nahe am Weg ausgeblendet, damit der Weg ruhig bleibt
  const unruhe = (wert(x + 900, z + 900, 190) - 0.5) * 22 + (wert(x + 300, z + 700, 70) - 0.5) * 9;
  h += unruhe * smooth(30, 120, Math.abs(v)) * smooth(10, 120, h);
  // Zum Rand hin sinkt das Gelände ins Meer, damit das Modell wie eine Insel wirkt
  const rand = Math.min(x - GX[0], GX[1] - x, z - GZ[0], GZ[1] - z);
  const e = smooth(0, 200, rand);
  return Math.max(-10, h * e - 10 * (1 - e));
}

// ---- Weg -------------------------------------------------------------------------------------------

function wegPunkt(t) {
  const x = X0 + t * (X1 - X0);
  const kurve = 24 * (1 - t) * Math.sin(t * 9 * Math.PI);
  return { x, z: kammZ(x) + kurve };
}

const SEGMENTE = 360;
function baueWeg() {
  const pkt = [];
  for (let i = 0; i <= SEGMENTE; i++) {
    const { x, z } = wegPunkt(i / SEGMENTE);
    pkt.push({ x, z, y: Math.max(0, gelaende(x, z)) });
  }
  const norm = GIPFEL / pkt[pkt.length - 1].y;
  pkt.forEach((p) => (p.y *= norm));
  let laenge = 0;
  pkt[0].s = 0;
  for (let i = 1; i < pkt.length; i++) {
    laenge += Math.hypot(pkt[i].x - pkt[i - 1].x, pkt[i].y - pkt[i - 1].y, pkt[i].z - pkt[i - 1].z);
    pkt[i].s = laenge;
  }
  pkt.forEach((p) => (p.anteil = p.s / laenge));
  return pkt;
}

// ---- Gitter ----------------------------------------------------------------------------------------

function mische(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function baueGitter() {
  const hoehe = [];
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const x = GX[0] + ((GX[1] - GX[0]) * i) / (NX - 1);
      const z = GZ[0] + ((GZ[1] - GZ[0]) * j) / (NZ - 1);
      hoehe.push(gelaende(x, z));
    }
  }
  const px = (i) => GX[0] + ((GX[1] - GX[0]) * i) / (NX - 1);
  const pz = (j) => GZ[0] + ((GZ[1] - GZ[0]) * j) / (NZ - 1);
  const sonne = [-0.45, 0.8, 0.4];
  const sl = Math.hypot(...sonne);
  const zellen = [];
  for (let j = 0; j < NZ - 1; j++) {
    for (let i = 0; i < NX - 1; i++) {
      const h = (a, b) => hoehe[(j + b) * NX + i + a];
      const [h00, h10, h01, h11] = [h(0, 0), h(1, 0), h(0, 1), h(1, 1)];
      const mitte = (h00 + h10 + h01 + h11) / 4;
      const wasser = mitte < 0.5;
      const dx = px(i + 1) - px(i), dz = pz(j + 1) - pz(j);
      // Normale aus den Höhendifferenzen
      const nx = -((h10 + h11) - (h00 + h01)) / (2 * dx);
      const nz = -((h01 + h11) - (h00 + h10)) / (2 * dz);
      const nl = Math.hypot(nx, 1, nz);
      const ny = 1 / nl;
      const licht = Math.max(0, (nx / nl * sonne[0] + ny * sonne[1] + (nz / nl) * sonne[2]) / sl);
      const steil = 1 - ny;
      let farbe;
      if (wasser) {
        farbe = [52, 98, 112];
      } else {
        const gruen = mische([88, 116, 72], [128, 132, 86], smooth(0, 220, mitte));
        const fels = mische([128, 124, 116], [176, 172, 164], smooth(150, 484, mitte));
        farbe = mische(gruen, fels, smooth(0.22, 0.55, steil));
        const hell = 0.45 + 0.7 * licht;
        farbe = farbe.map((c) => Math.min(255, c * hell));
      }
      zellen.push({
        pts: [[px(i), h00, pz(j)], [px(i + 1), h10, pz(j)], [px(i + 1), h11, pz(j + 1)], [px(i), h01, pz(j + 1)]],
        wasser,
        farbe: `rgb(${farbe[0] | 0} ${farbe[1] | 0} ${farbe[2] | 0})`,
        mx: (px(i) + px(i + 1)) / 2, my: wasser ? 0 : mitte, mz: (pz(j) + pz(j + 1)) / 2,
      });
    }
  }
  return zellen;
}

// ---- Darstellung -----------------------------------------------------------------------------------

export function starten(buehne) {
  buehne.innerHTML = '';
  buehne.classList.add('modell__buehne--aktiv');

  const weg = baueWeg();
  const zellen = baueGitter();
  const akzent = (getComputedStyle(buehne).getPropertyValue('--akzent') || '#a32638').trim() || '#a32638';

  // Oberfläche
  const leinwand = document.createElement('canvas');
  leinwand.className = 'modell__leinwand';
  leinwand.tabIndex = 0;
  leinwand.setAttribute('role', 'img');
  leinwand.setAttribute(
    'aria-label',
    'Schematisches 3D-Modell des Reinebringen mit dem Stufenweg zum Gipfel. Mit der Maus ziehen oder den Pfeiltasten drehen, mit Plus und Minus zoomen.',
  );
  const bedienung = document.createElement('div');
  bedienung.className = 'modell__bedienung';
  bedienung.innerHTML = `
    <label class="modell__regler">
      <span class="modell__regler-name">Weg</span>
      <input type="range" min="0" max="${WEG_M}" step="1" value="0" aria-label="Position auf dem Weg in Metern" />
    </label>
    <p class="modell__anzeige" aria-live="off"></p>
    <div class="modell__knoepfe">
      <button type="button" data-aktion="abspielen">Hinaufwandern</button>
      <button type="button" data-aktion="zuruecksetzen">Ansicht zurücksetzen</button>
    </div>`;
  buehne.append(leinwand, bedienung);

  const regler = bedienung.querySelector('input');
  const anzeige = bedienung.querySelector('.modell__anzeige');
  const ctx = leinwand.getContext('2d');

  const START = { gier: -0.25, neigung: 0.42, zoom: 1 };
  let ansicht = { ...START };
  let position = 0; // 0..1 Anteil am Weg
  let geplant = false;
  const neuZeichnen = () => {
    if (geplant) return;
    geplant = true;
    requestAnimationFrame(() => {
      geplant = false;
      zeichnen();
    });
  };
  let b = 0, h = 0, dpr = 1;

  function groesse() {
    const r = leinwand.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    b = Math.max(280, r.width);
    h = r.height;
    leinwand.width = Math.round(b * dpr);
    leinwand.height = Math.round(h * dpr);
    neuZeichnen();
  }

  // Kamera: um die Mitte des Berges drehen, leichte Perspektive
  const MITTE = { x: 0, y: 190 * UEBERHOEHUNG, z: 150 };
  function projektion() {
    const cg = Math.cos(ansicht.gier), sg = Math.sin(ansicht.gier);
    const cn = Math.cos(ansicht.neigung), sn = Math.sin(ansicht.neigung);
    const D = 3200;
    const skala = (Math.min(b, h * 1.5) / 1500) * 0.82 * ansicht.zoom;
    return (x, y, z) => {
      x -= MITTE.x; y = y * UEBERHOEHUNG - MITTE.y; z -= MITTE.z;
      const x1 = x * cg + z * sg;
      const z1 = -x * sg + z * cg;
      const y2 = y * cn - z1 * sn;
      const z2 = y * sn + z1 * cn; // größer = näher an der Kamera
      const p = D / (D - z2);
      return { sx: b / 2 + x1 * p * skala, sy: h * 0.56 - y2 * p * skala, tiefe: z2 };
    };
  }

  function punktAufWeg(anteil) {
    const i = Math.min(SEGMENTE - 1, Math.floor(anteil * SEGMENTE));
    const a = weg[i], c = weg[i + 1];
    const t = (anteil - a.anteil) / (c.anteil - a.anteil || 1);
    return { x: a.x + (c.x - a.x) * t, y: a.y + (c.y - a.y) * t, z: a.z + (c.z - a.z) * t };
  }

  function text(s, sx, sy, farbe = '#1e2a38') {
    ctx.font = `600 ${12 * dpr}px system-ui, sans-serif`;
    const w = ctx.measureText(s).width + 12 * dpr;
    const hh = 20 * dpr;
    ctx.fillStyle = 'rgb(241 240 227 / 0.92)';
    ctx.fillRect(sx - w / 2, sy - hh - 8 * dpr, w, hh);
    ctx.fillStyle = farbe;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s, sx, sy - hh / 2 - 8 * dpr);
    ctx.beginPath();
    ctx.moveTo(sx, sy - 8 * dpr);
    ctx.lineTo(sx, sy);
    ctx.strokeStyle = farbe;
    ctx.lineWidth = 1.5 * dpr;
    ctx.stroke();
  }

  function zeichnen() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, b, h);
    const P = projektion();

    const objekte = [];
    for (const z of zellen) {
      const bild = z.pts.map((q) => P(q[0], q[1], q[2]));
      const mitte = P(z.mx, z.my, z.mz);
      objekte.push({ t: mitte.tiefe, art: 0, z, bild });
    }
    const ende = Math.round(position * SEGMENTE);
    for (let i = 0; i < SEGMENTE; i++) {
      const a = P(weg[i].x, weg[i].y + 3, weg[i].z);
      const c = P(weg[i + 1].x, weg[i + 1].y + 3, weg[i + 1].z);
      objekte.push({ t: (a.tiefe + c.tiefe) / 2 + 14, art: 1, a, c, i });
    }
    objekte.sort((u, v) => u.t - v.t); // fern zuerst

    const stufenEnde = 1 - OHNE_STUFEN_M / WEG_M;
    for (const o of objekte) {
      if (o.art === 0) {
        ctx.beginPath();
        ctx.moveTo(o.bild[0].sx, o.bild[0].sy);
        for (let k = 1; k < 4; k++) ctx.lineTo(o.bild[k].sx, o.bild[k].sy);
        ctx.closePath();
        ctx.fillStyle = o.z.farbe;
        ctx.fill();
        ctx.strokeStyle = o.z.farbe;
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        const anteil = (o.i + 0.5) / SEGMENTE;
        const mitStufen = anteil <= stufenEnde;
        const geschafft = o.i < ende;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(o.a.sx, o.a.sy);
        ctx.lineTo(o.c.sx, o.c.sy);
        ctx.strokeStyle = 'rgb(255 255 255 / 0.85)';
        ctx.lineWidth = 5.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(o.a.sx, o.a.sy);
        ctx.lineTo(o.c.sx, o.c.sy);
        ctx.strokeStyle = mitStufen ? akzent : '#e8a33a';
        ctx.globalAlpha = geschafft ? 1 : 0.8;
        ctx.lineWidth = geschafft ? 3.4 : 2.4;
        if (!mitStufen) ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        // Stufen-Marken: alle 100 Stufen ein heller Strich
        if (mitStufen) {
          const s0 = (o.i / SEGMENTE / stufenEnde) * STUFEN;
          const s1 = ((o.i + 1) / SEGMENTE / stufenEnde) * STUFEN;
          if (Math.floor(s1 / 100) > Math.floor(s0 / 100)) {
            ctx.beginPath();
            ctx.arc(o.c.sx, o.c.sy, 3.2, 0, 7);
            ctx.fillStyle = '#fff';
            ctx.fill();
          }
        }
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Beschriftungen und Marker (immer sichtbar, liegen über dem Gelände)
    const s = P(weg[0].x, weg[0].y + 3, weg[0].z);
    const g = P(weg[SEGMENTE].x, weg[SEGMENTE].y + 3, weg[SEGMENTE].z);
    text('Start, Reine', s.sx * dpr, s.sy * dpr);
    text('Gipfel, 484 m', g.sx * dpr, g.sy * dpr, '#8a1f2f');
    const m = punktAufWeg(position);
    const mp = P(m.x, m.y + 3, m.z);
    ctx.beginPath();
    ctx.arc(mp.sx * dpr, mp.sy * dpr, 9 * dpr, 0, 7);
    ctx.fillStyle = '#1e2a38';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(mp.sx * dpr, mp.sy * dpr, 5.5 * dpr, 0, 7);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }

  function anzeigeAktualisieren() {
    const m = punktAufWeg(position);
    const meter = Math.round(position * WEG_M);
    const stufenEnde = 1 - OHNE_STUFEN_M / WEG_M;
    const stufe = Math.round(Math.min(1, position / stufenEnde) * STUFEN);
    const hoehe = Math.round(Math.min(GIPFEL, m.y));
    anzeige.innerHTML = `<strong>${meter} m</strong> Weg · Stufe <strong>${stufe.toLocaleString('de-AT')}</strong> von ${STUFEN.toLocaleString('de-AT')} · <strong>${hoehe} m</strong> Höhe` +
      (position > stufenEnde ? ' · letzte 100 m ohne Stufen' : '');
  }

  function setzePosition(p) {
    position = Math.min(1, Math.max(0, p));
    regler.value = String(Math.round(position * WEG_M));
    anzeigeAktualisieren();
    neuZeichnen();
  }

  regler.addEventListener('input', () => {
    stoppen();
    setzePosition(Number(regler.value) / WEG_M);
  });

  // Ziehen = drehen, Mausrad und Pinch = zoomen
  const zeiger = new Map();
  let letzterAbstand = 0;
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
      ansicht.neigung = Math.min(1.35, Math.max(0.05, ansicht.neigung + (neu.y - alt.y) * 0.006));
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
    const schritt = { ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, -0.06], ArrowDown: [0, 0.06] }[e.key];
    if (schritt) {
      e.preventDefault();
      ansicht.gier += schritt[0];
      ansicht.neigung = Math.min(1.35, Math.max(0.05, ansicht.neigung + schritt[1]));
    } else if (e.key === '+' || e.key === '=') ansicht.zoom = Math.min(2.6, ansicht.zoom * 1.12);
    else if (e.key === '-') ansicht.zoom = Math.max(0.6, ansicht.zoom / 1.12);
    else return;
    neuZeichnen();
  });

  // Hinaufwandern (nur auf Klick, nicht von allein)
  let lauf = 0;
  const abspielen = bedienung.querySelector('[data-aktion="abspielen"]');
  function stoppen() {
    cancelAnimationFrame(lauf);
    lauf = 0;
    abspielen.textContent = 'Hinaufwandern';
  }
  function abspielenStarten() {
    if (lauf) return stoppen();
    if (position >= 1) setzePosition(0);
    abspielen.textContent = 'Anhalten';
    let zuletzt = performance.now();
    const schritt = (jetzt) => {
      setzePosition(position + (jetzt - zuletzt) / 22000);
      zuletzt = jetzt;
      if (position >= 1) return stoppen();
      lauf = requestAnimationFrame(schritt);
    };
    lauf = requestAnimationFrame(schritt);
  }
  abspielen.addEventListener('click', abspielenStarten);
  bedienung.querySelector('[data-aktion="zuruecksetzen"]').addEventListener('click', () => {
    ansicht = { ...START };
    neuZeichnen();
  });

  new ResizeObserver(groesse).observe(leinwand);
  groesse();
  anzeigeAktualisieren();
}
