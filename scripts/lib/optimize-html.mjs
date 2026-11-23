// What the build does to every finished page so it loads well on any device, without touching how
// it looks: WebP versions for browsers that take them, images below the first screen loaded late,
// and a description on images that have none but sit in a card with a single heading.
import { load } from 'cheerio';

const UPLOAD = /^\/wp-content\/uploads\/.+\.(jpe?g|png)$/i;
const HEADINGS = 'h1, h2, h3, h4, h5, h6';
const MAX_ALT_LENGTH = 125; // Longer than this is a sentence, not a description of a picture.

/**
 * "url 300w, url 1024w" -> [{ url, descriptor }]. Returns null for anything it cannot read with
 * certainty, so an unusual srcset is left alone rather than rewritten wrongly.
 */
const parseSrcset = (srcset) => {
  const candidates = srcset
    .split(',')
    .map((candidate) => candidate.trim().split(/\s+/))
    .filter(([url]) => url);
  return candidates.every((parts) => parts.length <= 2)
    ? candidates.map(([url, descriptor = '']) => ({ url, descriptor }))
    : null;
};

/**
 * @param {string} html
 * @param {{ hasWebp: (path: string) => boolean }} files  whether "<path>.webp" exists in the build
 */
export function optimizeHtml(html, { hasWebp }) {
  const $ = load(html);

  // Loading order: the first image in the content is what the visitor waits for; the rest can wait.
  // An image a template marked itself (loading or fetchpriority) keeps its setting.
  $('#content img').each((i, el) => {
    const img = $(el);
    if (i === 0) {
      if (!img.attr('loading')) img.attr('fetchpriority', 'high');
    } else if (!img.attr('loading') && !img.attr('fetchpriority')) {
      img.attr('loading', 'lazy');
    }
    if (!img.attr('decoding')) img.attr('decoding', 'async');
  });

  // Descriptions: only where the markup leaves no doubt what the picture shows: the image's own
  // widget (an image box), or else its card, holds exactly one picture and one heading.
  $('#content img[alt=""]').each((_, el) => {
    const scopes = [$(el).closest('.elementor-widget'), $(el).closest('.elementor-widget-wrap')];
    const scope = scopes.find((s) => s.find(HEADINGS).length === 1);
    if (!scope || scope.find('img').length !== 1) return;
    const heading = scope.find(HEADINGS).clone();
    heading.find('br').replaceWith(' ');
    const text = heading.text().replace(/\s+/g, ' ').trim();
    if (text && text.length <= MAX_ALT_LENGTH) $(el).attr('alt', text);
  });

  // WebP: offered next to the original, so the original URL stays the image's address.
  $('img[src]').each((_, el) => {
    const img = $(el);
    if (img.parent().is('picture')) return;
    const candidates = img.attr('srcset')
      ? parseSrcset(img.attr('srcset'))
      : [{ url: img.attr('src'), descriptor: '' }];
    if (!candidates?.every(({ url }) => UPLOAD.test(url) && !url.includes('..') && hasWebp(url))) return;
    const source = $('<source type="image/webp">').attr(
      'srcset',
      candidates.map(({ url, descriptor }) => `${url}.webp ${descriptor}`.trim()).join(', '),
    );
    if (img.attr('sizes')) source.attr('sizes', img.attr('sizes'));
    img.wrap('<picture></picture>').before(source);
  });

  return $.html();
}
