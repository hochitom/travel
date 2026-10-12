#!/usr/bin/env node
/**
 * Holt alle Artikel des alten WordPress-Blogs über die öffentliche REST-API und legt sie als
 * ROHFASSUNG ab: Markdown im alten Wortlaut plus Metadaten (Datum, Tags, Autor, Bilder, Koordinaten).
 *
 *   npm install
 *   npm run import
 *
 * Ausgabe in _raw/ (steht in .gitignore und gehört NICHT ins Repo):
 *   _raw/beitraege/<datum>-<slug>.md   ein Artikel pro Datei
 *   _raw/uebersicht.md                 Tabelle aller Artikel, Etappen, Auffälligkeiten
 *   _raw/etappen.json                  Etappen mit Zeitraum und Artikelanzahl
 *   _raw/medien.json                   alle Bilder (Originalgröße) mit Verwendung
 *
 * Die Rohfassung ist Arbeitsmaterial. Die veröffentlichten Texte entstehen erst durch das
 * Umschreiben nach src/content/reisen/.
 *
 * Umgebungsvariablen: WP_BASE (Standard: https://thehoneymoonadventure.blog), OUT (Standard: _raw)
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import TurndownService from 'turndown';

const BASE = (process.env.WP_BASE ?? 'https://thehoneymoonadventure.blog').replace(/\/$/, '');
const OUT = path.resolve(process.env.OUT ?? '_raw');

// ---------------------------------------------------------------------------
// Etappen der Weltreise: Zuordnung über die Tags des alten Blogs
// ---------------------------------------------------------------------------

const ETAPPEN = [
  {
    id: 'usa',
    titel: 'USA',
    kontinent: 'nordamerika',
    laender: ['USA'],
    tags: [
      'usa', 'arizona', 'colorado', 'florida', 'georgia', 'hawaii', 'illinois', 'kalifornien',
      'kanada', 'ontario', 'kansas', 'kentucky', 'los-angeles', 'lousiana', 'maryland', 'miami',
      'michigan', 'missouri', 'monterey', 'new-mexico', 'new-york', 'north-carolina', 'ohio',
      'pennsylvania', 'san-diego', 'san-francisco', 'santa-cruz', 'south-carolina', 'tennessee',
      'utah', 'virginia', 'west-virginia',
    ],
  },
  {
    id: 'neuseeland',
    titel: 'Neuseeland',
    kontinent: 'ozeanien',
    laender: ['Neuseeland'],
    tags: ['neuseeland', 'nordinsel', 'suedinsel', 'auckland', 'cape-reinga', 'mt-taranaki', 'wellington', 'whangarei'],
  },
  {
    id: 'australien',
    titel: 'Australien',
    kontinent: 'ozeanien',
    laender: ['Australien'],
    tags: [
      'australien', 'ostkueste', 'westkueste', 'outback', 'uluru', 'sydney', 'brisbane',
      'surfers-paradies', 'surfers-paradise', 'paronella-park',
    ],
  },
  {
    id: 'bali',
    titel: 'Bali',
    kontinent: 'asien',
    laender: ['Indonesien'],
    tags: ['bali', 'indonesien', 'canggu', 'ubud', 'asien'],
  },
];

/** Wörter, die beim Umschreiben besondere Aufmerksamkeit brauchen. */
const AUFFAELLIG = /\b(Lisa|Honeymoon|Hochzeit\w*|Flitter\w*|Ehe\w*|verheiratet|Frau|Mann|Pärchen|Paar)\b/gi;

// ---------------------------------------------------------------------------
// WordPress-API
// ---------------------------------------------------------------------------

