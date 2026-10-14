/**
 * Sätteri-Plugin (HAST) für Bildgruppen und Lightbox. Die Syntax steht in src/lib/bilder-kern.mjs,
 * die Verwendung in der README, Abschnitt "Bilder und Galerien".
 *
 * Eintrag in astro.config.mjs:  satteri({ hastPlugins: [bilder] })
 * Als Fabrik eingetragen, damit jede Markdown-Datei ihren eigenen Zustand bekommt.
 *
 * Vorgehen wie im Sätteri-Beispiel "Restructuring siblings": Beim ersten Absatz klettern wir zum
 * Elternknoten und schreiben dessen Kinderliste einmal neu. Gruppen reichen ja über mehrere Absätze.
 */
import { bilderUmwandeln } from './bilder-kern.mjs';

export default function bilder(kontext) {
  const quelle = String(kontext?.fileURL?.pathname ?? kontext?.fileURL ?? '');
  const erledigt = new WeakSet();
  return {
    name: 'bildgruppen',
    element: {
      filter: ['p'],
      visit(knoten, ctx) {
        const eltern = ctx.parent(knoten);
        if (!eltern || !Array.isArray(eltern.children) || erledigt.has(eltern)) return;
        erledigt.add(eltern);
        const neu = bilderUmwandeln([...eltern.children], quelle);
        if (neu.length) ctx.setField(eltern, 'children', neu);
      },
    },
  };
}
