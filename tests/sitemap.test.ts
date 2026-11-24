import { describe, expect, it } from 'vitest';
import { sitemapIndex, urlSet } from '../src/lib/sitemap';
import type { SiteContent } from '../src/lib/wp';

const site = new URL('https://gunnarsfell.is');
const image = (url: string) => ({
  id: 1,
  url,
  width: 1,
  height: 1,
  alt: '',
  caption: '',
  mime: '',
  srcset: '',
  sizes: {},
});
const entry = (path: string, modified: string) => ({
  id: 1,
  slug: '',
  path,
  title: '',
  date: '',
  modified,
  image: null,
  seo: null,
});

const content: SiteContent = {
  origin: 'http://wp',
  site: { name: '', description: '' },
  pages: [entry('/', '2023-10-23T05:38:46+00:00'), entry('/um-okkur/', '2025-11-27T14:00:43+00:00')],
  verk: [
    {
      ...entry('/verk/a/', '2023-09-27T19:44:07+00:00'),
      image: image('/wp-content/uploads/a.jpg'),
      description: '',
      gallery: [image('/wp-content/uploads/a.jpg'), image('/wp-content/uploads/b&c.jpg')],
      featured: false,
    },
  ],
  umsogn: [],
};

describe('sitemaps', () => {
  it('indexes only the types that have entries, with their newest change', () => {
    const xml = sitemapIndex(content, site);
    expect(xml).toContain(
      '<loc>https://gunnarsfell.is/page-sitemap.xml</loc><lastmod>2025-11-27T14:00:43+00:00</lastmod>',
    );
    expect(xml).toContain('verk-sitemap.xml');
    expect(xml).not.toContain('umsogn-sitemap.xml');
  });

  it('lists each URL with its images once, escaped and absolute', () => {
    const xml = urlSet(content.verk, site);
    expect(xml).toContain('<loc>https://gunnarsfell.is/verk/a/</loc>');
    expect(xml.match(/a\.jpg/g)).toHaveLength(1);
    expect(xml).toContain('https://gunnarsfell.is/wp-content/uploads/b&amp;c.jpg');
  });
});
