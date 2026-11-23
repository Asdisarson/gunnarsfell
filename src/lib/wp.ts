// Content from WordPress, read once per build from the mu-plugin's content endpoint
// (wp-content/mu-plugins/gunnarsfell-headless.php).
import type { YoastHead } from './seo';

export interface ImageSize {
  url: string;
  width: number;
  height: number;
}

export interface WpImage extends ImageSize {
  id: number;
  alt: string;
  caption: string;
  mime: string;
  srcset: string;
  sizes: Partial<Record<'thumbnail' | 'medium' | 'medium_large' | 'large', ImageSize>>;
}

export interface Entry {
  id: number;
  slug: string;
  path: string;
  title: string;
  date: string;
  modified: string;
  image: WpImage | null;
  seo: YoastHead | null;
}

export interface Project extends Entry {
  description: string;
  gallery: WpImage[];
}

export interface Testimonial extends Entry {
  role: string;
  content: string;
}

export interface SiteContent {
  /** Origin WordPress used in the SEO data. After normalize(), image URLs are site-relative. */
  origin: string;
  site: { name: string; description: string };
  pages: Entry[];
  verk: Project[];
  umsogn: Testimonial[];
}

export const WP_URL = (import.meta.env.WP_URL ?? 'http://localhost:10009').replace(/\/$/, '');
export const CONTENT_ENDPOINT = `${WP_URL}/wp-json/gunnarsfell/v1/content`;
/** Where the browser posts the contact forms. WordPress must be reachable by visitors at this address. */
export const CONTACT_ENDPOINT = import.meta.env.PUBLIC_CONTACT_ENDPOINT || `${WP_URL}/wp-json/gunnarsfell/v1/contact`;

/**
 * Makes upload URLs site-relative: the static site serves the same files at the same paths.
 * SEO data is left as WordPress wrote it; buildHead moves it to the public origin.
 */
export function normalize(raw: SiteContent): SiteContent {
  const origin = raw.origin.replace(/\/$/, '');
  const relative = <T>(value: T): T =>
    JSON.parse(JSON.stringify(value).replaceAll(`${origin}/wp-content/`, '/wp-content/'));
  const entry = <T extends Entry>({ seo, ...rest }: T) => ({ ...relative(rest), seo }) as T;
  return {
    ...raw,
    origin,
    pages: raw.pages.map(entry),
    verk: raw.verk.map(entry),
    umsogn: raw.umsogn.map(entry),
  };
}

let cache: Promise<SiteContent> | undefined;

export function getContent(): Promise<SiteContent> {
  cache ??= (async () => {
    const response = await fetch(CONTENT_ENDPOINT);
    if (!response.ok) throw new Error(`WordPress content request failed: ${response.status} ${CONTENT_ENDPOINT}`);
    const raw = (await response.json()) as Partial<SiteContent>;
    // A 200 with half the content would build a half-empty site: stop instead.
    if (!raw.origin || !raw.pages?.length || !raw.verk?.length || !Array.isArray(raw.umsogn)) {
      throw new Error(`WordPress returned incomplete content from ${CONTENT_ENDPOINT}`);
    }
    return normalize(raw as SiteContent);
  })();
  return cache;
}
/** The entry WordPress serves at a path, e.g. "/um-okkur/". */
export async function getPage(path: string): Promise<Entry | undefined> {
  const { pages } = await getContent();
  return pages.find((page) => page.path === path);
}
