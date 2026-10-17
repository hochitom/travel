import { getCollection, type CollectionEntry } from 'astro:content';
import { getImage } from 'astro:assets';

export type Eintrag = CollectionEntry<'reisen'>;
export type Ebene = 'reise' | 'etappe' | 'beitrag';

export interface Punkt {
  name: string;
  lat: number;
  lng: number;
  notiz?: string;
}

export interface Pin {
  titel: string;
  url: string;
  lat: number;
  lng: number;
  zeit?: string;
  ort?: string;
  bild?: string;
}

/** Routenpunkt mit dem Eintrag, zu dessen Route er gehört */
export interface Station extends Punkt {
  url: string;
  eintrag: string;
  bild?: string;
}

export interface Knoten {
  eintrag: Eintrag;
  /** Pfad ohne "index", z. B. "2018-weltreise/usa" */
  pfad: string;
  ebene: Ebene;
  eltern: Knoten | null;
  kinder: Knoten[];
}

export const KONTINENTE: Record<string, string> = {
  europa: 'Europa',
  asien: 'Asien',
  afrika: 'Afrika',
  nordamerika: 'Nordamerika',
  suedamerika: 'Südamerika',
  ozeanien: 'Ozeanien',
  antarktis: 'Antarktis',
};

// Astro entfernt beim Glob-Loader das abschließende "/index" aus der id
// ("2018-weltreise/index.md" -> "2018-weltreise"). Ob ein Eintrag eine index.md
// ist, steht deshalb im Dateipfad.
const INDEX = /(^|\/)index$/;
const INDEX_DATEI = /(^|\/)index\.md$/;

export const knotenUrl = (k: Knoten) => `/reisen/${k.pfad}/`;

// ---------------------------------------------------------------------------
// Baum aufbauen
// ---------------------------------------------------------------------------

export async function ladeBaum(): Promise<Knoten[]> {
  const eintraege = (await getCollection('reisen')).filter((e) => !e.data.entwurf);

  const knoten = eintraege.map<Knoten>((eintrag) => {
    const istIndex = INDEX_DATEI.test(eintrag.filePath ?? '') || INDEX.test(eintrag.id);
    const pfad = eintrag.id.replace(INDEX, '');
    if (pfad === '') {
      throw new Error('src/content/reisen/index.md ist nicht erlaubt: Reisen liegen in eigenen Ordnern.');
    }
    const tiefe = pfad.split('/').length;
    const ebene: Ebene = !istIndex ? 'beitrag' : tiefe === 1 ? 'reise' : 'etappe';
    return { eintrag, pfad, ebene, eltern: null, kinder: [] };
  });

  const nachPfad = new Map(
    knoten.filter((k) => k.ebene !== 'beitrag').map((k) => [k.pfad, k] as const),
  );

  for (const k of knoten) {
    if (k.ebene === 'reise') continue;
    // Elternknoten: der nächstliegende Ordner darüber, der eine index.md hat
    let ordner = k.pfad.split('/').slice(0, -1);
    let eltern: Knoten | undefined;
    while (ordner.length > 0 && !eltern) {
      eltern = nachPfad.get(ordner.join('/'));
      ordner = ordner.slice(0, -1);
    }
    if (!eltern) {
      throw new Error(
        `"${k.pfad}" gehört zu keiner Reise. Lege im Ordner eine index.md an (src/content/reisen/<reise>/index.md).`,
      );
    }
    k.eltern = eltern;
    eltern.kinder.push(k);
  }

  for (const k of knoten) k.kinder.sort(sortiere);
  return knoten;
}

// ---------------------------------------------------------------------------
// Abgeleitete Werte (erben von oben bzw. unten)
// ---------------------------------------------------------------------------

export function nachfahren(k: Knoten): Knoten[] {
  return k.kinder.flatMap((c) => [c, ...nachfahren(c)]);
}

export function von(k: Knoten): Date | undefined {
  const d = k.eintrag.data;
  const eigen = d.von ?? d.datum;
  if (eigen) return eigen;
  const zeiten = k.kinder.map(von).filter((x): x is Date => !!x);
  return zeiten.length ? new Date(Math.min(...zeiten.map((z) => z.getTime()))) : undefined;
}

export function bis(k: Knoten): Date | undefined {
  const d = k.eintrag.data;
  const eigen = d.bis ?? d.datum;
  if (eigen) return eigen;
  const zeiten = k.kinder.map(bis).filter((x): x is Date => !!x);
  return zeiten.length ? new Date(Math.max(...zeiten.map((z) => z.getTime()))) : von(k);
}

export function kontinent(k: Knoten): string | undefined {
  return k.eintrag.data.kontinent ?? (k.eltern ? kontinent(k.eltern) : undefined);
}

export function laender(k: Knoten): string[] {
  const eigene = k.eintrag.data.laender;
  if (eigene.length) return eigene;
  // Reise mit Etappen (Weltreise): die Länder aller Etappen
  const etappen = k.kinder.filter((c) => c.ebene === 'etappe');
  if (etappen.length) return [...new Set(etappen.flatMap(laender))];
  return k.eltern ? laender(k.eltern) : [];
}

export function reiseVon(k: Knoten): Knoten {
  return k.eltern ? reiseVon(k.eltern) : k;
}

