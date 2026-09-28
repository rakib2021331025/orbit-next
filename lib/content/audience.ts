import 'server-only';
import { prisma } from '@/lib/db/prisma';

/**
 * The course and batch NAMES admin content may be tagged with.
 *
 * Content — materials, assignments, notices, recordings — is addressed to
 * students by **name**, because those columns predate the course and batch
 * tables (see `lib/student/scope.ts`). So the admin forms offer names, not ids.
 *
 * "Other" exists for a reason and must not be dropped: older records and student
 * profiles carry course names that are no longer in the courses table, and a
 * strict list would make that content impossible to tag — or, worse, quietly
 * retag it and change who can see it.
 */

export interface AudienceOptions {
  /** Names from the courses table, in the reader's language where available. */
  courses: { value: string; label: string }[];
  /** Course names in use that are not in the courses table. */
  otherCourses: string[];
  batches: { value: string; label: string; course: string | null }[];
  otherBatches: string[];
}

async function safe<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

const norm = (value: unknown) => String(value ?? '').trim().toLowerCase();

/**
 * Everything selectable, gathered from the tables **and** from what is already
 * in use.
 *
 * `usedCourses` / `usedBatches` let a caller add the names its own table already
 * carries, so editing an old row never silently changes its audience.
 */
export async function audienceOptions(
  usedCourses: (string | null)[] = [],
  usedBatches: (string | null)[] = []
): Promise<AudienceOptions> {
  const [courseRows, batchRows, studentCourses, studentBatches] = await Promise.all([
    safe(
      () =>
        prisma.course.findMany({
          where: { name: { not: '' } },
          orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
          select: { name: true, name_bn: true },
        }),
      []
    ),
    safe(
      () =>
        prisma.batch.findMany({
          where: { name: { not: '' } },
          orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
          select: { name: true, name_bn: true, course: { select: { name: true } } },
        }),
      []
    ),
    safe(
      () =>
        prisma.student.findMany({
          where: { status: 'approved', course: { not: '' } },
          distinct: ['course'],
          select: { course: true },
        }),
      []
    ),
    safe(
      () =>
        prisma.student.findMany({
          where: { status: 'approved', batch: { not: null } },
          distinct: ['batch'],
          select: { batch: true },
        }),
      []
    ),
  ]);

  const courses = courseRows.map((course) => ({
    value: course.name,
    label: course.name_bn?.trim() ? `${course.name} / ${course.name_bn}` : course.name,
  }));
  const knownCourses = new Set(courses.map((course) => norm(course.value)));

  const batches = batchRows.map((batch) => ({
    value: batch.name,
    label: batch.name_bn?.trim() ? `${batch.name} / ${batch.name_bn}` : batch.name,
    course: batch.course?.name ?? null,
  }));
  const knownBatches = new Set(batches.map((batch) => norm(batch.value)));

  const extra = (names: (string | null)[], known: Set<string>) =>
    [
      ...new Set(
        names
          .map((name) => (name ?? '').trim())
          .filter((name) => name !== '' && !known.has(norm(name)))
      ),
    ].sort((a, b) => a.localeCompare(b));

  return {
    courses,
    otherCourses: extra([...studentCourses.map((row) => row.course), ...usedCourses], knownCourses),
    batches,
    otherBatches: extra([...studentBatches.map((row) => row.batch), ...usedBatches], knownBatches),
  };
}

/**
 * Whether a submitted name is one of the offered ones.
 *
 * Empty is allowed and means "everyone", which is the audience rule's own
 * meaning for an empty column — not a missing value.
 */
export function courseAllowed(options: AudienceOptions, value: string): boolean {
  const name = value.trim();
  if (name === '') return true;
  return (
    options.courses.some((course) => norm(course.value) === norm(name)) ||
    options.otherCourses.some((course) => norm(course) === norm(name))
  );
}

export function batchAllowed(options: AudienceOptions, value: string): boolean {
  const name = value.trim();
  if (name === '') return true;
  return (
    options.batches.some((batch) => norm(batch.value) === norm(name)) ||
    options.otherBatches.some((batch) => norm(batch) === norm(name))
  );
}
