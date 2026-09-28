import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { paginate, type Pager } from '@/lib/paginate';
import { toLatinDigits } from '@/lib/results/grades';

/**
 * Hand-entered exam results, from admin/exam_results_management.php.
 *
 * The same `exam_results` table also holds monthly exam marks, and those rows
 * are **read-only here**. They are graded, ranked and published together on the
 * monthly exam's own page, so every write in this file carries
 * `monthly_exam_id IS NULL` — a hand-made request cannot reach them either.
 */

export interface ResultFilters {
  type: '' | 'manual' | 'monthly';
  q: string;
  page: number;
}

export interface ResultRow {
  id: number;
  studentId: number;
  studentName: string;
  studentNameBn: string | null;
  studentIdNo: string;
  studentCourse: string;
  examName: string;
  examTitle: string;
  examTitleBn: string | null;
  examMonth: string | null;
  monthlyExamId: number | null;
  subject: string;
  marks: number;
  total: number;
  percentage: number;
  grade: string;
  absent: boolean;
  examDate: Date | null;
}

export interface ResultCounts {
  total: number;
  manual: number;
  monthly: number;
}

async function safe<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

export function resultFilters(params: Record<string, string | undefined>): ResultFilters {
  const type = params.type === 'manual' || params.type === 'monthly' ? params.type : '';
  return {
    type,
    q: (params.q ?? '').trim().slice(0, 100),
    page: Math.max(1, Number(params.page ?? 1) || 1),
  };
}

function resultWhere(filters: ResultFilters): Record<string, unknown> {
  const and: Record<string, unknown>[] = [];

  if (filters.type === 'manual') and.push({ monthly_exam_id: null });
  if (filters.type === 'monthly') and.push({ NOT: { monthly_exam_id: null } });

  if (filters.q !== '') {
    and.push({
      OR: [
        { student: { name: { contains: filters.q, mode: 'insensitive' } } },
        { student: { name_bn: { contains: filters.q, mode: 'insensitive' } } },
        { student: { student_id_no: { contains: filters.q, mode: 'insensitive' } } },
        { exam_name: { contains: filters.q, mode: 'insensitive' } },
        { subject: { contains: filters.q, mode: 'insensitive' } },
        { monthly_exam: { title: { contains: filters.q, mode: 'insensitive' } } },
        { monthly_exam: { title_bn: { contains: filters.q, mode: 'insensitive' } } },
      ],
    });
  }

  return and.length > 0 ? { AND: and } : {};
}

export async function resultCounts(): Promise<ResultCounts> {
  const [total, monthly] = await Promise.all([
    safe(() => prisma.examResult.count(), 0),
    safe(() => prisma.examResult.count({ where: { NOT: { monthly_exam_id: null } } }), 0),
  ]);
  return { total, manual: total - monthly, monthly };
}

export async function resultList(
  filters: ResultFilters
): Promise<{ rows: ResultRow[]; pager: Pager }> {
  const where = resultWhere(filters);
  const total = await safe(() => prisma.examResult.count({ where }), 0);
  const pager = paginate(total, 30, filters.page);

  const rows = await safe(
    () =>
      prisma.examResult.findMany({
        where,
        orderBy: [{ exam_date: 'desc' }, { id: 'desc' }],
        take: pager.perPage,
        skip: pager.offset,
        include: {
          student: {
            select: { id: true, name: true, name_bn: true, student_id_no: true, course: true },
          },
          monthly_exam: { select: { title: true, title_bn: true, exam_month: true } },
        },
      }),
    []
  );

  return {
    rows: rows.map((row) => {
      const marks = Number(row.marks_obtained);
      const totalMarks = Number(row.total_marks);

      return {
        id: row.id,
        studentId: row.student_id,
        studentName: row.student?.name ?? '',
        studentNameBn: row.student?.name_bn ?? null,
        studentIdNo: (row.student?.student_id_no ?? '').trim(),
        studentCourse: (row.student?.course ?? '').trim(),
        examName: row.exam_name,
        examTitle: row.monthly_exam?.title ?? row.exam_name,
        examTitleBn: row.monthly_exam?.title_bn ?? null,
        examMonth: row.monthly_exam?.exam_month ?? null,
        monthlyExamId: row.monthly_exam_id,
        subject: row.subject,
        marks,
        total: totalMarks,
        percentage: totalMarks > 0 ? Math.round((marks / totalMarks) * 10000) / 100 : 0,
        grade: (row.grade ?? '').trim(),
        // Only a monthly row records an absence; a hand-entered one has no such
        // concept.
        absent: row.monthly_exam_id !== null && row.is_absent,
        examDate: row.exam_date,
      };
    }),
    pager,
  };
}

