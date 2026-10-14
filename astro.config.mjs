import { defineConfig, fontProviders } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import bilder from './src/lib/satteri-bilder.mjs';

// Schriften über die Fonts-API von Astro. Astro lädt die Dateien beim Build herunter und liefert
// sie von der eigenen Domain aus. Besucher schicken also keine Anfrage an Google. Die CSS-Variablen
// (--font-kopf, --font-text, --font-hand) werden in src/styles/global.css verwendet, eingebunden
// in src/layouts/Layout.astro.
export default defineConfig({
  site: 'https://hochitom.travel',
  trailingSlash: 'always',
  build: { format: 'directory' },
  // Markdown läuft ab Astro 7 über Sätteri. Das Plugin macht Bildgruppen (:::galerie usw.) und die
  // Lightbox in Markdown möglich, siehe README "Bilder und Galerien".
  markdown: { processor: satteri({ hastPlugins: [bilder] }) },
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'IM Fell English',
      cssVariable: '--font-kopf',
      weights: [400],
      styles: ['normal', 'italic'],
      subsets: ['latin'],
      fallbacks: ['Georgia', 'Palatino Linotype', 'Palatino', 'serif'],
    },
    {
      provider: fontProviders.google(),
      name: 'Newsreader',
      cssVariable: '--font-text',
      weights: [400, 600],
      styles: ['normal', 'italic'],
      subsets: ['latin'],
      fallbacks: ['Georgia', 'Palatino Linotype', 'Palatino', 'serif'],
    },
    {
      provider: fontProviders.google(),
      name: 'Reenie Beanie',
      cssVariable: '--font-hand',
      weights: [400],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['Segoe Print', 'Bradley Hand', 'cursive'],
    },
  ],
});
