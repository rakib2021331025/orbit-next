import 'server-only';
import { prisma } from '@/lib/db/prisma';

/**
 * "Which students are in this course / batch", from includes/report_lib.php.
 *
 * Every report — dues, attendance, results, exports — has to answer this, and it
 * has **three** answers that all count, which is the whole reason this file
 * exists:
 *
 *   1. the batch on the student's record belongs to the course,
 *   2. the student has an active enrolment in it, or
 *   3. the student's free-text `course` column equals the course's name.
 *
 * The third is not legacy tidiness that can be dropped: students admitted before
 * enrolments existed have only that, and a report that omits them is quietly
 * wrong rather than visibly broken.
 */

type Where = Record<string, unknown>;

/** A student-scoped `where` fragment for one course. */
export async function studentsInCourse(courseId: number): Promise<Where | null> {
  if (!Number.isInteger(courseId) || courseId <= 0) return null;

  const [course, batches] = await Promise.all([
    prisma.course
      .findUnique({ where: { id: courseId }, select: { name: true } })
      .catch(() => null),
    prisma.batch
      .findMany({ where: { course_id: courseId }, select: { id: true } })
      .catch(() => []),
  ]);

  const or: Where[] = [
    { enrollment_student: { some: { status: 'active', course_id: courseId } } },
  ];
  if (batches.length > 0) or.push({ batch_id: { in: batches.map((batch) => batch.id) } });
  if (course) or.push({ course: course.name });

  return { OR: or };
}

/** A student-scoped `where` fragment for one batch. */
export function studentsInBatch(batchId: number): Where | null {
  if (!Number.isInteger(batchId) || batchId <= 0) return null;

  return {
    OR: [
      { batch_id: batchId },
      { enrollment_student: { some: { status: 'active', batch_id: batchId } } },
    ],
  };
}

/** The search an admin types into any student-shaped report. */
export function studentSearch(text: string): Where | null {
  const value = text.trim();
  if (value === '') return null;

  return {
    OR: [
      { name: { contains: value, mode: 'insensitive' } },
      { name_bn: { contains: value, mode: 'insensitive' } },
      { student_id_no: { contains: value, mode: 'insensitive' } },
      { phone: { contains: value } },
      { guardian_phone: { contains: value } },
    ],
  };
}

/**
 * What to show as a student's course and batch on a report row.
 *
 * The linked names win; the free-text columns are the fallback, so a pre-enrolment
 * student still reads correctly instead of showing two empty cells.
 */
export async function placementLabels(
  students: { id: number; course: string; batch: string | null; batch_id: number | null }[]
): Promise<Map<number, { course: string; batch: string }>> {
  const labels = new Map<number, { course: string; batch: string }>();
  if (students.length === 0) return labels;

  const [enrollments, batches] = await Promise.all([
    prisma.enrollment
      .findMany({
        where: { student_id: { in: students.map((student) => student.id) }, status: 'active' },
        select: { student_id: true, course_name: true, batch_name: true },
      })
      .catch(() => []),
    prisma.batch
      .findMany({
        where: {
          id: { in: students.map((student) => student.batch_id).filter((id): id is number => !!id) },
        },
        select: { id: true, name: true, course: { select: { name: true } } },
      })
      .catch(() => []),
  ]);

  const byStudent = new Map<number, { course: string; batch: string }>();
  for (const enrollment of enrollments) {
    if (byStudent.has(enrollment.student_id)) continue;
    byStudent.set(enrollment.student_id, {
      course: enrollment.course_name ?? '',
      batch: enrollment.batch_name ?? '',
    });
  }
  const batchById = new Map(batches.map((batch) => [batch.id, batch]));

  for (const student of students) {
    const enrolled = byStudent.get(student.id);
    const batch = student.batch_id ? batchById.get(student.batch_id) : undefined;

    labels.set(student.id, {
      course: enrolled?.course || batch?.course?.name || student.course || '',
      batch: enrolled?.batch || batch?.name || student.batch || '',
    });
  }

  return labels;
}
