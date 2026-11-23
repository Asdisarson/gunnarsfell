import type { APIRoute } from 'astro';
import { entriesOf, SITEMAP_TYPES, urlSet, type SitemapType } from '../lib/sitemap';
import { getContent } from '../lib/wp';

export const getStaticPaths = () => SITEMAP_TYPES.map((type) => ({ params: { type } }));

export const GET: APIRoute = async ({ params, site }) =>
  new Response(urlSet(entriesOf(await getContent(), params.type as SitemapType), site!), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
