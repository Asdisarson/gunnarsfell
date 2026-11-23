// Sitemaps under the same file names Yoast used (sitemap_index.xml, page-, verk-, umsogn-sitemap.xml),
// so what is already submitted to search engines keeps working.
import type { Entry, Project, SiteContent } from './wp';

export const SITEMAP_TYPES = ['page', 'verk', 'umsogn'] as const;
export type SitemapType = (typeof SITEMAP_TYPES)[number];

const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function entriesOf(content: SiteContent, type: SitemapType): Entry[] {
  return type === 'page' ? content.pages : content[type];
}

/** Newest modification among the entries, for the index. */
export const lastModified = (entries: Entry[]) =>
  entries
    .map((e) => e.modified)
    .sort()
    .at(-1);

export function sitemapIndex(content: SiteContent, site: URL): string {
  const items = SITEMAP_TYPES.filter((type) => entriesOf(content, type).length).map((type) => {
    const lastmod = lastModified(entriesOf(content, type));
    return `<sitemap><loc>${new URL(`/${type}-sitemap.xml`, site).href}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</sitemap>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items.join('')}</sitemapindex>\n`;
}

export function urlSet(entries: Entry[], site: URL): string {
  const abs = (path: string) => escape(new URL(path, site).href);
  const urls = entries.map((entry) => {
    const images = [entry.image, ...((entry as Project).gallery ?? [])].filter((image) => image !== null);
    const unique = [...new Set(images.map((image) => image.url))];
    return (
      `<url><loc>${abs(entry.path)}</loc><lastmod>${entry.modified}</lastmod>` +
      unique.map((url) => `<image:image><image:loc>${abs(url)}</image:loc></image:image>`).join('') +
      `</url>`
    );
  });
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">` +
    urls.join('') +
    `</urlset>\n`
  );
}
