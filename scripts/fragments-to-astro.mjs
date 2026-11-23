// One-off: writes src/pages/*.astro for the six WordPress pages from reference/fragments.
// The generated files are source from then on; rerunning overwrites hand edits.
// Usage: node scripts/fragments-to-astro.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { load } from 'cheerio';
import * as prettier from 'prettier';

const ROOT = new URL('../', import.meta.url);
const PAGES = {
  home: 'index',
  'um-okkur': 'um-okkur',
  thjonusta: 'thjonusta',
  'unnin-verk': 'unnin-verk',
  umsagnir: 'umsagnir',
  'hafa-samband': 'hafa-samband',
};
// Local's import rewrote the mail domain; production addresses are @gunnarsfell.is.
const fixEmail = (html) => html.replace(/@localhost(\.is)?/g, '@gunnarsfell.is');

const testimonials = new Map();

for (const [name, route] of Object.entries(PAGES)) {
  const source = await readFile(new URL(`reference/fragments/${name}.html`, ROOT), 'utf8');
  const bodyClass = source.match(/<!-- body class: (.*?) -->/)[1].replace('ast-desktop ', '');
  const $ = load(source, null, false);
  const used = new Set();

  $('.elementor-widget-wpforms').each((_, el) => {
    const id = $(el).find('form').attr('data-formid');
    $(el)
      .find('.elementor-widget-container')
      .html(`<gf-form variant="${id === '1043' ? 'full' : 'quick'}"></gf-form>`);
    used.add('ContactForm');
  });
  $('.elementor-widget-testimonial-carousel').each((_, el) => {
    const slides = $(el)
      .find('.swiper-slide')
      .map((_, slide) => ({
        text: $(slide).find('.elementor-testimonial__text').text().trim(),
        image: $(slide).find('img').attr('src'),
        name: $(slide).find('.elementor-testimonial__name').text().trim(),
        title: $(slide).find('.elementor-testimonial__title').text().trim(),
      }))
      .get();
    const key = JSON.stringify(slides);
    if (!testimonials.has(key)) testimonials.set(key, { id: `set${testimonials.size + 1}`, slides });
    $(el)
      .find('.elementor-widget-container')
      .html(`<gf-slides set="${testimonials.get(key).id}"></gf-slides>`);
    used.add('TestimonialSlides');
  });
  $('.elementor-widget-portfolio .elementor-portfolio').each((_, el) => {
    $(el).replaceWith('<gf-grid></gf-grid>');
    used.add('ProjectGrid');
  });
  $('*').removeAttr('data-e-action-hash');
  $('*')
    .contents()
    .filter((_, node) => node.type === 'comment')
    .remove();

  const html = fixEmail($('#content').html())
    .replace(/[{}]/g, (c) => `&#${c.charCodeAt(0)};`)
    .replace(/<gf-form variant="(\w+)"><\/gf-form>/g, '<ContactForm variant="$1" />')
    .replace(/<gf-slides set="(\w+)"><\/gf-slides>/g, '<TestimonialSlides set="$1" />')
    .replace(/<gf-grid><\/gf-grid>/g, '<ProjectGrid />');

  const imports = [...used].map((c) => `import ${c} from '../components/${c}.astro';`).join('\n');
  const path = route === 'index' ? '/' : `/${route}/`;
  const file = `---
import Base from '../layouts/Base.astro';
${imports}
---

<Base path="${path}" type="page" bodyClass="${bodyClass}">
${html}
</Base>
`;
  const formatted = await prettier.format(file, {
    parser: 'astro',
    plugins: ['prettier-plugin-astro'],
    printWidth: 120,
  });
  await mkdir(new URL('src/pages/', ROOT), { recursive: true });
  await writeFile(new URL(`src/pages/${route}.astro`, ROOT), formatted);
  console.log(`${route}.astro`, [...used].join(', '));
}

// The project page: one captured project becomes the template for all of them.
{
  const source = await readFile(new URL('reference/fragments/verk_nyr-solpallur.html', ROOT), 'utf8');
  const bodyClass = source
    .match(/<!-- body class: (.*?) -->/)[1]
    .replace('ast-desktop ', '')
    .replace('postid-9961', 'postid-__ID__');
  const $ = load(source, null, false);
  $('.elementor-widget-wpforms .elementor-widget-container').html('<gf-form variant="quick"></gf-form>');
  $('.elementor-widget-image-gallery .elementor-widget-container').html('<gf-gallery></gf-gallery>');
  $('h1.elementor-heading-title').text('__TITLE__');
  $('.elementor-element-5724572d').attr('data-cover', '');
  $('*')
    .contents()
    .filter((_, node) => node.type === 'comment')
    .remove();
  const html = $('#content')
    .html()
    .replace(/[{}]/g, (c) => `&#${c.charCodeAt(0)};`)
    .replace('post-9961', 'post-__ID__')
    .replace('<gf-form variant="quick"></gf-form>', '<ContactForm variant="quick" />')
    .replace('<gf-gallery></gf-gallery>', '<ProjectGallery project={project} />');
  const file = `---
import Base from '../../layouts/Base.astro';
import ContactForm from '../../components/ContactForm.astro';
import ProjectGallery from '../../components/ProjectGallery.astro';
import { getContent, type Project } from '../../lib/wp';
import { projectDescription } from '../../site';

export async function getStaticPaths() {
  const { verk } = await getContent();
  return verk.map((project) => ({ params: { slug: project.slug }, props: { project } }));
}

interface Props {
  project: Project;
}

const { project } = Astro.props;
const cover = project.image ? \`background-image:url("\${project.image.url}")\` : undefined;
---

<Base
  path={project.path}
  type="verk"
  seo={project.seo}
  fallbackDescription={projectDescription(project.title, project.description)}
  bodyClass="${bodyClass}"
>
${html}
</Base>
`;
  const formatted = (
    await prettier.format(file, { parser: 'astro', plugins: ['prettier-plugin-astro'], printWidth: 120 })
  )
    .replace(/bodyClass="([^"]*)postid-__ID__([^"]*)"/, 'bodyClass={`$1postid-${project.id}$2`}')
    .replace(/class="([^"]*)post-__ID__([^"]*)"/, 'class={`$1post-${project.id}$2`}')
    .replace('__TITLE__', '{project.title}')
    .replace(/data-cover(="")?/, 'style={cover}');
  await mkdir(new URL('src/pages/verk/', ROOT), { recursive: true });
  await writeFile(new URL('src/pages/verk/[slug].astro', ROOT), formatted);
  console.log('verk/[slug].astro');
}

await mkdir(new URL('src/data/', ROOT), { recursive: true });
const sets = Object.fromEntries([...testimonials.values()].map(({ id, slides }) => [id, slides]));
await writeFile(new URL('src/data/testimonials.json', ROOT), JSON.stringify(sets, null, 2));
console.log(
  'testimonial sets:',
  Object.entries(sets)
    .map(([id, s]) => `${id}=${s.length}`)
    .join(' '),
);
