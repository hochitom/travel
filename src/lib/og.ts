/**
 * Vorschaubild (Open Graph, 1200 x 630) im Reisepass-Stil: Titel, Zusammenfassung,
 * Mini-Routenkarte, Passstempel und Wortmarke. Satori baut daraus ein SVG, resvg das PNG.
 * Genutzt von src/pages/og/[...pfad].png.ts, beim Build.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

export const BREITE = 1200;
export const HOEHE = 630;

const FARBE = { papier: '#e3e2d0', papier2: '#f1f0e3', tinte: '#1e2a38', leise: '#4a5260', akzent: '#a32638', meer: '#2f5d6b', linie: '#b9b8a2' };

export interface OgDaten {
  titel: string;
  zusammenfassung?: string;
  /** Stempel: Land und Jahr. Ohne Land kein Stempel. */
  land?: string;
  jahr?: string;
  /** Routenpunkte (verbunden) und einzelne Orte (nur Punkte) */
  route?: [number, number][];
  einzeln?: [number, number][];
}

// Satori kann kein woff2 und keine Variable Fonts, deshalb liegen die TTF-Dateien im Repo.
let schriften: Promise<{ name: string; data: Buffer; weight: 400; style: 'normal' | 'italic' }[]> | undefined;
function ladeSchriften() {
  schriften ??= (async () => {
    const ordner = path.join(process.cwd(), 'src', 'assets', 'fonts');
    const [normal, kursiv] = await Promise.all([
      readFile(path.join(ordner, 'IMFellEnglish-Regular.ttf')),
      readFile(path.join(ordner, 'IMFellEnglish-Italic.ttf')),
    ]);
    return [
      { name: 'IM Fell English', data: normal, weight: 400 as const, style: 'normal' as const },
      { name: 'IM Fell English', data: kursiv, weight: 400 as const, style: 'italic' as const },
    ];
  })();
  return schriften;
}