async function holeSeiten(route, params = {}, optional = false) {
  const alle = [];
  for (let seite = 1; ; seite++) {
    const url = new URL(`${BASE}/wp-json/wp/v2/${route}`);
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(seite));
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url, { headers: { 'user-agent': 'hochitom-travel-import/1.0' } });
    if (res.status === 400) break; // WordPress: Seite außerhalb des Bereichs
    if (!res.ok) {
      if (optional) return alle;
      throw new Error(`${res.status} ${res.statusText}: ${url}`);
    }
    alle.push(...(await res.json()));
    if (seite >= Number(res.headers.get('x-wp-totalpages') ?? 1)) break;
  }
  return alle;
}

// ---------------------------------------------------------------------------
// Bilder: Größenvarianten (-960x720) auf das Original zurückführen
// ---------------------------------------------------------------------------

const GROESSE = /-\d{2,5}x\d{2,5}(?=\.[a-z0-9]+$)/i;

function original(src) {
  const u = new URL(src, BASE);
  u.pathname = u.pathname.replace(GROESSE, '');
  const m = u.pathname.match(/\/wp-content\/uploads\/(.+)$/);
  return { url: u.toString(), datei: m ? m[1] : path.basename(u.pathname) };
}

// ---------------------------------------------------------------------------
// HTML → Markdown
// ---------------------------------------------------------------------------

function baueKonverter(bilderSammler, notizen) {
  const td = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
  });

  td.addRule('durchgestrichen', {
    filter: ['del', 's', 'strike'],
    replacement: (inhalt) => `~~${inhalt}~~`,
  });

  // Bilder bekommen einen Platzhalter, der auf das Original zeigt: bild:<jahr>/<monat>/<datei>
  td.addRule('bild', {
    filter: 'img',
    replacement: (_inhalt, node) => {
      const src = node.getAttribute('src');
      if (!src) return '';
      const o = original(src);
      const alt = (node.getAttribute('alt') ?? '').replace(/\s+/g, ' ').trim();
      bilderSammler.set(o.datei, { datei: o.datei, url: o.url, alt });
      return `![${alt}](bild:${o.datei})`;
    },
  });

  // Galerien: eine Bildzeile pro Foto, Bildunterschrift dahinter
  td.addRule('galerie', {
    filter: (node) => node.nodeName === 'UL' && node.classList?.contains('wp-block-gallery'),
    replacement: (_inhalt, node) => {
      const zeilen = [];
      for (const li of node.querySelectorAll('li')) {
        const img = li.querySelector('img');
        if (!img) continue;
        const o = original(img.getAttribute('src') ?? '');
        const alt = (img.getAttribute('alt') ?? '').replace(/\s+/g, ' ').trim();
        const unterschrift = li.querySelector('figcaption')?.textContent?.replace(/\s+/g, ' ').trim();
        bilderSammler.set(o.datei, { datei: o.datei, url: o.url, alt, unterschrift });
        zeilen.push(`![${alt}](bild:${o.datei})${unterschrift ? ` *${unterschrift}*` : ''}`);
      }
      return `\n\n${zeilen.join('\n\n')}\n\n`;
    },
  });

  // Eingebettete Google-Karten fallen weg (ersetzt durch die eigene Karte), die Adresse bleibt als Notiz
  td.addRule('iframe', {
    filter: 'iframe',
    replacement: (_inhalt, node) => {
      const src = node.getAttribute('src') ?? '';
      notizen.push(`Eingebettete Karte/Video: ${src}`);
      return `\n\n<!-- Eingebettet (entfällt): ${src} -->\n\n`;
    },
  });

  return td;
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