/** A marks value in either script, rounded to two places, or null. */
export function marksValue(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const value = toLatinDigits(raw).trim();
  if (value === '' || !Number.isFinite(Number(value))) return null;
  return Math.round(Number(value) * 100) / 100;
}

export interface ResultInput {
  id: number;
  studentId: number;
  examName: string;
  subject: string;
  marks: string;
  total: string;
  grade: string;
  feedback: string;
  examDate: string;
}

export interface ResultOutcome {
  ok: boolean;
  /** A translation key. */
  message: string;
  vars?: Record<string, string>;
}

export async function saveResult(input: ResultInput): Promise<ResultOutcome> {
  if (input.id > 0) {
    const existing = await safe(
      () =>
        prisma.examResult.findUnique({
          where: { id: input.id },
          select: { id: true, monthly_exam_id: true },
        }),
      null
    );
    if (!existing) return { ok: false, message: 'aexres.not_found' };
    if (existing.monthly_exam_id !== null) return { ok: false, message: 'aexres.locked' };
  }

  const student =
    input.studentId > 0
      ? await safe(
          () =>
            prisma.student.findUnique({
              where: { id: input.studentId },
              select: { id: true, name: true, name_bn: true },
            }),
          null
        )
      : null;
  if (!student) return { ok: false, message: 'aexres.student_invalid' };

  const examName = input.examName.trim().slice(0, 255);
  const subject = input.subject.trim().slice(0, 255);
  if (examName === '' || subject === '') return { ok: false, message: 'aexres.required' };

  const marks = marksValue(input.marks);
  const total = marksValue(input.total);
  // The marks columns are DECIMAL(5,2); anything larger would be silently
  // truncated by the database.
  if (
    marks === null ||
    total === null ||
    total <= 0 ||
    total > 999.99 ||
    marks < 0 ||
    marks > total
  ) {
    return { ok: false, message: 'aexres.marks_invalid' };
  }

  const examDate = input.examDate.trim();
  if (examDate !== '') {
    const valid =
      /^\d{4}-\d{2}-\d{2}$/.test(examDate) &&
      new Date(`${examDate}T00:00:00.000Z`).toISOString().slice(0, 10) === examDate;
    if (!valid) return { ok: false, message: 'validation.date' };
  }

  const data = {
    student_id: student.id,
    exam_name: examName,
    subject,
    marks_obtained: marks,
    total_marks: total,
    grade: input.grade.trim() !== '' ? input.grade.trim().slice(0, 10) : null,
    feedback: input.feedback.trim() !== '' ? input.feedback.trim().slice(0, 5000) : null,
    exam_date: examDate !== '' ? new Date(`${examDate}T00:00:00.000Z`) : null,
  };

  try {
    if (input.id > 0) {
      // The monthly_exam_id guard is repeated in the WHERE, not only checked
      // above: it is the rule, so it belongs in the statement.
      const updated = await prisma.examResult.updateMany({
        where: { id: input.id, monthly_exam_id: null },
        data,
      });
      if (updated.count === 0) return { ok: false, message: 'aexres.not_found' };
    } else {
      await prisma.examResult.create({ data: { ...data, is_absent: false } });
    }
  } catch {
    return { ok: false, message: 'error.generic' };
  }

  return {
    ok: true,
    message: input.id > 0 ? 'aexres.updated' : 'aexres.added',
    vars: { name: student.name },
  };
}

export async function deleteResult(id: number): Promise<ResultOutcome> {
  try {
    const removed = await prisma.examResult.deleteMany({
      where: { id, monthly_exam_id: null },
    });
    return removed.count > 0
      ? { ok: true, message: 'aexres.deleted' }
      : { ok: false, message: 'aexres.not_found' };
  } catch {
    return { ok: false, message: 'error.generic' };
  }
}
