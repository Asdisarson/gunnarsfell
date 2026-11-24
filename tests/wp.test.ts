import { describe, expect, it } from 'vitest';
import { normalize, type SiteContent } from '../src/lib/wp';

const WP = 'http://localhost:10009';

const image = {
  id: 1,
  url: `${WP}/wp-content/uploads/a.jpg`,
  width: 10,
  height: 10,
  alt: '',
  caption: '',
  mime: 'image/jpeg',
  srcset: `${WP}/wp-content/uploads/a.jpg 10w, ${WP}/wp-content/uploads/a-5x5.jpg 5w`,
  sizes: { large: { url: `${WP}/wp-content/uploads/a-5x5.jpg`, width: 5, height: 5 } },
};

const entry = {
  id: 2,
  slug: 's',
  path: '/verk/s/',
  title: 'T',
  date: '',
  modified: '',
  image,
  seo: { canonical: `${WP}/verk/s/` },
};

const raw: SiteContent = {
  origin: `${WP}/`,
  site: { name: 'n', description: 'd' },
  pages: [],
  verk: [{ ...entry, description: '', gallery: [image], featured: false }],
  umsogn: [],
};

describe('normalize', () => {
  const { verk, origin } = normalize(raw);

  it('makes upload URLs site-relative, including srcset and sizes', () => {
    expect(verk[0].image?.url).toBe('/wp-content/uploads/a.jpg');
    expect(verk[0].gallery[0].srcset).toBe('/wp-content/uploads/a.jpg 10w, /wp-content/uploads/a-5x5.jpg 5w');
    expect(verk[0].gallery[0].sizes.large?.url).toBe('/wp-content/uploads/a-5x5.jpg');
  });

  it('leaves SEO data on the WordPress origin for buildHead to move', () => {
    expect(origin).toBe(WP);
    expect(verk[0].seo?.canonical).toBe(`${WP}/verk/s/`);
  });
});
