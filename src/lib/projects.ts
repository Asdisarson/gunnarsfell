// Which projects get the showcase spots on the home page, and how a project's photos are counted.
import type { Project } from './wp';

/** The projects with the most photos first (the ones with the most to look at); only those with a cover. */
export function featuredProjects(verk: Project[], count: number): Project[] {
  return verk
    .filter((project) => project.image)
    .sort((a, b) => b.gallery.length - a.gallery.length)
    .slice(0, count);
}

/** "1 mynd", "5 myndir", "21 mynd": Icelandic counts numbers ending in one (but not eleven) in the singular. */
export function photoCount(count: number): string {
  const singular = count % 10 === 1 && count % 100 !== 11;
  return `${count} ${singular ? 'mynd' : 'myndir'}`;
}
