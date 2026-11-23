// Copies the WordPress uploads the site uses into public/wp-content/uploads, at the same paths,
// so image URLs stay what they were. Runs before every build; only fetches what is missing.
// Usage: node scripts/sync-media.mjs
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const env = loadEnv('production', ROOT, '');
const WP = (env.WP_URL ?? 'http://localhost:10009').replace(/\/$/, '');
const UPLOAD = /\/wp-content\/uploads\/[^\s"'()<>\\,]+\.(?:jpe?g|png|gif|webp|svg|avif|mp4)/gi;

async function filesUnder(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((e) => (e.isDirectory() ? filesUnder(join(dir, e.name)) : [join(dir, e.name)])),
  );
  return nested.flat();
}

const paths = new Set();
const collect = (text) => (text.match(UPLOAD) ?? []).forEach((p) => paths.add(decodeURI(p)));

// 1. Everything the templates and stylesheets reference.
for (const file of [...(await filesUnder(join(ROOT, 'src'))), ...(await filesUnder(join(ROOT, 'public/assets')))]) {
  if (/\.(astro|ts|json|css)$/.test(file)) collect(await readFile(file, 'utf8'));
}
// 2. Everything WordPress content references (covers, galleries, share images). Read from the JSON
// values rather than by pattern, so file names with spaces or commas survive.
const response = await fetch(`${WP}/wp-json/gunnarsfell/v1/content`);
if (!response.ok) throw new Error(`WordPress content request failed: ${response.status}`);
const uploadPath = (url) => {
  const at = url.indexOf('/wp-content/uploads/');
  return at === -1 ? null : decodeURI(url.slice(at));
};
(function walk(value, key) {
  if (typeof value === 'string') {
    // A srcset is "url 300w, url 1024w": the width descriptor is what separates the entries.
    const urls = key === 'srcset' ? value.split(/\s+\d+w(?:,\s*|$)/).filter(Boolean) : [value];
    urls.map(uploadPath).forEach((path) => path && paths.add(path));
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([k, v]) => walk(v, k));
  }
})(await response.json());

let copied = 0;
const missing = [];
const queue = [...paths];
await Promise.all(
  Array.from({ length: 8 }, async () => {
    for (let path = queue.pop(); path; path = queue.pop()) {
      const target = join(ROOT, 'public', path);
      if (await stat(target).catch(() => null)) continue;
      const file = await fetch(WP + encodeURI(path));
      if (!file.ok) {
        missing.push(path);
        continue;
      }
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, Buffer.from(await file.arrayBuffer()));
      copied++;
    }
  }),
);

console.log(`media: ${paths.size} referenced, ${copied} copied, ${missing.length} missing`);
if (missing.length) {
  // Building on would publish pages with broken images.
  console.error(missing.map((p) => `  missing on WordPress: ${p}`).join('\n'));
  process.exitCode = 1;
}
