import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

export const KONTINENT_KEYS = [
  'europa',
  'asien',
  'afrika',
  'nordamerika',
  'suedamerika',
  'ozeanien',
  'antarktis',
] as const;

const punkt = z.object({
  name: z.string(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  notiz: z.string().optional(),
});

/**
 * Eine Collection für alles. Die Ebene ergibt sich aus dem Pfad:
 *
 *   <reise>/index.md                    Reise
 *   <reise>/<etappe>/index.md           Etappe (z. B. ein Land der Weltreise)
 *   <reise>/[<etappe>/]<name>.md        Beitrag (Kapitel bzw. einzelner Bericht)
 *
 * Dateien und Ordner, die mit "_" beginnen, werden ignoriert (Vorlagen, Entwürfe).
 */
const reisen = defineCollection({
  loader: glob({
    pattern: ['**/*.md', '!**/_*', '!**/_*/**'],
    base: './src/content/reisen',
  }),
  schema: ({ image }) =>
    z.object({
      titel: z.string(),
      zusammenfassung: z.string().optional(),
      kontinent: z.enum(KONTINENT_KEYS).optional(),
      laender: z.array(z.string()).default([]),
      // Reise / Etappe: Zeitraum
      von: z.coerce.date().optional(),
      bis: z.coerce.date().optional(),
      // Beitrag: Tag des Erlebnisses
      datum: z.coerce.date().optional(),
      titelbild: image().optional(),
      titelbildAlt: z.string().optional(),
      // Pin auf der Weltkarte
      position: punkt.optional(),
      // Stationen für die Detailkarte (Reihenfolge = Reiseverlauf)
      route: z.array(punkt).default([]),
      tags: z.array(z.string()).default([]),
      reihenfolge: z.number().optional(),
      entwurf: z.boolean().default(false),
    }),
});

export const collections = { reisen };
