// Turns Yoast's head data (as WordPress computes it per URL) into the tags of the static page,
// so titles, descriptions, Open Graph and schema stay what they were and stay editable in Yoast.

export interface YoastImage {
  url: string;
  width?: number;
  height?: number;
  type?: string;
}

export interface YoastHead {
  title?: string;
  description?: string;
  robots?: Record<string, string>;
  canonical?: string;
  og_locale?: string;
  og_type?: string;
  og_title?: string;
  og_description?: string;
  og_url?: string;
  og_site_name?: string;
  article_modified_time?: string;
  og_image?: YoastImage[];
  twitter_card?: string;
  twitter_misc?: Record<string, string>;
  schema?: unknown;
}

export interface HeadTag {
  tag: 'title' | 'meta' | 'link' | 'script';
  attrs?: Record<string, string>;
  content?: string;
}

export interface HeadOptions {
  /** Origin WordPress used when it computed the data. */
  wpOrigin: string;
  /** Public origin of the static site. */
  siteUrl: string;
  /** Used only where Yoast has no description. */
  fallbackDescription?: string;
  /** Used only where Yoast has no share image. Path or absolute URL. */
  fallbackImage?: YoastImage;
}

/** The site is in Icelandic; WordPress was left on its English default. */
export const SITE_LANG = 'is';
const OG_LOCALE = 'is_IS';

export function buildHead(
  source: YoastHead,
  { wpOrigin, siteUrl, fallbackDescription, fallbackImage }: HeadOptions,
): HeadTag[] {
  const site = siteUrl.replace(/\/$/, '');
  const yoast: YoastHead = JSON.parse(JSON.stringify(source).replaceAll(wpOrigin.replace(/\/$/, ''), site));

  const description = yoast.description ?? fallbackDescription;
  const ogDescription = yoast.og_description ?? fallbackDescription;
  const images = yoast.og_image?.length
    ? yoast.og_image
    : fallbackImage
      ? [{ ...fallbackImage, url: new URL(fallbackImage.url, site).href }]
      : [];

  const tags: HeadTag[] = [];
  const name = (key: string, content?: string | number) =>
    content !== undefined &&
    content !== '' &&
    tags.push({ tag: 'meta', attrs: { name: key, content: String(content) } });
  const property = (key: string, content?: string | number) =>
    content !== undefined &&
    content !== '' &&
    tags.push({ tag: 'meta', attrs: { property: key, content: String(content) } });

  if (yoast.title) tags.push({ tag: 'title', content: yoast.title });
  name('description', description);
  name('robots', yoast.robots && Object.values(yoast.robots).join(', '));
  if (yoast.canonical) tags.push({ tag: 'link', attrs: { rel: 'canonical', href: yoast.canonical } });
  property('og:locale', yoast.og_locale && OG_LOCALE);
  property('og:type', yoast.og_type);
  property('og:title', yoast.og_title);
  property('og:description', ogDescription);
  property('og:url', yoast.og_url);
  property('og:site_name', yoast.og_site_name);
  property('article:modified_time', yoast.article_modified_time);
  for (const image of images) {
    property('og:image', image.url);
    property('og:image:width', image.width);
    property('og:image:height', image.height);
    property('og:image:type', image.type);
  }
  name('twitter:card', yoast.twitter_card);
  Object.entries(yoast.twitter_misc ?? {}).forEach(([label, data], i) => {
    name(`twitter:label${i + 1}`, label);
    name(`twitter:data${i + 1}`, data);
  });
  if (yoast.schema) {
    const schema = JSON.stringify(yoast.schema)
      .replaceAll('"inLanguage":"en-US"', `"inLanguage":"${SITE_LANG}"`)
      // The JSON is written inside a <script> element: a "</script>" in a title must not end it.
      .replaceAll('<', '\\u003c');
    tags.push({ tag: 'script', attrs: { type: 'application/ld+json' }, content: schema });
  }
  return tags;
}
