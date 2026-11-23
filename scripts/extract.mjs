// One-off: turns the captured reference pages into (1) one stylesheet holding only the CSS the
// site uses and (2) cleaned HTML fragments per page, the starting point for the Astro templates.
// Usage: node scripts/extract.mjs   (after scripts/capture.mjs)
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { load } from 'cheerio';
import { PurgeCSS } from 'purgecss';

const REF = new URL('../reference/', import.meta.url);
const { origin: WP } = JSON.parse(await readFile(new URL('seo-baseline.json', REF), 'utf8'));

// Classes that scripts add at runtime, so no captured page contains them.
const RUNTIME_CLASSES = [
  /^swiper/,
  /^toggled$/,
  /^active$/,
  /^show$/,
  /^ast-main-header-nav-open/,
  /^ast-header-break-point/,
  /^ast-popup-nav-open/,
  /^ast-off-canvas-active/,
  /^ast-desktop$/,
  /^elementor-has-item-ratio$/,
  /^elementor-fit-height$/,
  /^elementor-active$/,
];
// Fonts are self-hosted; the per-project background rule is rendered by the template.
const SKIP_STYLES = /emoji|google-fonts|gf-local|recaptcha|admin-bar|elementor-frontend-inline/;

const files = (await readdir(new URL('html/', REF))).filter((f) => f.endsWith('.html'));
const pages = await Promise.all(
  files.map(async (f) => ({ name: f.replace('.html', ''), html: await readFile(new URL(`html/${f}`, REF), 'utf8') })),
);

/** Absolute URLs inside a stylesheet, so its rules survive being moved into one file. */
const absolutize = (css, base) =>
  css.replace(/url\(\s*(['"]?)(?!data:|https?:|\/)([^'")]+)\1\s*\)/g, (_, q, rel) => `url(${new URL(rel, base).href})`);

// WordPress prints different theme CSS per template, so each template type gets its own bundle.
export const typeOf = (name) =>
  name.startsWith('verk_')
    ? 'verk'
    : name.startsWith('umsogn_')
      ? 'umsogn'
      : name.startsWith('thessi-')
        ? '404'
        : 'page';

const fetched = new Map();
const fetchCss = async (href) => {
  const url = href.split('?')[0];
  if (!fetched.has(url)) fetched.set(url, absolutize(await (await fetch(href)).text(), href));
  return fetched.get(url);
};

/** 1. Stylesheets of one template type, in document order, without duplicates. */
async function collectCss(typePages) {
  const seen = new Set();
  const parts = [];
  for (const { html } of typePages) {
    const $ = load(html);
    for (const el of $('link[rel="stylesheet"], style').toArray()) {
      const id = $(el).attr('id') ?? '';
      if (SKIP_STYLES.test(id)) continue;
      const css =
        el.tagName === 'style'
          ? $(el).text()
          : $(el).attr('href').startsWith(WP)
            ? await fetchCss($(el).attr('href'))
            : '';
      if (!css.trim() || seen.has(css)) continue;
      seen.add(css);
      parts.push(css.replace(/\/\*# sourceURL=.*?\*\//g, ''));
    }
  }
  return parts.join('\n');
}

/** Fonts and icons referenced by the CSS move next to it; uploads keep their URL. */
async function localizeAssets(css) {
  const urls = new Set([...css.matchAll(/url\(\s*['"]?(https?:[^'")]+)['"]?\s*\)/g)].map((m) => m[1]));
  for (const url of urls) {
    const clean = url.split(/[?#]/)[0];
    if (clean.includes('/wp-content/uploads/')) {
      css = css.replaceAll(url, new URL(clean).pathname);
      continue;
    }
    const res = await fetch(clean);
    if (!res.ok) continue;
    const name = basename(clean);
    await writeFile(new URL(`../public/assets/legacy/${name}`, import.meta.url), Buffer.from(await res.arrayBuffer()));
    css = css.replaceAll(url, `/assets/legacy/${name}`);
  }
  return css;
}

await mkdir(new URL('../public/assets/legacy/', import.meta.url), { recursive: true });
const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} kB`;
for (const type of ['page', 'verk', 'umsogn', '404']) {
  const typePages = pages.filter((p) => typeOf(p.name) === type);
  const raw = await collectCss(typePages);
  const [{ css: kept }] = await new PurgeCSS().purge({
    content: typePages.map(({ html }) => ({ raw: html, extension: 'html' })),
    css: [{ raw }],
    safelist: { standard: RUNTIME_CLASSES },
    fontFace: true,
    keyframes: true,
  });
  const css = await localizeAssets(kept);
  await writeFile(new URL(`../public/assets/legacy/site-${type}.css`, import.meta.url), css);
  console.log(`site-${type}.css: ${typePages.length} pages, ${kb(raw)} -> ${kb(css)}`);
}

// 2. Fragments.
const clean = (html) => html.replaceAll(WP, '').replace(/\n\s*\n/g, '\n');
await mkdir(new URL('fragments/', REF), { recursive: true });
for (const { name, html } of pages) {
  const $ = load(html);
  $('script, noscript, style, link').remove();
  const body = { bodyClass: $('body').attr('class'), content: clean($.html('#content')) };
  await writeFile(new URL(`fragments/${name}.html`, REF), `<!-- body class: ${body.bodyClass} -->\n${body.content}`);
  if (name === 'home') {
    await writeFile(new URL('fragments/_header.html', REF), clean($.html('header#masthead')));
    await writeFile(new URL('fragments/_footer.html', REF), clean($.html('footer.site-footer')));
    const rest = $('body')
      .children()
      .not('#page, script')
      .toArray()
      .map((el) => $.html(el));
    await writeFile(new URL('fragments/_body-extras.html', REF), clean(rest.join('\n')));
  }
}
