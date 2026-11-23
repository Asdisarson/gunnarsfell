// Last build step: applies scripts/lib/optimize-html.mjs to every page in dist/.
// Usage: node scripts/optimize-html.mjs   (npm run build runs it)
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { optimizeHtml } from './lib/optimize-html.mjs';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));

async function htmlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === 'wp-content' ? [] : htmlFiles(path);
      return entry.name.endsWith('.html') ? [path] : [];
    }),
  );
  return nested.flat();
}

await stat(DIST); // Fails with a clear error when there is no build to optimize.
const hasWebp = (path) => {
  try {
    return existsSync(join(DIST, decodeURI(path) + '.webp'));
  } catch {
    return false; // A stray "%" in a file name: treat it as having no WebP version.
  }
};
const files = await htmlFiles(DIST);
let pictures = 0;
for (const file of files) {
  const html = optimizeHtml(await readFile(file, 'utf8'), { hasWebp });
  pictures += html.match(/<picture>/g)?.length ?? 0;
  await writeFile(file, html);
}
console.log(`optimized ${files.length} pages: ${pictures} images offered as WebP`);
