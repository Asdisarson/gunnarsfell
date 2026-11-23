// One-off reference capture of the current WordPress front end.
// Saves rendered HTML and an SEO baseline for every URL in the Yoast sitemap.
// Read-only against WordPress. Usage: node scripts/capture.mjs [WP_URL]
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';

const WP = (process.argv[2] ?? process.env.WP_URL ?? 'http://localhost:10009').replace(/\/$/, '');
const OUT = new URL('../reference/', import.meta.url);

const get = async (url) => {
  const res = await fetch(url, { redirect: 'manual' });
  return { status: res.status, body: await res.text() };
};

const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

export const fileName = (path) => (path === '/' ? 'home' : path.replace(/^\/|\/$/g, '').replaceAll('/', '_'));

/** Everything a search engine reads from the head, in a comparable shape. */
export function readSeo(html) {
  const $ = load(html);
  const meta = {};
  $('head meta[name], head meta[property]').each((_, el) => {
    const key = $(el).attr('name') ?? $(el).attr('property');
    if (/^(description|robots|og:|twitter:|article:)/.test(key)) meta[key] = $(el).attr('content') ?? '';
  });
  return {
    lang: $('html').attr('lang') ?? '',
    title: $('head title').text(),
    canonical: $('head link[rel="canonical"]').attr('href') ?? '',
    meta,
    jsonLd: $('script[type="application/ld+json"]')
      .map((_, el) => JSON.parse($(el).text()))
      .get(),
  };
}

async function main() {
  await mkdir(new URL('html/', OUT), { recursive: true });
  const index = await get(`${WP}/sitemap_index.xml`);
  const urls = [];
  for (const sitemap of locs(index.body))
    urls.push(...locs((await get(sitemap)).body).filter((u) => !/\.(jpe?g|png|webp|gif)$/i.test(u)));
  const paths = [...new Set(urls.map((u) => new URL(u).pathname))].sort();
  paths.push('/thessi-sida-er-ekki-til/');

  const baseline = {};
  for (const path of paths) {
    const { status, body } = await get(WP + path);
    await writeFile(new URL(`html/${fileName(path)}.html`, OUT), body);
    baseline[path] = { status, ...readSeo(body) };
    console.log(status, path);
  }
  const json = JSON.stringify({ origin: WP, pages: baseline }, null, 2);
  await writeFile(new URL('seo-baseline.json', OUT), json);
  console.log(`${paths.length} URLs captured`);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) await main();
