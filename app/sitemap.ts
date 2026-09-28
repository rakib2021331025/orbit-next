import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/db/prisma';
import { publicCourses } from '@/lib/site/courses';
import { publicBranches } from '@/lib/site/branches';

/**
 * /sitemap.xml, from sitemap.php.
 *
 * Built live from the database, so a new course or branch is listed without a
 * manual step. Portals and private routes are never listed.
 *
 * `lastModified` is a real timestamp taken from the data — the newest course,
 * notice or photo — rather than "now". A sitemap that claims every page changed
 * today teaches crawlers to ignore the field.
 */
/**
 * Rebuilt hourly rather than at build time.
 *
 * Without this the sitemap is generated once, during the build — which happens
 * before the database is reachable — and would be frozen with no courses in it
 * for the life of the deployment.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

  const latest = async (run: () => Promise<Date | null>): Promise<Date | undefined> => {
    try {
      return (await run()) ?? undefined;
    } catch {
      return undefined;
    }
  };

  const [courseMod, noticeMod, galleryMod, courses, branches] = await Promise.all([
    latest(async () =>
      (await prisma.course.aggregate({ where: { status: 'active' }, _max: { updated_at: true } }))._max.updated_at
    ),
    latest(async () => (await prisma.notice.aggregate({ _max: { created_at: true } }))._max.created_at),
    latest(async () =>
      (await prisma.gallery.aggregate({ where: { status: 'active' }, _max: { created_at: true } }))._max.created_at
    ),
    publicCourses(),
    publicBranches(),
  ]);

  const homeMod = [courseMod, noticeMod, galleryMod]
    .filter((date): date is Date => date instanceof Date)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: homeMod, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/courses`, lastModified: courseMod, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${base}/online-classes`, lastModified: courseMod, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${base}/notices`, lastModified: noticeMod, changeFrequency: 'daily', priority: 0.7 },
    { url: `${base}/gallery`, lastModified: galleryMod, changeFrequency: 'weekly', priority: 0.5 },
    { url: `${base}/results`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${base}/trial-classes`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/apply`, lastModified: courseMod, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${base}/inquiry`, changeFrequency: 'monthly', priority: 0.5 },
  ];

  if (branches.length > 0) {
    entries.push({ url: `${base}/branches`, changeFrequency: 'monthly', priority: 0.6 });
    for (const branch of branches) {
      entries.push({
        url: `${base}/branches/${branch.slug}`,
        changeFrequency: 'monthly',
        priority: 0.6,
      });
    }
  }

  for (const course of courses) {
    entries.push({
      url: `${base}/courses/${course.id}`,
      lastModified: course.updated_at,
      changeFrequency: 'weekly',
      priority: 0.8,
    });
  }

  return entries;
}
