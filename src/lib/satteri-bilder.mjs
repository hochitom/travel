/**
 * Sätteri-Plugin (HAST) für Bildgruppen und Lightbox. Die Syntax steht in src/lib/bilder-kern.mjs,
 * die Verwendung in der README, Abschnitt "Bilder und Galerien".
 *
 * Eintrag in astro.config.mjs:  satteri({ hastPlugins: [bilder] })
 * Als Fabrik eingetragen, damit jede Markdown-Datei ihren eigenen Zähler für die IDs bekommt.
 */
import { bilderUmwandeln } from './bilder-kern.mjs';

export default function bilder(kontext) {
  const quelle = kontext?.fileURL?.pathname ?? kontext?.fileURL ?? '';
  return {
    name: 'bildgruppen',
    before(wurzel, ctx) {
      ctx.setField(wurzel, 'children', bilderUmwandeln(wurzel.children, quelle));
    },
  };
}
