import { describe, expect, it } from 'vitest';
import { featuredProjects, photoCount } from '../src/lib/projects';
import type { Project, WpImage } from '../src/lib/wp';

const image = {
  id: 1,
  url: '/a.jpg',
  width: 1,
  height: 1,
  alt: '',
  caption: '',
  mime: 'image/jpeg',
  srcset: '',
  sizes: {},
} satisfies WpImage;
const project = (slug: string, photos: number, cover: WpImage | null = image): Project => ({
  id: 1,
  slug,
  path: `/verk/${slug}/`,
  title: slug,
  date: '',
  modified: '',
  image: cover,
  seo: null,
  description: '',
  gallery: Array.from({ length: photos }, () => image),
});

describe('featuredProjects', () => {
  const verk = [project('two', 2), project('nine', 9), project('no-cover', 30, null), project('five', 5)];

  it('puts the projects with the most photos first and stops at the count', () => {
    expect(featuredProjects(verk, 2).map((p) => p.slug)).toEqual(['nine', 'five']);
  });

  it('leaves out projects without a cover photo', () => {
    expect(featuredProjects(verk, 10).map((p) => p.slug)).toEqual(['nine', 'five', 'two']);
  });

  it('does not reorder the list it was given', () => {
    featuredProjects(verk, 2);
    expect(verk[0].slug).toBe('two');
  });
});

describe('photoCount', () => {
  it('uses the singular for numbers ending in one, except eleven', () => {
    expect([1, 2, 11, 21, 60, 101, 111].map(photoCount)).toEqual([
      '1 mynd',
      '2 myndir',
      '11 myndir',
      '21 mynd',
      '60 myndir',
      '101 mynd',
      '111 myndir',
    ]);
  });
});
