import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/db/prisma';
import { cached, TAGS } from '@/lib/cache';

/**
 * Branches for the public site.
 *
 * `publicBranches()` returns only active ones — a closed branch must disappear
 * from the navigation, the branch pages and the admission form, not linger as a
 * page that accepts enquiries for somewhere that no longer runs classes.
 *
 * The navbar shows a Branches entry only when at least one exists, which is why
 * this returns an array rather than throwing on an install with no branches
 * table yet.
 */

/** The query, in the shared cache (lib/cache). Errors are thrown, never cached. */
const loadBranches = cached(
  () =>
    prisma.branch.findMany({
      where: { status: 'active' },
      orderBy: [{ is_main: 'desc' }, { sort_order: 'asc' }, { name_en: 'asc' }],
      select: {
        id: true,
        slug: true,
        name_bn: true,
        name_en: true,
        address_bn: true,
        address_en: true,
        description_bn: true,
        description_en: true,
        phone: true,
        email: true,
        image: true,
        map_url: true,
        is_main: true,
      },
    }),
  ['site:branches'],
  { tags: [TAGS.branches], revalidate: 3600 }
);

export const publicBranches = cache(async () => {
  try {
    return await loadBranches();
  } catch {
    return [];
  }
});

export type PublicBranch = Awaited<ReturnType<typeof publicBranches>>[number];

export async function branchBySlug(slug: string): Promise<PublicBranch | null> {
  const clean = slug.trim().toLowerCase();
  if (clean === '') return null;
  const branches = await publicBranches();
  return branches.find((branch) => branch.slug === clean) ?? null;
}

/** Courses offered at one branch, via `branch_courses`. */
const loadBranchCourseIds = cached(
  async (branchId: number) =>
    (
      await prisma.branchCourse.findMany({
        where: { branch_id: branchId, status: 'active' },
        select: { course_id: true },
      })
    ).map((row) => row.course_id),
  ['site:branch-courses'],
  { tags: [TAGS.branches, TAGS.courses], revalidate: 3600 }
);

export async function branchCourseIds(branchId: number): Promise<number[]> {
  try {
    return await loadBranchCourseIds(branchId);
  } catch {
    return [];
  }
}
