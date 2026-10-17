#!/usr/bin/env node
/**
 * Setzt die Bilder des alten Blogs in die Weltreise-Berichte ein.
 *
 *   npm run bilder                      alle Berichte
 *   npm run bilder -- neuseeland/2018-08-28-hobbiton   nur Berichte, deren Pfad das enthält
 *
 * In den Berichten stehen die Bildquellen als Kommentare:
 *   <!-- titelbild: 2018/06/foto.jpg -->
 *   <!-- bild: 2018/06/foto.jpg -->
 *   <!-- bild: 2018/06/foto.jpg | Beschriftung -->
 *
 * Für jeden Kommentar wird das Original von wp-content/uploads geladen, auf höchstens
 * MAX_KANTE Pixel verkleinert, ohne Metadaten (GPS!) als JPEG neben den Bericht gelegt
 * (<etappe>/bilder/<datei>) und der Kommentar ersetzt: ein Bild allein als Einzelbild,
 * 2–3 aufeinanderfolgende als :::raster, ab 4 als :::galerie. Das Titelbild kommt ins Frontmatter.
 *
 * Bereits geladene Bilder werden nicht noch einmal geladen. Kommentare, deren Bild nicht
 * geladen werden konnte, bleiben stehen; das Skript kann also gefahrlos erneut laufen.
 *
 * Alt-Texte gibt es im alten Blog fast keine. Sie werden aus dem Dateinamen gebildet
 * (z. B. "0821-hobbiton_img_7475.jpg" → "Hobbiton") und sollten beim Durchsehen
 * verbessert werden.
 *
 * Umgebungsvariablen: WP_BASE (Standard: https://thehoneymoonadventure.blog)
 */
import { readdir, readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const BASE = (process.env.WP_BASE ?? 'https://thehoneymoonadventure.blog').replace(/\/$/, '');
const WURZEL = path.resolve('src/content/reisen/2018-weltreise');
const MAX_KANTE = 2000;
const QUALITAET = 80;
const GLEICHZEITIG = 6;

const filter = process.argv[2];
const KOMMENTAR = /^<!-- (titelbild|bild): (.+?) -->$/;

// ---------------------------------------------------------------------------

async function* markdownDateien(ordner) {
  for (const e of await readdir(ordner, { withFileTypes: true })) {
    const p = path.join(ordner, e.name);
    if (e.isDirectory() && e.name !== 'bilder') yield* markdownDateien(p);
    else if (e.name.endsWith('.md')) yield p;
  }
}

/** "2018/06/foto-960x720.jpg | Text" → Quelle, Zieldatei, Beschriftung */
function zerlege(inhalt) {
  const [quelle, ...rest] = inhalt.split(' | ');
  if (!/^\d{4}\/\d{2}\/[^/\s]+\.(jpe?g|png|gif|webp)$/i.test(quelle)) return null;
  const ohneGroesse = quelle.replace(/-\d+x\d+(\.\w+)$/, '$1');
  const datei = path.basename(ohneGroesse).replace(/\.\w+$/, '.jpg').toLowerCase();
  return { quelle, ohneGroesse, datei, beschriftung: rest.join(' | ').trim() };
}

/** "0821-hobbiton_img_7475-e1535364384669.jpg" → "Hobbiton" */
function altAusDateiname(datei, ersatz) {
  const wort = path
    .basename(datei, '.jpg')
    .replace(/^\d{4}-/, '')
    .replace(/(_|-)(img|dsc|dji|p)?_?\d+.*$/i, '')
    .replace(/-e\d{10,}.*$/, '')
    .split(/[-_]/)
    .filter((w) => w && !/^\d+$/.test(w) && !/^img$/i.test(w))
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
  return wort.length > 2 ? wort : ersatz;
}

const ladend = new Map();

/** Lädt ein Bild einmal und speichert es verkleinert. Liefert true bei Erfolg. */
function lade(bild, zielOrdner) {
  const ziel = path.join(zielOrdner, bild.datei);
  if (!ladend.has(ziel)) ladend.set(ziel, ladeJetzt(bild, ziel));
  return ladend.get(ziel);
}

async function ladeJetzt(bild, ziel) {
  try {
    await access(ziel);
    return true;
  } catch {}
  // Erst das Original, sonst die verkleinerte Fassung, auf die der alte Artikel zeigte
  const urls = [...new Set([bild.ohneGroesse, bild.quelle])].map((q) => `${BASE}/wp-content/uploads/${q}`);
  for (const url of urls) {
    const antwort = await fetch(url).catch(() => null);
    if (!antwort?.ok) continue;
    const roh = Buffer.from(await antwort.arrayBuffer());
    await mkdir(path.dirname(ziel), { recursive: true });
    // rotate() dreht nach EXIF-Ausrichtung; sharp schreibt ohne withMetadata() keine Metadaten
    await sharp(roh)
      .rotate()
      .resize({ width: MAX_KANTE, height: MAX_KANTE, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: QUALITAET, mozjpeg: true })
      .toFile(ziel);
    return true;
  }
  console.warn(`  nicht gefunden: ${bild.quelle}`);
  return false;
}

/** Kleine Warteschlange, damit der alte Server nicht mit 900 Anfragen gleichzeitig getroffen wird. */
async function nacheinander(aufgaben) {
  const ergebnisse = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: GLEICHZEITIG }, async () => {
      while (i < aufgaben.length) {
        const n = i++;
        ergebnisse[n] = await aufgaben[n]();
      }
    }),
  );
  return ergebnisse;
}

