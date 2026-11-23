import type { APIRoute } from 'astro';
import { sitemapIndex } from '../lib/sitemap';
import { getContent } from '../lib/wp';

export const GET: APIRoute = async ({ site }) =>
  new Response(sitemapIndex(await getContent(), site!), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
