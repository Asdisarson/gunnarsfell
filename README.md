# gunnarsfell.is front end

Static Astro site. WordPress (in `../app/public`) is the content admin only: projects (`verk`), testimonials
(`umsogn`), Yoast SEO data and images are read from it at build time. The six pages are Astro templates.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on http://localhost:4321 (WordPress must be running) |
| `npm run build` | Copies the images (and their WebP versions) from WordPress, builds to `dist/`, then optimizes every page |
| `npm run preview` | Serves `dist/` |
| `npm test` | Unit tests (SEO head, content mapping, sitemaps) |
| `npm run seo-diff` | Compares every built page's head with the old site's (`reference/seo-baseline.json`) |
| `node scripts/compare.mjs` | Measures layout on the old and new site at three widths and prints differences |

Configuration is in `.env` (see `.env.example`): `WP_URL`, `SITE_URL`, `PUBLIC_CONTACT_ENDPOINT`,
optional `PUBLIC_GA4_ID` and `PUBLIC_FB_PIXEL_ID`.

## How it fits together

- **WordPress side:** one file, `wordpress/gunnarsfell-headless.php`, linked into `wp-content/mu-plugins/` in
  Local (copy it there on a server). It serves
  `/wp-json/gunnarsfell/v1/content` (everything the build needs), receives the contact forms at
  `/wp-json/gunnarsfell/v1/contact`, simplifies the admin for the client, sets a project's cover from its
  first photo, and calls a deploy hook when content changes. Its constants are documented at the top of the file.
- **Look:** the markup keeps the class names of the old theme (Astra + Elementor), and
  `public/assets/legacy/site-*.css` holds the old site's CSS reduced to what is used, one bundle per template
  type. `src/styles/site.css` adds the few new things (form messages, lightbox).
- **Pages:** `src/pages/*.astro` hold the page content. Text changes are made there.
- **Projects:** `src/pages/verk/[slug].astro`, `src/components/ProjectGrid.astro`, `ProjectGallery.astro`.
- **SEO:** `src/lib/seo.ts` renders Yoast's data per URL. Titles and descriptions are still edited in Yoast.
  Sitemaps keep Yoast's file names (`sitemap_index.xml`, `page-`, `verk-`, `umsogn-sitemap.xml`).
- **Images:** served from `/wp-content/uploads/...`, the same URLs as before. `scripts/sync-media.mjs` copies
  the referenced files into `public/wp-content/` (not in git).
- **Page optimization:** `scripts/optimize-html.mjs` runs last in the build (rules and tests in
  `scripts/lib/optimize-html.mjs`): WebP offered through `<picture>`, images loaded lazily unless a
  template marks them eager (the first content image and the first row of a grid or gallery), descriptions added to images that sit in a card with one heading. The dev server does not run it.
- **Image `sizes`:** the page templates carry measured `sizes` values. After changing a page's layout, run
  `node scripts/fix-sizes.mjs` against the dev server to re-measure them. The project grid and gallery set
  theirs in `src/components/ProjectGrid.astro` and `ProjectGallery.astro`.
- **Browser behaviour:** `src/scripts/site.ts` (mobile menu, testimonial slider, gallery lightbox, forms).

## Parity with the old site

- Layout: `scripts/compare.mjs` at 1440, 1024, 768 and 375 px. Known, intended differences: the footer
  e-mail text (Local's copy had a rewritten address), the testimonial page's meta line and navigation
  (Icelandic, no author name), and the header logo file on project pages (smaller file, same size on screen).
- SEO: `npm run seo-diff` lists the deliberate changes it allows; anything else fails.
- The old project grid carried an Elementor display condition for role `subscriber`. It had no effect for
  visitors (the logged-out page showed all projects), so the grid shows all projects here too.

## One-off scripts

`scripts/capture.mjs`, `extract.mjs` and `fragments-to-astro.mjs` produced the SEO baseline, the CSS bundles
and the first version of the page templates from the old WordPress front end. They need the old theme and
Elementor active. Rerunning `fragments-to-astro.mjs` overwrites hand edits in `src/pages`.

## Going live (not done yet)

1. Host `dist/` (any static host). Set `SITE_URL` and `PUBLIC_CONTACT_ENDPOINT` for the build.
2. Move WordPress to its own address (for example `cms.gunnarsfell.is`) and set `WP_URL` to it.
3. In `wp-config.php` set `GUNNARSFELL_FRONTEND_URL` (public site) and `GUNNARSFELL_DEPLOY_HOOK` (the host's
   build hook), so publishing a project rebuilds the site.
4. Set `PUBLIC_GA4_ID` (and the Facebook pixel ID if it is still wanted).

The client guide is in `docs/baeta-vid-verki.md`.