/** Mini-Karte als SVG (ohne Text), gleichwinklig mit cos(Breite), 440 x 330. */
function karteSvg(route: [number, number][], einzeln: [number, number][]): string {
  const alle = [...route, ...einzeln];
  const k = Math.cos(((alle.reduce((s, p) => s + p[0], 0) / alle.length) * Math.PI) / 180);
  const xs = alle.map((p) => p[1] * k);
  const ys = alle.map((p) => -p[0]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const bw = Math.max(x1 - x0, 0.12);
  const bh = Math.max(y1 - y0, 0.09);
  const rand = 36;
  const s = Math.min((440 - 2 * rand) / bw, (330 - 2 * rand) / bh);
  const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
  const xy = (p: [number, number]) => [220 + (p[1] * k - cx) * s, 165 + (-p[0] - cy) * s] as const;

  const gitter = 'M0 66H440M0 132H440M0 198H440M0 264H440M88 0V330M176 0V330M264 0V330M352 0V330';
  const linie =
    route.length > 1
      ? `<polyline points="${route.map((p) => xy(p).map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="${FARBE.akzent}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1 9"/>`
      : '';
  const punkte = alle
    .map((p) => {
      const [x, y] = xy(p);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${route.length ? 6.5 : 5}" fill="${FARBE.akzent}" stroke="${FARBE.papier2}" stroke-width="2.5"/>`;
    })
    .join('');
  const kompass = `<g transform="translate(396 40)" opacity=".85"><circle r="22" fill="none" stroke="${FARBE.tinte}" stroke-width="1"/><path d="M0 -20L4 -4L20 0L4 4L0 20L-4 4L-20 0L-4 -4z" fill="${FARBE.tinte}"/></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="330" viewBox="0 0 440 330"><path d="${gitter}" stroke="${FARBE.linie}" stroke-width="1" opacity=".7" fill="none"/>${linie}${punkte}${kompass}</svg>`;
}

const KOMPASS_LOGO = `<svg xmlns="http://www.w3.org/2000/svg" width="58" height="58" viewBox="0 0 64 64"><circle cx="32" cy="32" r="22" fill="none" stroke="${FARBE.akzent}" stroke-width="3"/><circle cx="32" cy="32" r="17" fill="none" stroke="${FARBE.akzent}" stroke-width="1.5"/><path d="M32 14l4.5 14.5L51 32l-14.5 3.5L32 50l-4.5-14.5L13 32l14.5-3.5z" fill="${FARBE.tinte}"/><path d="M32 14l2.6 15L32 32l-2.6-3z" fill="${FARBE.akzent}"/></svg>`;
const datenUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

type Stil = Record<string, string | number>;
// Satori nimmt React-ähnliche Objekte, hier ohne JSX.
const el = (type: string, style: Stil, children?: unknown, extra: Record<string, unknown> = {}) => ({
  type,
  props: { style: type === 'img' ? style : { display: 'flex', ...style }, children, ...extra },
});

function kuerzen(text: string | undefined, n = 150): string {
  if (!text || text.length <= n) return text ?? '';
  return text.slice(0, n).replace(/\s+\S*$/, '') + ' …';
}

function stempel(land: string, jahr: string, rechts: number) {
  const sg = land.length <= 8 ? 46 : land.length <= 12 ? 36 : 28;
  const zeile = (oben: number, text: string, stil: Stil) =>
    el('div', { position: 'absolute', left: 0, right: 0, top: oben, justifyContent: 'center', color: FARBE.akzent, ...stil }, text);
  return el(
    'div',
    { position: 'absolute', right: rechts, bottom: 96, width: 300, height: 160, transform: 'rotate(-5deg)', opacity: 0.92 },
    [
      el('div', { position: 'absolute', left: 0, top: 0, width: 300, height: 160, border: `3.5px solid ${FARBE.akzent}`, borderRadius: 7 }),
      el('div', { position: 'absolute', left: 12, top: 12, width: 276, height: 136, border: `1.2px solid ${FARBE.akzent}`, borderRadius: 3 }),
      el('div', { position: 'absolute', left: 24, top: 52, width: 252, height: 1, background: FARBE.akzent }),
      el('div', { position: 'absolute', left: 24, top: 112, width: 252, height: 1, background: FARBE.akzent }),
      zeile(28, 'ANKUNFT · ARRIVAL', { fontSize: 14, letterSpacing: 4 }),
      zeile(52 + (60 - sg * 1.15) / 2, land, { fontSize: sg }),
      zeile(122, jahr, { fontSize: 17, letterSpacing: 4 }),
    ],
  );
}

export async function ogBild(d: OgDaten): Promise<Buffer> {
  const route = d.route ?? [];
  const einzeln = d.einzeln ?? [];
  const hatKarte = route.length + einzeln.length > 0;
  const titel = d.titel.replace(/[\u{1F000}-\u{1FFFF}☀-➿️‍]/gu, '').trim();
  const groesse = titel.length <= 18 ? 76 : titel.length <= 30 ? 64 : titel.length <= 46 ? 52 : 44;
  const breite = hatKarte ? 540 : 960;

  const baum = el(
    'div',
    { position: 'relative', width: BREITE, height: HOEHE, background: FARBE.papier, color: FARBE.tinte, fontFamily: 'IM Fell English' },
    [
      el('div', { position: 'absolute', left: 26, top: 26, right: 26, bottom: 26, border: `2px solid ${FARBE.linie}` }),
      el('div', { position: 'absolute', left: 33, top: 33, right: 33, bottom: 33, border: `1px solid ${FARBE.linie}` }),
      el('div', { position: 'absolute', left: 84, top: 84, bottom: 84, width: breite, flexDirection: 'column' }, [
        el('div', { fontSize: 20, letterSpacing: 6, color: FARBE.meer }, 'LOGBUCH DER REISEN'),
        el('div', { fontSize: groesse, lineHeight: 1.08, marginTop: 22 }, titel),
        d.zusammenfassung ? el('div', { marginTop: 20, fontSize: 28, lineHeight: 1.4, color: FARBE.leise }, kuerzen(d.zusammenfassung)) : null,
        el('div', { marginTop: 'auto', alignItems: 'center' }, [
          el('img', { width: 58, height: 58, marginRight: 16 }, undefined, { src: datenUri(KOMPASS_LOGO), width: 58, height: 58 }),
          el('div', { fontSize: 40, lineHeight: 1 }, 'hochitom'),
          el('div', { fontSize: 40, lineHeight: 1, color: FARBE.akzent, fontStyle: 'italic' }, '.travel'),
        ]),
      ].filter(Boolean)),
      hatKarte
        ? el('div', { position: 'absolute', right: 84, top: 84, width: 440, height: 330, background: FARBE.papier2, border: `1px solid ${FARBE.linie}`, boxShadow: `0 0 0 7px ${FARBE.linie}` }, [
            el('img', {}, undefined, { src: datenUri(karteSvg(route, einzeln)), width: 440, height: 330 }),
          ])
        : null,
      d.land ? stempel(d.land, d.jahr ?? '', 84) : null,
    ].filter(Boolean),
  );

  const svg = await satori(baum as never, { width: BREITE, height: HOEHE, fonts: await ladeSchriften() });
  return Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: BREITE } }).render().asPng());
}
