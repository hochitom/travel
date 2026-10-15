/**
 * Öffentliche Daten für die Berg-Skizzen, geladen im Browser erst nach Klick.
 *
 * Gelände: Terrain Tiles (Mapzen/Tilezen, Open Data on AWS, https://registry.opendata.aws/terrain-tiles/).
 * Kacheln im Terrarium-Format: 256 × 256 PNG, Höhe = R · 256 + G + B / 256 − 32768 (m). Frei, ohne Schlüssel,
 * mit CORS. Unter dem Meer stehen Tiefen (negativ), die schneidet berg.js ab.
 *
 * Berg: Wikidata (CC0), optional. Name (Label), Höhe (P2044) und Lage (P625) eines Eintrags.
 */

const KACHEL = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
const M_PRO_GRAD = 111320; // Meter pro Breitengrad (Näherung, reicht für wenige Kilometer)
const ZOOM_MAX = 14;

/** Lage in Kachelpixeln (Web-Mercator) bei Zoomstufe z */
function pixel(lat, lon, z) {
  const n = 256 * 2 ** z;
  const phi = (lat * Math.PI) / 180;
  return { x: ((lon + 180) / 360) * n, y: ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * n };
}

async function kachelLaden(z, x, y, signal) {
  const antwort = await fetch(KACHEL(z, x, y), { signal });
  if (!antwort.ok) throw new Error(`Höhenkachel ${z}/${x}/${y}: HTTP ${antwort.status}`);
  const bild = await createImageBitmap(await antwort.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const leinwand = document.createElement('canvas');
  leinwand.width = leinwand.height = 256;
  const ctx = leinwand.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bild, 0, 0);
  bild.close?.();
  const d = ctx.getImageData(0, 0, 256, 256).data;
  const h = new Float32Array(256 * 256);
  for (let i = 0, k = 0; i < h.length; i++, k += 4) h[i] = d[k] * 256 + d[k + 1] + d[k + 2] / 256 - 32768;
  return h;
}

/**
 * Höhenraster rund um einen Punkt.
 *
 * - `lat`, `lon`: ungefähre Lage des Gipfels
 * - `halbe`: halbe Kantenlänge des Ausschnitts in m
 * - `n`: Gitterpunkte pro Seite
 * - `suche`: Umkreis in m, in dem der höchste Punkt als Mitte gesucht wird (0 = Lage so nehmen)
 *
 * Ergebnis: `{ lat, lon, n, halbe, werte, min, max }`, `werte[j * n + i]` liegt bei
 * x = −halbe + 2 · halbe · i / (n − 1) (Ost) und z = −halbe + 2 · halbe · j / (n − 1) (Süd).
 */
export async function hoehenraster({ lat, lon, halbe, n, suche = 0, signal }) {
  const abstand = (2 * halbe) / (n - 1);
  const cos = Math.cos((lat * Math.PI) / 180);
  // Kachelpixel etwa halb so groß wie der Gitterabstand
  const z = Math.max(8, Math.min(ZOOM_MAX, Math.ceil(Math.log2((156543.03 * cos) / (abstand / 2)))));

  const rand = halbe + suche + abstand;
  const dLat = rand / M_PRO_GRAD, dLon = rand / (M_PRO_GRAD * cos);
  const nw = pixel(lat + dLat, lon - dLon, z), so = pixel(lat - dLat, lon + dLon, z);
  const kx0 = Math.floor(nw.x / 256), kx1 = Math.floor(so.x / 256);
  const ky0 = Math.floor(nw.y / 256), ky1 = Math.floor(so.y / 256);
  const kacheln = new Map();
  const auftraege = [];
  for (let ky = ky0; ky <= ky1; ky++) {
    for (let kx = kx0; kx <= kx1; kx++) {
      auftraege.push(kachelLaden(z, kx, ky, signal).then((h) => kacheln.set(`${kx}/${ky}`, h)));
    }
  }
  await Promise.all(auftraege);

  const roh = (px, py) => {
    const kx = Math.floor(px / 256), ky = Math.floor(py / 256);
    const k = kacheln.get(`${kx}/${ky}`);
    return k ? k[(py - ky * 256) * 256 + (px - kx * 256)] : 0;
  };
  // Bilinear zwischen den Pixelmitten
  const hoeheBei = (la, lo) => {
    const p = pixel(la, lo, z);
    const x = p.x - 0.5, y = p.y - 0.5;
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const oben = roh(x0, y0) + (roh(x0 + 1, y0) - roh(x0, y0)) * fx;
    const unten = roh(x0, y0 + 1) + (roh(x0 + 1, y0 + 1) - roh(x0, y0 + 1)) * fx;
    return oben + (unten - oben) * fy;
  };
  const versetzt = (la, lo, x, zs) => [la - zs / M_PRO_GRAD, lo + x / (M_PRO_GRAD * cos)];

  // Gipfel suchen: höchster Punkt im Umkreis
  if (suche > 0) {
    let best = -Infinity, bestLat = lat, bestLon = lon;
    const schritt = Math.max(5, abstand / 3);
    for (let zs = -suche; zs <= suche; zs += schritt) {
      for (let x = -suche; x <= suche; x += schritt) {
        if (x * x + zs * zs > suche * suche) continue;
        const [la, lo] = versetzt(lat, lon, x, zs);
        const wert = hoeheBei(la, lo);
        if (wert > best) [best, bestLat, bestLon] = [wert, la, lo];
      }
    }
    lat = bestLat;
    lon = bestLon;
  }

  const werte = new Float32Array(n * n);
  let min = Infinity, max = -Infinity;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const [la, lo] = versetzt(lat, lon, -halbe + i * abstand, -halbe + j * abstand);
      const wert = hoeheBei(la, lo);
      werte[j * n + i] = wert;
      if (wert < min) min = wert;
      if (wert > max) max = wert;
    }
  }
  return { lat, lon, n, halbe, werte, min, max, zoom: z };
}

/** Name, Höhe und Lage aus Wikidata. Fehlt etwas, bleibt das Feld leer. */
export async function wikidataBerg(id, signal) {
  if (!/^Q\d+$/.test(id)) throw new Error(`Wikidata: ungültige Kennung "${id}"`);
  const url =
    'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&origin=*' +
    `&props=labels%7Cclaims&languages=de%7Cen&ids=${id}`;
  const antwort = await fetch(url, { signal });
  if (!antwort.ok) throw new Error(`Wikidata: HTTP ${antwort.status}`);
  const eintrag = (await antwort.json()).entities?.[id];
  if (!eintrag || eintrag.missing !== undefined) throw new Error(`Wikidata: ${id} nicht gefunden`);

  const aussage = (p) => {
    const liste = eintrag.claims?.[p] || [];
    const a = liste.find((c) => c.rank === 'preferred') || liste.find((c) => c.rank !== 'deprecated');
    return a?.mainsnak?.datavalue?.value;
  };
  const hoehe = aussage('P2044');
  let meter = hoehe ? Number(hoehe.amount) : NaN;
  if (hoehe?.unit?.endsWith('/Q3710')) meter *= 0.3048; // Fuß
  else if (hoehe && !hoehe.unit?.endsWith('/Q11573')) meter = NaN; // nur Meter oder Fuß
  const lage = aussage('P625');
  return {
    name: eintrag.labels?.de?.value || eintrag.labels?.en?.value || '',
    hoehe: Number.isFinite(meter) ? Math.round(meter) : null,
    lat: lage?.latitude ?? null,
    lon: lage?.longitude ?? null,
  };
}
