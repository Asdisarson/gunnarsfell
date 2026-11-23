import { describe, expect, it } from 'vitest';
import { buildHead, type YoastHead } from '../src/lib/seo';

const WP = 'http://localhost:10009';
const SITE = 'https://gunnarsfell.is';
const opts = { wpOrigin: WP, siteUrl: SITE };

const yoast: YoastHead = {
  title: 'Nýr Sólpallur - Gunnarsfell - Verktakar',
  robots: { index: 'index', follow: 'follow', 'max-snippet': 'max-snippet:-1' },
  canonical: `${WP}/verk/nyr-solpallur/`,
  og_locale: 'en_US',
  og_type: 'article',
  og_title: 'Nýr Sólpallur - Gunnarsfell - Verktakar',
  og_url: `${WP}/verk/nyr-solpallur/`,
  og_site_name: 'Gunnarsfell - Verktakar',
  og_image: [{ url: `${WP}/wp-content/uploads/a.jpg`, width: 2048, height: 1536, type: 'image/jpeg' }],
  twitter_card: 'summary_large_image',
  twitter_misc: { 'Est. reading time': '1 minute' },
  schema: {
    '@context': 'https://schema.org',
    '@graph': [{ '@type': 'WebPage', url: `${WP}/verk/nyr-solpallur/`, inLanguage: 'en-US' }],
  },
};

const meta = (tags: ReturnType<typeof buildHead>, key: string) =>
  tags.find((t) => t.attrs?.name === key || t.attrs?.property === key)?.attrs?.content;

describe('buildHead', () => {
  it('keeps title and robots and moves every URL to the public site', () => {
    const tags = buildHead(yoast, opts);
    expect(tags[0]).toEqual({ tag: 'title', content: yoast.title });
    expect(meta(tags, 'robots')).toBe('index, follow, max-snippet:-1');
    expect(tags.find((t) => t.attrs?.rel === 'canonical')?.attrs?.href).toBe(`${SITE}/verk/nyr-solpallur/`);
    expect(meta(tags, 'og:url')).toBe(`${SITE}/verk/nyr-solpallur/`);
    expect(meta(tags, 'og:image')).toBe(`${SITE}/wp-content/uploads/a.jpg`);
    expect(JSON.stringify(tags)).not.toContain('localhost');
  });

  it('renders image dimensions and the twitter label pairs', () => {
    const tags = buildHead(yoast, opts);
    expect(meta(tags, 'og:image:width')).toBe('2048');
    expect(meta(tags, 'og:image:type')).toBe('image/jpeg');
    expect(meta(tags, 'twitter:label1')).toBe('Est. reading time');
    expect(meta(tags, 'twitter:data1')).toBe('1 minute');
  });

  it('marks the content as Icelandic', () => {
    const tags = buildHead(yoast, opts);
    expect(meta(tags, 'og:locale')).toBe('is_IS');
    expect(tags.at(-1)?.content).toContain('"inLanguage":"is"');
  });

  it('fills a missing description and share image, and leaves existing ones alone', () => {
    const fallback = {
      ...opts,
      fallbackDescription: 'Lýsing',
      fallbackImage: { url: '/logo.png', width: 749, height: 391, type: 'image/png' },
    };
    const bare = buildHead({ ...yoast, og_image: undefined }, fallback);
    expect(meta(bare, 'description')).toBe('Lýsing');
    expect(meta(bare, 'og:description')).toBe('Lýsing');
    expect(meta(bare, 'og:image')).toBe(`${SITE}/logo.png`);

    const full = buildHead({ ...yoast, description: 'Til', og_description: 'Til og' }, fallback);
    expect(meta(full, 'description')).toBe('Til');
    expect(meta(full, 'og:description')).toBe('Til og');
    expect(meta(full, 'og:image')).toBe(`${SITE}/wp-content/uploads/a.jpg`);
  });

  it('keeps editor-written text from closing the schema script element', () => {
    const tags = buildHead({ ...yoast, schema: { name: 'a</script><script>alert(1)</script>' } }, opts);
    expect(tags.at(-1)?.content).not.toContain('<');
    expect(JSON.parse(tags.at(-1)!.content!)).toEqual({ name: 'a</script><script>alert(1)</script>' });
  });

  it('omits tags Yoast did not set', () => {
    const tags = buildHead({ title: 'x', robots: { index: 'noindex', follow: 'follow' } }, opts);
    expect(tags.map((t) => t.attrs?.name ?? t.attrs?.property ?? t.tag)).toEqual(['title', 'robots']);
  });
});
