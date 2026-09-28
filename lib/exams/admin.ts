import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { branchWhere } from '@/lib/auth/guards';

/**
 * The admin view of online exams, from admin/exams_management.php.
 *
 * The same exams the teacher screen shows, **without the ownership filter** —
 * an administrator sees every teacher's papers — plus the filters that make a
 * long list usable: teacher, course, batch, type and status.
 */

export interface AdminExamFilters {
  search: string;
  teacherId: number;
  course: string;
  batch: string;
  type: string;
  status: string;
}

async function safe<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

export async function adminExams(filters: AdminExamFilters, take = 200) {
  const where: Record<string, unknown> = { ...(await branchWhere()) };
  const and: Record<string, unknown>[] = [];

  const search = filters.search.trim();
  if (search !== '') {
    and.push({
      OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { subject: { contains: search, mode: 'insensitive' } },
      ],
    });
  }
  if (filters.teacherId > 0) and.push({ teacher_id: filters.teacherId });
  if (filters.course !== '') and.push({ course: filters.course });
  if (filters.batch !== '') and.push({ batch: filters.batch });
  if (['mcq', 'cq', 'mixed'].includes(filters.type)) and.push({ exam_type: filters.type });
  if (['draft', 'published', 'cancelled'].includes(filters.status)) and.push({ status: filters.status });

  if (and.length > 0) where.AND = and;

  return safe(
    () =>
      prisma.exam.findMany({
        where,
        orderBy: [{ start_datetime: 'desc' }, { id: 'desc' }],
        take,
        include: {
          _count: { select: { examQuestion_exam: true, examAttempt_exam: true } },
          teacher: { select: { id: true, name: true, name_bn: true } },
        },
      }),
    []
  );
}

export type AdminExam = Awaited<ReturnType<typeof adminExams>>[number];

/** One exam for the admin question editor — no ownership lock. */
export async function adminExam(examId: number) {
  if (!Number.isInteger(examId) || examId <= 0) return null;
  return safe(
    () =>
      prisma.exam.findUnique({
        where: { id: examId },
        include: { _count: { select: { examQuestion_exam: true, examAttempt_exam: true } } },
      }),
    null
  );
}

/** Teachers who have at least one exam, for the filter. */
export async function examTeachers() {
  const rows = await safe(
    () =>
      prisma.exam.findMany({
        distinct: ['teacher_id'],
        where: { teacher_id: { not: null } },
        select: { teacher_id: true },
      }),
    []
  );
  const ids = rows.map((row) => row.teacher_id).filter((id): id is number => !!id);
  if (ids.length === 0) return [];

  return safe(
    () =>
      prisma.teacher.findMany({
        where: { id: { in: ids } },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, name_bn: true },
      }),
    []
  );
}
