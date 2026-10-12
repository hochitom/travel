import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://hochitom.travel',
  trailingSlash: 'always',
  build: { format: 'directory' },
});
