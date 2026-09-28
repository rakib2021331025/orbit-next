import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/db/prisma';
import { cached, TAGS } from '@/lib/cache';

/**
 * The public course list, as orbit_public_courses() builds it.
 *
 * Three rules from the original, all of which change what a visitor sees:
 *
 *   1. Only active courses, and only their active batches.
 *   2. **A batch at a deactivated branch is not offered either** — the join to
 *      `branches` is what enforces that. Without it, closing a branch leaves its
 *      batches on the public site accepting admissions.
 *   3. Order: featured first, then `sort_order`, then newest. That order is what
 *      the home page and the footer both rely on for "our courses".
 *
 * Memoised per request. The home page, its footer, the enquiry form and the
 * course pages all ask for this list.
 */

const loadCourses = cached(
  async () => {
    const courses = await prisma.course.findMany({
      where: { status: 'active' },
      include: {
        teacher: { select: { id: true, name: true, name_bn: true } },
        batch_course: {
          where: {
            status: 'active',
            // A batch with no branch belongs to every branch; one at a closed
            // branch is not on offer.
            OR: [{ branch_id: null }, { branch: { status: 'active' } }],
          },
          orderBy: [{ sort_order: 'asc' }, { batch_type: 'asc' }, { name: 'asc' }],
        },
      },
    });

    return courses
      .map((course) => ({
        ...course,
        teacher_name: course.teacher?.name ?? '',
        batches: course.batch_course,
        hasOnline: course.batch_course.some((batch) => batch.batch_type === 'online'),
        hasOffline: course.batch_course.some((batch) => batch.batch_type === 'offline'),
      }))
      .sort((a, b) => {
        if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1;
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        return b.id - a.id;
      });
  },
  ['site:courses'],
  // Batches and branches feed the list too, so their tags drop it as well.
  { tags: [TAGS.courses, TAGS.branches], revalidate: 600 }
);

export const publicCourses = cache(async () => {
  try {
    return await loadCourses();
  } catch {
    // The public site must still render on an install whose schema runner has
    // not caught up.
    return [];
  }
});

export type PublicCourse = Awaited<ReturnType<typeof publicCourses>>[number];

/**
 * Courses offered in one mode. A `hybrid` course counts as both, which is why
 * the filter tests membership rather than equality.
 */
export async function publicCoursesByType(type: 'online' | 'offline'): Promise<PublicCourse[]> {
  const courses = await publicCourses();
  return courses.filter((course) => course.course_type === type || course.course_type === 'hybrid');
}

export async function publicCourse(id: number): Promise<PublicCourse | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const courses = await publicCourses();
  return courses.find((course) => course.id === id) ?? null;
}

/**
 * The short description, falling back to the opening of the long one.
 *
 * A course card with an empty line under its title looks broken; a truncated
 * first sentence does not.
 */
export function courseSummary(
  course: { short_description?: string | null; short_description_bn?: string | null; description?: string | null; description_bn?: string | null },
  pick: (row: object, field: string) => string,
  limit = 140
): string {
  const short = pick(course, 'short_description').trim();
  if (short !== '') return short;

  const full = pick(course, 'description')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (full.length <= limit) return full;
  return `${full.slice(0, limit).replace(/\s+\S*$/, '')}…`;
}
