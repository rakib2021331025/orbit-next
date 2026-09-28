import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

/**
 * Branch management, from admin/branches.php.
 *
 * Three rules keep the multi-branch data honest:
 *
 *   1. **The main branch cannot be deactivated or deleted.** Every record made
 *      before branches existed belongs to it, so it is where "no branch" means.
 *   2. **A branch nothing points at may be deleted; anything else is
 *      deactivated.** Deactivating hides it from the website and the admission
 *      form and keeps every record.
 *   3. Exactly **one** branch is main, so making one main clears the others in
 *      the same transaction.
 */

/** The tables that carry a branch_id, in the order the warning lists them. */
const DEPENDENT_TABLES = [
  'students',
  'admissions',
  'batches',
  'notice',
  'class_routine',
  'assignments',
  'study_materials',
  'live_classes',
  'exams',
  'admins',
  'attendance',
  'payments',
] as const;

export type DependentTable = (typeof DEPENDENT_TABLES)[number];

async function safe<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

/** `orbit_branch_slugify()`: lower case, non-alphanumerics to single hyphens. */
export function branchSlugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** What still points at a branch, table by table — empty means safe to delete. */
export async function branchDependents(branchId: number): Promise<Record<string, number>> {
  const counters: Record<DependentTable, () => Promise<number>> = {
    students: () => prisma.student.count({ where: { branch_id: branchId } }),
    admissions: () => prisma.admission.count({ where: { branch_id: branchId } }),
    batches: () => prisma.batch.count({ where: { branch_id: branchId } }),
    notice: () => prisma.notice.count({ where: { branch_id: branchId } }),
    class_routine: () => prisma.classRoutine.count({ where: { branch_id: branchId } }),
    assignments: () => prisma.assignment.count({ where: { branch_id: branchId } }),
    study_materials: () => prisma.studyMaterial.count({ where: { branch_id: branchId } }),
    live_classes: () => prisma.liveClass.count({ where: { branch_id: branchId } }),
    exams: () => prisma.exam.count({ where: { branch_id: branchId } }),
    admins: () => prisma.admin.count({ where: { branch_id: branchId } }),
    attendance: () => prisma.attendance.count({ where: { branch_id: branchId } }),
    payments: () => prisma.payment.count({ where: { branch_id: branchId } }),
  };

  // Independent counts, so they are issued together rather than one after
  // another; the result keeps the warning's table order.
  const counts = await Promise.all(DEPENDENT_TABLES.map((table) => safe(counters[table], 0)));

  const out: Record<string, number> = {};
  DEPENDENT_TABLES.forEach((table, index) => {
    if (counts[index] > 0) out[table] = counts[index];
  });
  return out;
}

/**
 * Which of these branches anything still points at — the "may it be deleted"
 * question for a whole list in ONE query.
 *
 * The list page used to call `branchDependents` per branch: twelve full
 * COUNTs each, attendance and payments included, only to compare them with
 * zero. EXISTS stops at the first row, and the table names come from the
 * fixed list above, never from input.
 */
export async function branchesInUse(branchIds: number[]): Promise<Set<number> | null> {
  if (branchIds.length === 0) return new Set();

  const exists = Prisma.join(
    DEPENDENT_TABLES.map(
      (table) => Prisma.sql`EXISTS (SELECT 1 FROM ${Prisma.raw(table)} t WHERE t.branch_id = b.id)`
    ),
    ' OR '
  );

  try {
    const rows = await prisma.$queryRaw<{ id: number }[]>`
      SELECT b.id FROM branches b
      WHERE b.id IN (${Prisma.join(branchIds)}) AND (${exists})`;
    return new Set(rows.map((row) => Number(row.id)));
  } catch {
    // Unknown: the caller must then treat every branch as in use.
    return null;
  }
}

