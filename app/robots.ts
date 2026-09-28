import type { MetadataRoute } from 'next';

/**
 * /robots.txt, from robots.php.
 *
 * Public pages, CSS, JS and images stay crawlable — Google needs the CSS and JS
 * to render a page and judge it mobile-friendly, so blocking `/assets/` would
 * quietly hurt the site's ranking.
 *
 * The four portals are blocked, but **their login pages are explicitly allowed**.
 * That is not a contradiction: a crawler has to be able to fetch the login page
 * to read its `noindex` and drop it from the index. Disallowing it instead leaves
 * the URL listed forever with no description.
 */
export default function robots(): MetadataRoute.Robots {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '');

  const portals = ['admin', 'teacher', 'student', 'guardian'];

  return {
    rules: [
      {
        userAgent: '*',
        allow: [...portals.map((portal) => `/${portal}/login`), '/assets/'],
        disallow: [
          ...portals.map((portal) => `/${portal}/`),
          '/api/',
          // Private document routes: a marksheet or fee slip is addressed by a
          // signed link, and there is nothing for a crawler to index.
          '/marksheet-share',
          '/fee-slip',
        ],
      },
    ],
    sitemap: base !== '' ? `${base}/sitemap.xml` : undefined,
  };
}