const entitaeten = (s) =>
  s
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#8222;/g, '„')
    .replace(/&#8220;/g, '“')
    .replace(/&#8217;/g, '’')
    .replace(/&#8216;/g, '‘')
    .replace(/&#8230;/g, '…')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

const yaml = (wert) => JSON.stringify(wert); // JSON ist gültiges YAML

function dateiname(datum, slug) {
  const sauber = decodeURIComponent(slug)
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${datum}-${sauber}.md`;
}

function waehleEtappe(tagSlugs) {
  let beste = null;
  let punkte = 0;
  for (const e of ETAPPEN) {
    const p = tagSlugs.filter((t) => e.tags.includes(t)).length;
    if (p > punkte) {
      beste = e.id;
      punkte = p;
    }
  }
  return beste;
}

// ---------------------------------------------------------------------------
// Hauptprogramm
// ---------------------------------------------------------------------------

console.log(`Quelle: ${BASE}`);

const [posts, tags, kategorien, medien, nutzer] = await Promise.all([
  holeSeiten('posts', {
    orderby: 'date',
    order: 'asc',
    _fields: 'id,date,slug,link,title,content,excerpt,author,categories,tags,featured_media,location',
  }),
  holeSeiten('tags', { _fields: 'id,name,slug' }),
  holeSeiten('categories', { _fields: 'id,name,slug' }),
  holeSeiten('media', { _fields: 'id,source_url,alt_text,caption,post,date' }, true),
  holeSeiten('users', { _fields: 'id,name,slug' }, true),
]);

console.log(`${posts.length} Artikel, ${tags.length} Tags, ${medien.length} Medien, ${nutzer.length} Autoren`);

const tagSlug = new Map(tags.map((t) => [t.id, t.slug]));
const kategorieName = new Map(kategorien.map((k) => [k.id, k.name]));
const autorName = new Map(nutzer.map((n) => [n.id, n.name]));
const medium = new Map(medien.map((m) => [m.id, m]));

// Etappen zuordnen: erst nach Tags, Lücken (z. B. Reiseupdates) von den Nachbarn übernehmen
const eintraege = posts.map((p) => {
  const slugs = (p.tags ?? []).map((id) => tagSlug.get(id)).filter(Boolean);
  return { post: p, tagSlugs: slugs, etappe: waehleEtappe(slugs), sicher: true };
});
for (let i = 0; i < eintraege.length; i++) {
  if (eintraege[i].etappe) continue;
  eintraege[i].sicher = false;
  eintraege[i].etappe = eintraege[i - 1]?.etappe ?? null;
}
for (let i = eintraege.length - 1; i >= 0; i--) {
  if (!eintraege[i].etappe) eintraege[i].etappe = eintraege[i + 1]?.etappe ?? ETAPPEN[0].id;
}

await mkdir(path.join(OUT, 'beitraege'), { recursive: true });

const uebersicht = [];
const alleMedien = new Map();

for (const { post, tagSlugs, etappe, sicher } of eintraege) {
  const bilder = new Map();
  const notizen = [];
  const td = baueKonverter(bilder, notizen);

  const titel = entitaeten(post.title?.rendered ?? '').trim();
  const datum = post.date.slice(0, 10);
  let markdown = td.turndown(post.content?.rendered ?? '');
  markdown = markdown.replace(/<!--more-->/g, '').replace(/\n{3,}/g, '\n\n').trim();

  // Titelbild (Beitragsbild) des alten Blogs
  let titelbild = null;
  const fm = medium.get(post.featured_media);
  if (fm?.source_url) {
    const o = original(fm.source_url);
    titelbild = o.datei;
    if (!bilder.has(o.datei)) bilder.set(o.datei, { datei: o.datei, url: o.url, alt: fm.alt_text ?? '' });
  }

  // Koordinaten, falls der Artikel welche hat (Feld "location", sonst false)
  let position = null;
  const loc = post.location;
  if (loc && loc.lat && loc.lng) {
    position = { name: loc.address ?? '', lat: Number(loc.lat), lng: Number(loc.lng) };
  }

  const auffaellig = {};
  for (const m of `${titel}\n${markdown}`.matchAll(AUFFAELLIG)) {
    const w = m[0].toLowerCase();
    auffaellig[w] = (auffaellig[w] ?? 0) + 1;
  }

  for (const b of bilder.values()) {
    const eintrag = alleMedien.get(b.datei) ?? { ...b, artikel: [] };
    eintrag.artikel.push(post.id);
    alleMedien.set(b.datei, eintrag);
  }

  const kopf = [
    '---',
    `wp_id: ${post.id}`,
    `titel: ${yaml(titel)}`,
    `datum: ${datum}`,
    `slug: ${yaml(decodeURIComponent(post.slug))}`,
    `quelle: ${yaml(post.link)}`,
    `autor_id: ${post.author}`,
    `autor: ${yaml(autorName.get(post.author) ?? null)}`,
    `kategorie: ${yaml((post.categories ?? []).map((id) => kategorieName.get(id)).filter(Boolean))}`,
    `tags: ${yaml(tagSlugs)}`,
    `etappe: ${etappe}`,
    `etappe_sicher: ${sicher}`,
    `position: ${yaml(position)}`,
    `titelbild: ${yaml(titelbild)}`,
    `bilder: ${yaml([...bilder.values()])}`,
    `notizen: ${yaml(notizen)}`,
    `auffaellig: ${yaml(auffaellig)}`,
    '---',
    '',
  ].join('\n');

  const datei = dateiname(datum, post.slug);
  await writeFile(path.join(OUT, 'beitraege', datei), `${kopf}\n# ${titel}\n\n${markdown}\n`, 'utf8');

  uebersicht.push({
    datum,
    titel,
    etappe,
    sicher,
    autor: autorName.get(post.author) ?? `#${post.author}`,
    bilder: bilder.size,
    position: !!position,
    auffaellig: Object.values(auffaellig).reduce((a, b) => a + b, 0),
    datei,
  });
}

// Etappen-Zusammenfassung
const etappenInfo = ETAPPEN.map((e) => {
  const liste = uebersicht.filter((u) => u.etappe === e.id);
  return {
    id: e.id,
    titel: e.titel,
    kontinent: e.kontinent,
    laender: e.laender,
    artikel: liste.length,
    von: liste[0]?.datum ?? null,
    bis: liste.at(-1)?.datum ?? null,
  };
});
await writeFile(path.join(OUT, 'etappen.json'), JSON.stringify(etappenInfo, null, 2), 'utf8');
await writeFile(path.join(OUT, 'medien.json'), JSON.stringify([...alleMedien.values()], null, 2), 'utf8');

// Übersicht zum Durchsehen
const zeilen = [
  '# Import-Übersicht',
  '',
  `Quelle: ${BASE} · ${posts.length} Artikel · ${alleMedien.size} verschiedene Bilder`,
  '',
  '## Etappen',
  '',
  '| Etappe | Artikel | von | bis |',
  '|---|---|---|---|',
  ...etappenInfo.map((e) => `| ${e.titel} | ${e.artikel} | ${e.von ?? ''} | ${e.bis ?? ''} |`),
  '',
  '## Autoren',
  '',
  ...[...new Set(uebersicht.map((u) => u.autor))].map(
    (a) => `- ${a}: ${uebersicht.filter((u) => u.autor === a).length} Artikel`,
  ),
  '',
  '## Alle Artikel',
  '',
  '`?` bei der Etappe = von den Nachbarartikeln übernommen, bitte prüfen.',
  '',
  '| Datum | Titel | Etappe | Autor | Bilder | Pin | Auffällige Wörter |',
  '|---|---|---|---|---|---|---|',
  ...uebersicht.map(
    (u) =>
      `| ${u.datum} | ${u.titel.replace(/\|/g, '/')} | ${u.etappe}${u.sicher ? '' : ' ?'} | ${u.autor} | ${u.bilder} | ${u.position ? 'ja' : ''} | ${u.auffaellig || ''} |`,
  ),
  '',
];
await writeFile(path.join(OUT, 'uebersicht.md'), zeilen.join('\n'), 'utf8');

console.log(`Fertig. Rohfassung liegt in ${OUT}`);
console.log(etappenInfo.map((e) => `  ${e.titel}: ${e.artikel} Artikel (${e.von} bis ${e.bis})`).join('\n'));
