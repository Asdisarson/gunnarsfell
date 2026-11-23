import type { APIRoute } from 'astro';

// Same rules as the Yoast-generated file: everything crawlable, sitemap index announced.
export const GET: APIRoute = ({ site }) =>
  new Response(`User-agent: *\nDisallow:\n\nSitemap: ${new URL('/sitemap_index.xml', site).href}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
