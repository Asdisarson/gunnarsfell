import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';

const env = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), '');

export default defineConfig({
  // Public address of the site: canonical URLs, Open Graph and the sitemap are built from it.
  site: env.SITE_URL ?? 'https://gunnarsfell.is',
  trailingSlash: 'always',
  build: { format: 'directory' },
});
