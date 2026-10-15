/**
 * Modell: Reinebringen mit Stufenweg.
 *
 * Wichtig: Das ist KEIN vermessenes Gelände. Es gibt weder Höhendaten noch einen GPS-Track dahinter.
 * Fest sind nur die Angaben der Infotafel am Start: 484 m Höhe, 1.978 Stufen, etwa 1,1 km Weg, die letzten
 * 100 m ohne Stufen. Form des Bergs und Kurven des Wegs sind frei gezeichnet.
 * Mit einer GPX-Datei ersetzt man `weg.punkte()` und `hoehe()` durch die echten Daten.
 */
import { werkzeug } from './kern.js';

const { glatt, rauschen } = werkzeug;

const GIPFEL = 484; // m
const X0 = -520; // Start des Wegs
const X1 = 520; // Gipfel
const BEREICH = { x: [-760, 760], z: [-520, 900], nx: 86, nz: 80 };

/** Höhe der Kammlinie: 0 am Start, 484 am Gipfel, die letzten 10 % flacher */
function kamm(x) {
  const t = (x - X0) / (X1 - X0);
  if (t <= 0) return 0;
  if (t <= 0.9) return GIPFEL * 0.93 * Math.pow(t / 0.9, 1.3);
  if (t <= 1) return GIPFEL * (0.93 + ((t - 0.9) / 0.1) * 0.07);
  return GIPFEL * Math.pow(Math.max(0, 1 - (t - 1) / 0.35), 0.9);
}
const kammZ = (x) => 30 * Math.sin(x / 240);

function hoehe(x, z) {
  const v = z - kammZ(x); // v > 0: steile Seite zum Wasser
  const h0 = kamm(x);
  let h;
  if (v > 0) {
    h = h0 * Math.max(0, 1 - Math.pow(v / 330, 1.4));
  } else {
    const c = Math.max(0, 1 - Math.pow(-v / 620, 1.3));
    h = h0 * c + 45 * glatt(0, 300, -v) * (1 - c);
  }
  // Fels-Unruhe, nahe am Weg ausgeblendet, damit der Weg ruhig bleibt
  const unruhe = (rauschen(x + 900, z + 900, 190) - 0.5) * 22 + (rauschen(x + 300, z + 700, 70) - 0.5) * 9;
  h += unruhe * glatt(30, 120, Math.abs(v)) * glatt(10, 120, h);
  // Zum Rand hin sinkt das Gelände ins Meer, damit das Modell wie eine Insel wirkt
  const rand = Math.min(x - BEREICH.x[0], BEREICH.x[1] - x, z - BEREICH.z[0], BEREICH.z[1] - z);
  const e = glatt(0, 200, rand);
  return Math.max(-10, h * e - 10 * (1 - e));
}

function wegPunkte() {
  const n = 360;
  const pkt = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = X0 + t * (X1 - X0);
    const z = kammZ(x) + 24 * (1 - t) * Math.sin(t * 9 * Math.PI); // sanfte Kurven, am Gipfel gerade
    pkt.push({ x, z, y: Math.max(0, hoehe(x, z)) });
  }
  const norm = GIPFEL / pkt[n].y; // Gipfel genau 484 m
  pkt.forEach((p) => (p.y *= norm));
  return pkt;
}

export default {
  titel: 'Reinebringen',
  untertitel: 'der Stufenweg, Skizze',
  beschreibung: 'Schematisches 3D-Modell des Reinebringen mit dem Stufenweg zum Gipfel',
  bereich: BEREICH,
  hoehe,
  hoeheMax: GIPFEL,
  ueberhoehung: 1.5,
  ansicht: { gier: -0.25, neigung: 0.42, zoom: 1 },
  hoehenlinien: { abstand: 25, stark: 100 },
  weg: { meter: 1100, punkte: wegPunkte, dauer: 22 },
  abschnitte: [
    { bis: 0.909, art: 'stufen', anzahl: 1978, einheit: 'Stufe' },
    { bis: 1, art: 'pfad', name: 'die letzten 100 m ohne Stufen' },
  ],
  marken: [
    { t: 0, text: 'Start · Reine' },
    { t: 1, text: 'Gipfel', art: 'fahne' },
  ],
  stufenmarken: [500, 1000, 1500],
  hoehenmarken: [100, 200, 300, 400],
  stempel: { kopf: 'Gipfel', titel: '484 m', zusatz: 'Reinebringen' },
};
