/**
 * Modell: ein einzelner Berg als drehbare Skizze aus öffentlichen Daten.
 *
 * Anders als die gezeichneten Modelle (z. B. reinebringen.js) ist das Gelände hier echt: Es kommt aus den
 * Terrain Tiles (siehe hoehendaten.js) und wird erst nach dem Klick geladen. Optional liefert Wikidata Name,
 * amtliche Gipfelhöhe und Lage. Bedienung: nur Drehen.
 *
 * Die Angaben kommen aus den data-Attributen der Figur, die src/lib/berg-html.mjs erzeugt:
 *   data-name, data-lat, data-lon, data-hoehe, data-wikidata, data-breite (m), data-ueberhoehung
 */
import { hoehenraster, wikidataBerg } from './hoehendaten.js';

const GITTER = 91; // Punkte pro Seite
const SUCHE = 350; // m, Umkreis für die Gipfelsuche um die angegebene Lage
const STUFEN = [5, 10, 20, 25, 50, 100, 200, 250, 500];

const zahl = (n, stellen = 0) => n.toLocaleString('de-AT', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
const lage = (lat, lon) =>
  `${zahl(Math.abs(lat), 3)}° ${lat >= 0 ? 'N' : 'S'}, ${zahl(Math.abs(lon), 3)}° ${lon >= 0 ? 'O' : 'W'}`;

export default async function berg(angaben) {
  const wert = (s) => (s === undefined || s === '' ? NaN : Number(s));
  let name = angaben.name || '';
  let lat = wert(angaben.lat);
  let lon = wert(angaben.lon);
  let hoehe = wert(angaben.hoehe);
  let hoeheQuelle = Number.isFinite(hoehe) ? 'angabe' : '';

  if (angaben.wikidata) {
    try {
      const w = await wikidataBerg(angaben.wikidata);
      name ||= w.name;
      if (!Number.isFinite(lat) && w.lat !== null) [lat, lon] = [w.lat, w.lon];
      if (!Number.isFinite(hoehe) && w.hoehe !== null) [hoehe, hoeheQuelle] = [w.hoehe, 'wikidata'];
    } catch (fehler) {
      // Wikidata ist nur eine Ergänzung, ohne sie geht es mit den eigenen Angaben weiter
      console.warn(fehler);
    }
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error(`Berg "${name}": keine Lage (lat/lon oder Wikidata)`);

  const breite = wert(angaben.breite) || 3000;
  const halbe = breite / 2;
  const r = await hoehenraster({ lat, lon, halbe, n: GITTER, suche: SUCHE });

  // Meer: Tiefen und Schären unter 2 m abschneiden, das Wasser liegt flach knapp unter 0
  const werte = r.werte.map((h) => (h < 2 ? -2 : h));
  const max = Math.max(...werte);
  const unten = Math.max(0, Math.min(...werte));
  if (!Number.isFinite(hoehe)) [hoehe, hoeheQuelle] = [Math.round(max), 'gelaende'];

  const n = GITTER;
  const abstand = (2 * halbe) / (n - 1);
  // Gitter des Kerns = Gitter der Daten, Werte deshalb direkt (gerundet auf den nächsten Punkt)
  const hoeheBei = (x, z) => {
    const i = Math.min(n - 1, Math.max(0, Math.round((x + halbe) / abstand)));
    const j = Math.min(n - 1, Math.max(0, Math.round((z + halbe) / abstand)));
    return werte[j * n + i];
  };
  const mitteIdx = ((n - 1) / 2) * n + (n - 1) / 2;
  const gipfelY = werte[mitteIdx];

  const linienAbstand = STUFEN.find((s) => s >= (max - unten) / 16) ?? 500;
  const stark = linienAbstand === 25 ? 100 : linienAbstand * 5;
  const km = zahl(breite / 1000, breite % 1000 ? 1 : 0);
  const ueberhoehung = wert(angaben.ueberhoehung) || 1.3;

  return {
    titel: name,
    untertitel: 'Skizze aus Höhendaten',
    beschreibung: `Drehbare 3D-Skizze des Bergs ${name}, ${zahl(hoehe)} m hoch, Ausschnitt ${km} mal ${km} km aus öffentlichen Höhendaten`,
    bereich: { x: [-halbe, halbe], z: [-halbe, halbe], nx: n, nz: n },
    hoehe: hoeheBei,
    hoeheMax: max,
    mitte: { x: 0, y: (max + unten) * 0.45, z: 0 },
    ueberhoehung,
    ansicht: { gier: -0.35, neigung: 0.55, zoom: 0.78 },
    hoehenlinien: { abstand: linienAbstand, stark },
    sockel: true,
    nordpfeil: true,
    einpassen: true,
    bedienung: 'drehen',
    marken: [{ x: 0, y: gipfelY, z: 0, text: `Gipfel · ${zahl(hoehe)} m`, art: 'fahne' }],
    stempel: { kopf: 'Gipfel', titel: `${zahl(hoehe)} m`, zusatz: name },
    kopf: [
      { name: 'Gipfel', wert: `${zahl(hoehe)} m`, klein: hoeheQuelle === 'gelaende' ? 'laut Geländedaten' : 'ü. M.' },
      { name: 'Lage', wert: lage(r.lat, r.lon) },
      { name: 'Ausschnitt', wert: `${km} × ${km} km`, klein: `Linien alle ${linienAbstand} m` },
    ],
  };
}
