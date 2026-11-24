// Which projects get the showcase spots on the home page, and how a project's photos are counted.
import type { Project } from './wp';

/** The photo a project is shown with: its cover, or its first photo when it was saved without one. */
export const coverOf = (project: Project) => project.image ?? project.gallery[0] ?? null;

/**
 * The projects for the home page's showcase spots: first the ones the client ticked "show on the front
 * page" for (in list order), then the ones with the most photos, until the count is reached.
 * A project with no photo at all is never shown.
 */
export function featuredProjects(verk: Project[], count: number): Project[] {
  const shown = verk.filter(coverOf);
  const chosen = shown.filter((project) => project.featured);
  const rest = shown.filter((project) => !project.featured).sort((a, b) => b.gallery.length - a.gallery.length);
  return [...chosen, ...rest].slice(0, count);
}

/** "1 mynd", "5 myndir", "21 mynd": Icelandic counts numbers ending in one (but not eleven) in the singular. */
export function photoCount(count: number): string {
  const singular = count % 10 === 1 && count % 100 !== 11;
  return `${count} ${singular ? 'mynd' : 'myndir'}`;
}
