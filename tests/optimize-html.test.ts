import { describe, expect, it } from 'vitest';
import { optimizeHtml } from '../scripts/lib/optimize-html.mjs';

const U = '/wp-content/uploads';
const page = (content: string) =>
  `<html><head></head><body><header id="masthead"><img src="${U}/logo.png" alt="Logo"></header><div id="content">${content}</div><footer><img src="${U}/badge.jpg" alt="" loading="lazy"></footer></body></html>`;
const run = (content: string, webp: string[] = []) =>
  optimizeHtml(page(content), { hasWebp: (path: string) => webp.includes(path) }) as string;

describe('optimizeHtml: WebP', () => {
  it('offers the WebP versions in a picture element and keeps the original image as it was', () => {
    const html = run(`<img src="${U}/a-300.jpg" srcset="${U}/a-300.jpg 300w, ${U}/a.jpg 1024w" sizes="50vw" alt="A">`, [
      `${U}/a-300.jpg`,
      `${U}/a.jpg`,
    ]);
    expect(html).toContain(
      `<picture><source type="image/webp" srcset="${U}/a-300.jpg.webp 300w, ${U}/a.jpg.webp 1024w" sizes="50vw"><img src="${U}/a-300.jpg"`,
    );
    expect(html).toContain(`srcset="${U}/a-300.jpg 300w, ${U}/a.jpg 1024w"`);
  });

  it('uses the src alone when the image has no srcset', () => {
    expect(run(`<img src="${U}/a.png" alt="A">`, [`${U}/a.png`])).toContain(
      `<source type="image/webp" srcset="${U}/a.png.webp">`,
    );
  });

  it('leaves the image alone when any candidate has no WebP version', () => {
    const html = run(`<img src="${U}/a-300.jpg" srcset="${U}/a-300.jpg 300w, ${U}/a.jpg 1024w" alt="A">`, [
      `${U}/a.jpg`,
    ]);
    expect(html).not.toContain('<picture>');
  });

  it('reads a srcset written without spaces after the commas, and density descriptors', () => {
    const html = run(`<img src="${U}/a.jpg" srcset="${U}/a.jpg 1x,${U}/b.jpg 2x" alt="A">`, [
      `${U}/a.jpg`,
      `${U}/b.jpg`,
    ]);
    expect(html).toContain(`<source type="image/webp" srcset="${U}/a.jpg.webp 1x, ${U}/b.jpg.webp 2x">`);
  });

  it('wraps header and footer images too, and never wraps twice', () => {
    const once = run('', [`${U}/logo.png`, `${U}/badge.jpg`]);
    expect(once.match(/<picture>/g)).toHaveLength(2);
    const twice = optimizeHtml(once, { hasWebp: () => true }) as string;
    expect(twice.match(/<picture>/g)).toHaveLength(2);
  });
});

describe('optimizeHtml: loading', () => {
  const html = run(
    `<img src="${U}/hero.jpg" alt="H"><p>text</p><img src="${U}/b.jpg" alt="B"><img src="${U}/c.jpg" alt="C" fetchpriority="high">`,
  );

  it('loads the first content image first and the later ones when they come near the screen', () => {
    expect(html).toMatch(/<img src="[^"]*hero\.jpg"[^>]*fetchpriority="high"/);
    expect(html).not.toMatch(/<img src="[^"]*hero\.jpg"[^>]*loading="lazy"/);
    expect(html).toMatch(/<img src="[^"]*b\.jpg"[^>]*loading="lazy"/);
  });

  it('respects an image a template already marked as important, and leaves the header logo eager', () => {
    expect(html).not.toMatch(/<img src="[^"]*c\.jpg"[^>]*loading="lazy"/);
    expect(html).not.toMatch(/<img src="[^"]*logo\.png"[^>]*loading="lazy"/);
  });
});

describe('optimizeHtml: descriptions', () => {
  const card = (inner: string) => `<div class="elementor-widget-wrap">${inner}</div>`;

  it('describes an undescribed image with the one heading that shares its card', () => {
    const html = run(
      card(`<img src="${U}/roof.jpg" alt=""><h6 class="elementor-icon-box-title"><span> Þakviðgerðir </span></h6>`),
    );
    expect(html).toContain('alt="Þakviðgerðir"');
  });

  it("prefers the heading inside the image's own widget when the card holds several", () => {
    const box = (title: string) =>
      `<div class="elementor-widget elementor-widget-image-box"><img src="${U}/${title}.jpg" alt=""><h4 class="elementor-image-box-title">${title}</h4></div>`;
    const html = run(card(box('Flísalögn') + box('Málningarvinna')));
    expect(html).toContain('alt="Flísalögn"');
    expect(html).toContain('alt="Málningarvinna"');
  });

  it('does not give several pictures in one card the same description', () => {
    const html = run(card(`<img src="${U}/a.jpg" alt=""><img src="${U}/b.jpg" alt=""><h2>Eitt</h2>`));
    expect(html).not.toContain('alt="Eitt"');
  });

  it('reads a heading broken over two lines as two words', () => {
    expect(run(card(`<img src="${U}/a.jpg" alt=""><h2>Þak<br>viðgerðir</h2>`))).toContain('alt="Þak viðgerðir"');
  });

  it('keeps an existing description, and does not guess when the card has several headings or none', () => {
    expect(run(card(`<img src="${U}/a.jpg" alt="Til"><h2>Annað</h2>`))).toContain('alt="Til"');
    expect(run(card(`<img src="${U}/a.jpg" alt=""><h2>Eitt</h2><h3>Tvö</h3>`))).toContain('alt=""');
    expect(run(card(`<img src="${U}/a.jpg" alt="">`))).toContain('alt=""');
  });
});
