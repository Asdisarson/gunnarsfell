// Layout comparison between the WordPress front end and the static build.
// Measures position, size, font and colours of every Elementor element, heading, link, form field and
// footer block on both sites and prints what differs. Which image file a browser picks is not compared:
// the new site serves smaller files and WebP on purpose. Screenshots land in reference/shots/.
// Usage: node scripts/compare.mjs [path ...]      (defaults to one page per template)
//   OLD=http://localhost:10009 NEW=http://localhost:4321 WIDTHS=1440,1024,768,375 TOUCH=1
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const OLD = process.env.OLD ?? 'http://localhost:10009';
const NEW = process.env.NEW ?? 'http://localhost:4321';
const WIDTHS = (process.env.WIDTHS ?? '1440,1024,768,375').split(',').map(Number);
const TOUCH = process.env.TOUCH === '1'; // Emulate a touch device, where the finger-sized targets apply.
const TOLERANCE = Number(process.env.TOLERANCE ?? 1); // px
const SHOTS = fileURLToPath(new URL('../reference/shots/', import.meta.url));
const paths = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      '/',
      '/um-okkur/',
      '/thjonusta/',
      '/unnin-verk/',
      '/umsagnir/',
      '/hafa-samband/',
      '/verk/nyr-solpallur/',
      '/umsogn/arnar-gauti/',
    ];

/** Runs in the page: one line per measured element, keyed so both sites produce the same keys. */
function measure() {
  const selector =
    '[data-id], header#masthead, header#masthead img, header#masthead a.menu-link, ' +
    'footer#colophon :is(div.site-footer-section, img, h4, p, a), ' +
    'form:not(.search-form) :is(input:not([type=hidden]), textarea, button), ' +
    'h1, h2, h3, h6, a.elementor-button, article, figure.gallery-item img, .elementor-testimonial__text, #primary';
  const counts = {};
  const out = { __height: String(document.documentElement.scrollHeight) };
  for (const el of document.querySelectorAll(selector)) {
    if (el.closest('.gf-hp, .swiper-slide-duplicate, dialog')) continue;
    const rect = el.getBoundingClientRect();
    if (!rect.width && !rect.height) continue;
    const key = el.dataset.id ?? `${el.tagName}${(counts[el.tagName] = (counts[el.tagName] ?? 0) + 1)}`;
    const cs = getComputedStyle(el);
    out[key] = [
      Math.round(rect.left),
      Math.round(rect.top + scrollY),
      Math.round(rect.width),
      Math.round(rect.height),
      cs.color.replace(/ /g, ''),
      cs.fontSize,
      cs.fontFamily.split(',')[0].replace(/"/g, ''),
      cs.fontWeight,
      cs.backgroundColor.replace(/ /g, ''),
    ].join('|');
  }
  return out;
}

async function capture(browser, origin, path, width, label) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: TOUCH, isMobile: TOUCH });
  await page.goto(origin + path, { waitUntil: 'networkidle' });
  // Sliders autoplay; freeze them on the first slide so both sides are measured in the same state.
  await page.evaluate(async () => {
    document.querySelectorAll('.swiper').forEach((el) => {
      el.swiper?.autoplay?.stop();
      el.swiper?.slideToLoop?.(0, 0);
    });
    await document.fonts.ready;
    // Lazy images below the fold change nothing in layout (width/height are set), but load them for the screenshot.
    document.querySelectorAll('img[loading=lazy]').forEach((img) => (img.loading = 'eager'));
    await Promise.all(
      [...document.images].map((img) => img.complete || new Promise((r) => (img.onload = img.onerror = r))),
    );
  });
  await page.waitForTimeout(300);
  const result = await page.evaluate(measure);
  const name = `${path === '/' ? 'home' : path.replace(/^\/|\/$/g, '').replaceAll('/', '_')}-${width}-${label}.jpg`;
  await page.screenshot({ path: SHOTS + name, fullPage: true, type: 'jpeg', quality: 60 });
  await page.close();
  return result;
}

await mkdir(SHOTS, { recursive: true });
const browser = await chromium.launch();
let total = 0;
for (const path of paths) {
  for (const width of WIDTHS) {
    const [before, after] = await Promise.all([
      capture(browser, OLD, path, width, 'old'),
      capture(browser, NEW, path, width, 'new'),
    ]);
    const diffs = [];
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const [a, b] = [before[key], after[key]];
      if (a === b) continue;
      if (a && b) {
        const [pa, pb] = [a.split('|'), b.split('|')];
        const sameBox = [0, 1, 2, 3].every((i) => Math.abs(pa[i] - pb[i]) <= TOLERANCE);
        if (sameBox && pa.slice(4).join() === pb.slice(4).join()) continue;
      }
      diffs.push(`    ${key.padEnd(10)} old ${a ?? '(missing)'}\n               new ${b ?? '(missing)'}`);
    }
    total += diffs.length;
    console.log(
      `${diffs.length ? '✗' : '✓'} ${path} @${width}: ${Object.keys(before).length} elements, ${diffs.length} differ`,
    );
    if (diffs.length) console.log(diffs.slice(0, Number(process.env.MAX ?? 12)).join('\n'));
  }
}
await browser.close();
console.log(`\n${total} differences`);
process.exitCode = total ? 1 : 0;