export function jahre(k: Knoten): number[] {
  const a = von(k);
  const b = bis(k) ?? a;
  if (!a || !b) return [];
  const start = a.getUTCFullYear();
  const ende = Math.max(b.getUTCFullYear(), start);
  return Array.from({ length: ende - start + 1 }, (_, i) => start + i);
}

function sortiere(a: Knoten, b: Knoten): number {
  const ra = a.eintrag.data.reihenfolge ?? Number.MAX_SAFE_INTEGER;
  const rb = b.eintrag.data.reihenfolge ?? Number.MAX_SAFE_INTEGER;
  if (ra !== rb) return ra - rb;
  const za = von(a)?.getTime() ?? 0;
  const zb = von(b)?.getTime() ?? 0;
  if (za !== zb) return za - zb;
  return a.pfad.localeCompare(b.pfad);
}

// ---------------------------------------------------------------------------
// Einheiten: das, was in Jahr- und Kontinent-Ansichten als eigene Karte auftaucht
// ---------------------------------------------------------------------------

/**
 * Eine Reise ohne Etappen ist eine Einheit. Hat sie Etappen (Weltreise), ist jede
 * Etappe eine Einheit, damit sie bei ihrem Jahr und Kontinent erscheint.
 */
export function einheiten(alle: Knoten[]): Knoten[] {
  return alle
    .filter(
      (k) =>
        k.ebene === 'etappe' ||
        (k.ebene === 'reise' && !k.kinder.some((c) => c.ebene === 'etappe')),
    )
    .sort(sortiere);
}

/** Reisen als Ganzes, die Weltreise also als eine Reise statt als einzelne Etappen */
export function reisen(alle: Knoten[]): Knoten[] {
  return alle.filter((k) => k.ebene === 'reise').sort(sortiere);
}

export function nachJahr(units: Knoten[]): [number, Knoten[]][] {
  const map = new Map<number, Knoten[]>();
  for (const u of units) {
    const js = jahre(u);
    for (const j of js.length ? js : [0]) {
      map.set(j, [...(map.get(j) ?? []), u]);
    }
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === 0 ? -1 : b === 0 ? 1 : b - a))
    .map(([j, liste]) => [j, liste.sort(sortiere)]);
}

export function nachKontinent(units: Knoten[]): [string, Knoten[]][] {
  const map = new Map<string, Knoten[]>();
  for (const u of units) {
    const key = kontinent(u) ?? 'ohne';
    map.set(key, [...(map.get(key) ?? []), u]);
  }
  const reihenfolge = Object.keys(KONTINENTE);
  return [...map.entries()]
    .sort(([a], [b]) => reihenfolge.indexOf(a) - reihenfolge.indexOf(b))
    .map(([k, liste]) => [k, liste.sort(sortiere)]);
}

// ---------------------------------------------------------------------------
// Formatierung
// ---------------------------------------------------------------------------

const monat = new Intl.DateTimeFormat('de-AT', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const tag = new Intl.DateTimeFormat('de-AT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export function datumLang(d: Date): string {
  return tag.format(d);
}

export function zeitraum(k: Knoten): string {
  const a = von(k);
  const b = bis(k);
  if (!a) return '';
  if (k.ebene === 'beitrag') return tag.format(a);
  if (!b || monat.format(a) === monat.format(b)) return monat.format(a);
  return `${monat.format(a)} – ${monat.format(b)}`;
}

// ---------------------------------------------------------------------------
// Pins und Routen für Karten
// ---------------------------------------------------------------------------

function position(k: Knoten): Punkt | undefined {
  return k.eintrag.data.position ?? k.eintrag.data.route[0];
}

async function bildUrl(k: Knoten): Promise<string | undefined> {
  const bild = k.eintrag.data.titelbild;
  if (!bild) return undefined;
  // Quadratisch zugeschnitten für die Infokarten der Karte
  const optimiert = await getImage({ src: bild, width: 320, height: 320, fit: 'cover', format: 'webp' });
  return optimiert.src;
}

/** Ein Pin pro Beitrag mit Position. Reisen/Etappen nur, wenn darunter kein Beitrag einen Pin hat. */
export async function pinsFuer(knoten: Knoten[]): Promise<Pin[]> {
  const pins: Pin[] = [];
  for (const k of knoten) {
    const pos = position(k);
    if (!pos) continue;
    if (k.ebene !== 'beitrag') {
      const hatKindPin = nachfahren(k).some((d) => d.ebene === 'beitrag' && position(d));
      if (hatKindPin) continue;
    }
    pins.push({
      titel: k.eintrag.data.titel,
      url: knotenUrl(k),
      lat: pos.lat,
      lng: pos.lng,
      zeit: zeitraum(k) || undefined,
      ort: pos.name,
      bild: await bildUrl(k),
    });
  }
  return pins;
}

async function stationen(k: Knoten): Promise<Station[]> {
  const url = knotenUrl(k);
  const eintrag = k.eintrag.data.titel;
  const bild = await bildUrl(k);
  return k.eintrag.data.route.map((p) => ({ ...p, url, eintrag, bild }));
}

export async function routenFuer(k: Knoten): Promise<Station[][]> {
  if (k.eintrag.data.route.length > 1) return [await stationen(k)];
  const kinder = k.kinder.filter((c) => c.eintrag.data.route.length > 1);
  return Promise.all(kinder.map(stationen));
}