/** Every branch with its courses, teachers and how many students it has. */
export async function branchRows() {
  const branches = await safe(
    () =>
      prisma.branch.findMany({
        orderBy: [{ sort_order: 'asc' }, { name_en: 'asc' }, { id: 'asc' }],
      }),
    []
  );

  const ids = branches.map((branch) => branch.id);
  const [courses, teachers, students, admins, batches] = await Promise.all([
    safe(
      () =>
        prisma.branchCourse.findMany({
          where: { branch_id: { in: ids }, status: 'active' },
          select: { branch_id: true, course: { select: { id: true, name: true, name_bn: true } } },
        }),
      []
    ),
    safe(
      () =>
        prisma.branchTeacher.findMany({
          where: { branch_id: { in: ids } },
          select: { branch_id: true, teacher: { select: { id: true, name: true } } },
        }),
      []
    ),
    safe(
      () =>
        prisma.student.groupBy({
          by: ['branch_id'],
          where: { branch_id: { in: ids } },
          _count: { _all: true },
        }),
      [] as { branch_id: number | null; _count: { _all: number } }[]
    ),
    safe(
      () =>
        prisma.admin.groupBy({
          by: ['branch_id'],
          where: { branch_id: { in: ids } },
          _count: { _all: true },
        }),
      [] as { branch_id: number | null; _count: { _all: number } }[]
    ),
    safe(
      () =>
        prisma.batch.groupBy({
          by: ['branch_id'],
          where: { branch_id: { in: ids } },
          _count: { _all: true },
        }),
      [] as { branch_id: number | null; _count: { _all: number } }[]
    ),
  ]);

  const countOf = (
    rows: { branch_id: number | null; _count: { _all: number } }[],
    id: number
  ) => rows.find((row) => row.branch_id === id)?._count._all ?? 0;

  return branches.map((branch) => ({
    ...branch,
    courses: courses.filter((row) => row.branch_id === branch.id).map((row) => row.course),
    teachers: teachers.filter((row) => row.branch_id === branch.id).map((row) => row.teacher),
    students: countOf(students, branch.id),
    admins: countOf(admins, branch.id),
    batches: countOf(batches, branch.id),
  }));
}

/** One branch with its ticked courses and teachers, for the form. */
export async function branchForEdit(id: number) {
  const branch = await safe(() => prisma.branch.findUnique({ where: { id } }), null);
  if (!branch) return null;

  const [courses, teachers] = await Promise.all([
    safe(
      () =>
        prisma.branchCourse.findMany({
          where: { branch_id: id, status: 'active' },
          select: { course_id: true },
        }),
      []
    ),
    safe(
      () =>
        prisma.branchTeacher.findMany({
          where: { branch_id: id },
          select: { teacher_id: true },
        }),
      []
    ),
  ]);

  return {
    branch,
    courseIds: courses.map((row) => row.course_id),
    teacherIds: teachers.map((row) => row.teacher_id),
  };
}

/**
 * Replaces a branch's course links.
 *
 * Unticked rows are **deleted** and ticked ones re-activated, so a course
 * removed and added back does not leave an inactive row behind that the public
 * page would skip.
 */
export async function setBranchCourses(branchId: number, courseIds: number[]): Promise<void> {
  if (courseIds.length === 0) {
    await prisma.branchCourse.deleteMany({ where: { branch_id: branchId } });
    return;
  }

  // Only ids that exist are linked; the foreign key would refuse the rest.
  const real = (
    await safe(
      () => prisma.course.findMany({ where: { id: { in: courseIds } }, select: { id: true } }),
      []
    )
  ).map((row) => row.id);

  // Removals and re-activations together, in one transaction.
  await prisma.$transaction([
    prisma.branchCourse.deleteMany({
      where: { branch_id: branchId, course_id: { notIn: real } },
    }),
    ...real.map((courseId) =>
      prisma.branchCourse.upsert({
        where: { branch_id_course_id: { branch_id: branchId, course_id: courseId } },
        create: { branch_id: branchId, course_id: courseId, status: 'active' },
        update: { status: 'active' },
      })
    ),
  ]);
}

/** The same for teachers, which have no status column. */
export async function setBranchTeachers(branchId: number, teacherIds: number[]): Promise<void> {
  if (teacherIds.length === 0) {
    await prisma.branchTeacher.deleteMany({ where: { branch_id: branchId } });
    return;
  }

  const real = (
    await safe(
      () => prisma.teacher.findMany({ where: { id: { in: teacherIds } }, select: { id: true } }),
      []
    )
  ).map((row) => row.id);

  await prisma.$transaction([
    prisma.branchTeacher.deleteMany({
      where: { branch_id: branchId, teacher_id: { notIn: real } },
    }),
    ...real.map((teacherId) =>
      prisma.branchTeacher.upsert({
        where: { branch_id_teacher_id: { branch_id: branchId, teacher_id: teacherId } },
        create: { branch_id: branchId, teacher_id: teacherId },
        update: {},
      })
    ),
  ]);
}