function bildzeile({ datei, alt, beschriftung }) {
  const titel = beschriftung ? ` "${beschriftung.replace(/"/g, '“')}"` : '';
  return `![${alt.replace(/[[\]]/g, '')}](./bilder/${datei}${titel})`;
}

function yamlString(s) {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// ---------------------------------------------------------------------------

async function bearbeite(datei) {
  const text = await readFile(datei, 'utf8');
  const zeilen = text.split('\n');
  const titel = text.match(/^titel:\s*['"]?(.+?)['"]?\s*$/m)?.[1] ?? '';
  const zielOrdner = path.join(path.dirname(datei), 'bilder');

  // Alle Kommentare finden und ihre Bilder laden
  const treffer = [];
  zeilen.forEach((zeile, i) => {
    const m = zeile.trim().match(KOMMENTAR);
    if (!m) return;
    const bild = zerlege(m[2]);
    if (bild) treffer.push({ i, art: m[1], ...bild, alt: altAusDateiname(bild.datei, titel) });
  });
  if (!treffer.length) return { geladen: 0, fehlend: 0 };

  const ok = await nacheinander(treffer.map((t) => () => lade(t, zielOrdner)));
  const geladen = treffer.filter((_, n) => ok[n]);
  const nachZeile = new Map(geladen.map((t) => [t.i, t]));

  // Zeilen neu aufbauen: aufeinanderfolgende Bildkommentare (Leerzeilen dazwischen erlaubt) zu Gruppen
  const neu = [];
  let titelbild = null;
  for (let i = 0; i < zeilen.length; i++) {
    const t = nachZeile.get(i);
    if (!t) {
      neu.push(zeilen[i]);
      continue;
    }
    if (t.art === 'titelbild') {
      titelbild = t;
      if (zeilen[i + 1]?.trim() === '' && neu.at(-1)?.trim() === '') i++; // doppelte Leerzeile vermeiden
      continue;
    }
    const gruppe = [t];
    let j = i + 1;
    while (j < zeilen.length) {
      if (zeilen[j].trim() === '') {
        j++;
        continue;
      }
      const naechstes = nachZeile.get(j);
      if (!naechstes || naechstes.art !== 'bild') break;
      gruppe.push(naechstes);
      i = j++;
    }
    if (gruppe.length === 1) neu.push(bildzeile(t));
    else {
      neu.push(gruppe.length <= 3 ? ':::raster' : ':::galerie');
      neu.push(...gruppe.map(bildzeile));
      neu.push(':::');
    }
  }

  let ergebnis = neu.join('\n');
  if (titelbild && !/^titelbild:/m.test(ergebnis)) {
    const alt = titelbild.beschriftung || titelbild.alt;
    ergebnis = ergebnis.replace(
      /^(---\n[\s\S]*?)\n---\n/,
      `$1\ntitelbild: ./bilder/${titelbild.datei}\ntitelbildAlt: ${yamlString(alt)}\n---\n`,
    );
  }
  if (ergebnis !== text) await writeFile(datei, ergebnis);
  return { geladen: geladen.length, fehlend: treffer.length - geladen.length };
}

let summe = { berichte: 0, geladen: 0, fehlend: 0 };
for await (const datei of markdownDateien(WURZEL)) {
  const rel = path.relative(WURZEL, datei);
  if (filter && !rel.includes(filter)) continue;
  const { geladen, fehlend } = await bearbeite(datei);
  if (!geladen && !fehlend) continue;
  console.log(`${rel}: ${geladen} Bilder${fehlend ? `, ${fehlend} fehlen` : ''}`);
  summe = { berichte: summe.berichte + 1, geladen: summe.geladen + geladen, fehlend: summe.fehlend + fehlend };
}
console.log(`\n${summe.berichte} Berichte, ${summe.geladen} Bilder eingesetzt, ${summe.fehlend} nicht gefunden.`);
if (summe.fehlend) console.log('Nicht gefundene Bilder stehen weiter als Kommentar im Bericht.');
