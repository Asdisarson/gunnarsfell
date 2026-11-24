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
const project = (slug: string, photos: number, cover: WpImage | null = image, featured = false): Project => ({
  id: 1,
  slug,
  path: `/verk/${slug}/`,
  title: slug,
  date: '',
  modified: '',
  image: cover,
  seo: null,
  description: '',
  featured,
  gallery: Array.from({ length: photos }, () => image),
});

describe('featuredProjects', () => {
  const verk = [project('two', 2), project('nine', 9), project('no-photos', 0, null), project('five', 5)];

  it('puts the projects with the most photos first and stops at the count', () => {
    expect(featuredProjects(verk, 2).map((p) => p.slug)).toEqual(['nine', 'five']);
  });

  it('leaves out projects without any photo', () => {
    expect(featuredProjects(verk, 10).map((p) => p.slug)).toEqual(['nine', 'five', 'two']);
  });

  it('does not reorder the list it was given', () => {
    featuredProjects(verk, 2);
    expect(verk[0].slug).toBe('two');
  });
});

describe('featuredProjects with projects the client chose', () => {
  const verk = [
    project('big', 9),
    project('chosen-small', 1, image, true),
    project('mid', 5),
    project('chosen-b', 3, image, true),
  ];

  it('puts the chosen projects first, in the order they are listed, then fills up by photo count', () => {
    expect(featuredProjects(verk, 3).map((p) => p.slug)).toEqual(['chosen-small', 'chosen-b', 'big']);
  });

  it('keeps to the count when more are chosen than fit', () => {
    expect(featuredProjects(verk, 1).map((p) => p.slug)).toEqual(['chosen-small']);
  });

  it('accepts a chosen project that has photos but no cover, and skips one with no photos at all', () => {
    const list = [project('no-cover', 2, null, true), project('empty', 0, null, true), project('plain', 4)];
    expect(featuredProjects(list, 3).map((p) => p.slug)).toEqual(['no-cover', 'plain']);
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
