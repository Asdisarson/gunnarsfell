// One-off: measures how wide every responsive image in the page templates is actually shown on a
// phone, a tablet and a desktop, and writes a matching `sizes` attribute into src/pages/*.astro.
// WordPress wrote "100vw up to the file's width" on every image, which makes browsers download
// files several times larger than needed. Rerun after changing a page's layout. Images drawn by
// components (project grid and gallery) set their own `sizes` in src/components.
// Usage: npm run dev (in another terminal), then node scripts/fix-sizes.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const SITE = process.env.NEW ?? 'http://localhost:4321';
const ROOT = new URL('../', import.meta.url);
const VIEWPORTS = { phone: 375, tablet: 768, desktop: 1440 };
const PAGES = {
  '/': 'index',
  '/um-okkur/': 'um-okkur',
  '/thjonusta/': 'thjonusta',
  '/umsagnir/': 'umsagnir',
  '/hafa-samband/': 'hafa-samband',
};

/** `sizes` from the widths an image is shown at; a width of 0 means hidden at that size. */
export function sizesFor({ phone, tablet, desktop }) {
  const vw = (px, viewport) => `${Math.min(100, Math.ceil((px / viewport) * 100))}vw`;
  const shown = desktop || tablet || phone;
  return [
    `(max-width: 767px) ${vw(phone || shown, VIEWPORTS.phone)}`,
    `(max-width: 1024px) ${vw(tablet || shown, VIEWPORTS.tablet)}`,
    `${Math.ceil(desktop || shown)}px`,
  ].join(', ');
}

async function main() {
  const browser = await chromium.launch();
  for (const [path, file] of Object.entries(PAGES)) {
    const widths = {}; // src -> { phone, tablet, desktop }
    for (const [name, width] of Object.entries(VIEWPORTS)) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(SITE + path, { waitUntil: 'networkidle' });
      const measured = await page.evaluate(() =>
        [...document.querySelectorAll('#content img[srcset]')].map((img) => [
          new URL(img.getAttribute('src'), location.href).pathname,
          img.getBoundingClientRect().width,
        ]),
      );
      for (const [src, shown] of measured) (widths[src] ??= {})[name] = Math.max(widths[src][name] ?? 0, shown);
      await page.close();
    }

    const url = new URL(`src/pages/${file}.astro`, ROOT);
    const source = await readFile(url, 'utf8');
    let changed = 0;
    const updated = source.replace(/<img\b[^>]*>/gs, (tag) => {
      const src = tag.match(/\ssrc="([^"]+)"/)?.[1];
      if (!src || !widths[src] || !/\ssizes="/.test(tag)) return tag;
      changed++;
      return tag.replace(/\ssizes="[^"]*"/, ` sizes="${sizesFor(widths[src])}"`);
    });
    await writeFile(url, updated);
    console.log(`${file}.astro: ${changed} images`);
  }
  await browser.close();
}

if (import.meta.filename === process.argv[1]) await main();
