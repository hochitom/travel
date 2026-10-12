import { defineConfig, fontProviders } from 'astro/config';

// Schriften über die Fonts-API von Astro (in Astro 5 noch experimentell, ab 5.7).
// Astro lädt die Dateien beim Build herunter und liefert sie von der eigenen Domain aus.
// Besucher schicken also keine Anfrage an Google. Die CSS-Variablen (--font-kopf, --font-text,
// --font-hand) werden in src/styles/global.css verwendet, eingebunden in src/layouts/Layout.astro.
export default defineConfig({
  site: 'https://hochitom.travel',
  trailingSlash: 'always',
  build: { format: 'directory' },
  experimental: {
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
  },
});
