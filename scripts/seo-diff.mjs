// SEO parity check: compares the head of every built page with what WordPress served
// (reference/seo-baseline.json, written by scripts/capture.mjs). Fails on any difference that is
// not one of the listed, deliberate changes.
// Usage: npm run build && node scripts/seo-diff.mjs
import { readFile } from 'node:fs/promises';
import { loadEnv } from 'vite';
import { readSeo } from './capture.mjs';

const ROOT = new URL('../', import.meta.url);
const SITE = (loadEnv('production', process.cwd(), '').SITE_URL ?? 'https://gunnarsfell.is').replace(/\/$/, '');
const { origin, pages } = JSON.parse(await readFile(new URL('reference/seo-baseline.json', ROOT), 'utf8'));

// Deliberate changes, applied to the baseline before comparing.
const ALLOWED = [
  'html lang en-US -> is, og:locale en_US -> is_IS, schema inLanguage en-US -> is (the content is Icelandic)',
  'meta description and og:description added where WordPress had none',
  'og:image (the logo) added where WordPress had none',
  '404: reduced schema (the page is noindex)',
];

const expected = (page) => {
  const moved = JSON.parse(JSON.stringify(page).replaceAll(origin, SITE));
  moved.lang = 'is';
  if (moved.meta['og:locale']) moved.meta['og:locale'] = 'is_IS';
  return JSON.parse(JSON.stringify(moved).replaceAll('"inLanguage":"en-US"', '"inLanguage":"is"'));
};

const sortRobots = (value = '') => value.split(', ').sort().join(', ');
/** Key order inside schema objects carries no meaning. */
const sortKeys = (value) =>
  Array.isArray(value)
    ? value.map(sortKeys)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, sortKeys(value[key])]),
        )
      : value;
const problems = [];
const additions = [];

for (const [path, page] of Object.entries(pages)) {
  const is404 = page.status === 404;
  const file = is404 ? '404.html' : `${path.replace(/^\//, '')}index.html`;
  let built;
  try {
    built = readSeo(await readFile(new URL(`dist/${file}`, ROOT), 'utf8'));
  } catch {
    problems.push(`${path}: page missing from the build (dist/${file})`);
    continue;
  }
  const want = expected(page);
  const report = (what, a, b) => problems.push(`${path}: ${what}\n    was: ${a}\n    now: ${b}`);

  if (built.lang !== want.lang) report('html lang', want.lang, built.lang);
  if (built.title !== want.title) report('title', want.title, built.title);
  if (built.canonical !== want.canonical) report('canonical', want.canonical, built.canonical);

  for (const key of new Set([...Object.keys(want.meta), ...Object.keys(built.meta)])) {
    const [a, b] =
      key === 'robots' ? [sortRobots(want.meta[key]), sortRobots(built.meta[key])] : [want.meta[key], built.meta[key]];
    if (a === b) continue;
    const added = a === undefined && /^(description|og:description|og:image(:width|:height|:type)?)$/.test(key);
    if (added) additions.push(`${path}: + ${key} = ${b}`);
    else report(`meta ${key}`, a, b);
  }

  if (!is404) {
    const [a, b] = [JSON.stringify(sortKeys(want.jsonLd)), JSON.stringify(sortKeys(built.jsonLd))];
    if (a !== b) {
      // Point at the first difference rather than printing two long blobs.
      let i = 0;
      while (a[i] === b[i]) i++;
      report('schema', `…${a.slice(Math.max(0, i - 60), i + 80)}…`, `…${b.slice(Math.max(0, i - 60), i + 80)}…`);
    }
  }
}

console.log(`Compared ${Object.keys(pages).length} URLs against the WordPress baseline (${origin} -> ${SITE}).`);
console.log(`\nDeliberate changes:\n${ALLOWED.map((line) => `  - ${line}`).join('\n')}`);
console.log(`\nTags added (${additions.length}):\n${additions.map((line) => `  ${line}`).join('\n') || '  none'}`);
if (problems.length) {
  console.error(`\n${problems.length} unexpected differences:\n${problems.map((line) => `  ${line}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('\nNo unexpected differences.');
}
