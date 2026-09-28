import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/db/prisma';
import { cached, TAGS } from '@/lib/cache';
import { gradeForPercentage, gradeForGpa } from './grades';

/**
 * Monthly exam results: the roster, the marks and the computation that turns
 * them into grades, a GPA and a class position.
 *
 * Ported from orbit_monthly_exam_results_compute(). Several rules here are not
 * the obvious implementation and each one changes a student's printed result:
 *
 *   - **A subject below its own pass marks is an F**, whatever the percentage
 *     band says. Exams can carry custom pass marks, so 45% may be a pass in one
 *     subject and a fail in another.
 *   - **Failing any subject makes the GPA 0.00**, not the average of the points.
 *     This is the local convention the marksheets are printed against.
 *   - **Only complete results are ranked.** A student missing one subject's marks
 *     has no position rather than a flattering one.
 *   - **Ties share a position.** Two students on the same GPA and total are both
 *     3rd, and the next is 5th — dense ranking would print two different
 *     positions for identical results.
 *   - The roster is "active enrolment in the batch/course, OR the legacy
 *     `students.batch_id`, OR already has marks". Dropping the last clause would
 *     erase the results of a student who has since left the batch.
 */

export interface SubjectRow {
  subject: {
    id: number;
    subject_name: string;
    subject_name_bn: string | null;
    full_marks: number;
    pass_marks: number;
  };
  full: number;
  pass: number;
  entered: boolean;
  absent: boolean;
  obtained: number | null;
  feedback: string;
  percentage: number | null;
  grade: string;
  point: number | null;
  passed: boolean | null;
}

export interface StudentResult {
  student: RosterStudent;
  subjects: SubjectRow[];
  entered: number;
  complete: boolean;
  hasMarks: boolean;
  totalFull: number;
  totalObtained: number;
  percentage: number;
  gpa: number | null;
  grade: string;
  passed: boolean;
  failedSubjects: number;
  position: number | null;
  hasPosition: boolean;
}

export interface ExamStats {
  roster: number;
  complete: number;
  passed: number;
  failed: number;
  passRate: number;
  highest: number;
  average: number;
  totalFull: number;
}

export interface RosterStudent {
  id: number;
  student_id_no: string | null;
  name: string;
  name_bn: string | null;
  phone: string;
  email: string;
  image: string;
  roll_number: string | null;
  guardian_phone: string | null;
}

export interface ExamComputation {
  subjects: SubjectRow['subject'][];
  students: Map<number, StudentResult>;
  stats: ExamStats;
}

export type ExamRecord = {
  id: number;
  batch_id: number | null;
  course_id: number | null;
  show_position: boolean;
  status: string;
  updated_at: Date | null;
};

/** The exam row, or null. */
export const monthlyExam = cache(async (examId: number) => {
  if (!Number.isInteger(examId) || examId <= 0) return null;
  try {
    return await prisma.monthlyExam.findUnique({ where: { id: examId } });
  } catch {
    return null;
  }
});

/**
 * Students on an exam.
 *
 * Ordered with roll numbers first, numerically — `roll_number` is a string
 * column, so a plain sort puts 10 before 2 and a teacher reading down the sheet
 * loses their place.
 */
export async function examRoster(exam: ExamRecord): Promise<RosterStudent[]> {
  const select = {
    id: true,
    student_id_no: true,
    name: true,
    name_bn: true,
    phone: true,
    email: true,
    image: true,
    roll_number: true,
    guardian_phone: true,
  } as const;

  try {
    const ids = new Set<number>();

    // Already has marks — always on the roster, even after leaving the batch.
    const marked = await prisma.examResult.findMany({
      where: { monthly_exam_id: exam.id },
      select: { student_id: true },
      distinct: ['student_id'],
    });
    for (const row of marked) ids.add(row.student_id);

    if (exam.batch_id) {
      const [enrolled, legacy] = await Promise.all([
        prisma.enrollment.findMany({
          where: { status: 'active', batch_id: exam.batch_id },
          select: { student_id: true },
        }),
        prisma.student.findMany({ where: { batch_id: exam.batch_id }, select: { id: true } }),
      ]);
      for (const row of enrolled) ids.add(row.student_id);
      for (const row of legacy) ids.add(row.id);
    } else if (exam.course_id) {
      // `students.batch_id` has no foreign key in this schema, so the legacy
      // membership is resolved in two steps rather than through a relation.
      const courseBatches = await prisma.batch.findMany({
        where: { course_id: exam.course_id },
        select: { id: true },
      });
      const [enrolled, legacy] = await Promise.all([
        prisma.enrollment.findMany({
          where: { status: 'active', course_id: exam.course_id },
          select: { student_id: true },
        }),
        courseBatches.length
          ? prisma.student.findMany({
              where: { batch_id: { in: courseBatches.map((batch) => batch.id) } },
              select: { id: true },
            })
          : Promise.resolve([] as { id: number }[]),
      ]);
      for (const row of enrolled) ids.add(row.student_id);
      for (const row of legacy) ids.add(row.id);
    }

    if (ids.size === 0) return [];

    const students = await prisma.student.findMany({
      where: { id: { in: [...ids] }, status: 'approved' },
      select,
    });

    return students.sort((a, b) => {
      const ra = (a.roll_number ?? '').trim();
      const rb = (b.roll_number ?? '').trim();
      if ((ra === '') !== (rb === '')) return ra === '' ? 1 : -1;
      if (ra !== '' && rb !== '') {
        const na = Number(ra);
        const nb = Number(rb);
        if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
      }
      return a.name.localeCompare(b.name);
    });
  } catch {
    return [];
  }
}

/** student_id → exam_subject_id → marks. */
async function examMarks(examId: number) {
  const map = new Map<number, Map<number, { marks: number; absent: boolean; feedback: string }>>();
  try {
    const rows = await prisma.examResult.findMany({
      where: { monthly_exam_id: examId, exam_subject_id: { not: null } },
      select: {
        student_id: true,
        exam_subject_id: true,
        marks_obtained: true,
        is_absent: true,
        feedback: true,
      },
    });
    for (const row of rows) {
      if (row.exam_subject_id === null) continue;
      const byStudent = map.get(row.student_id) ?? new Map();
      byStudent.set(row.exam_subject_id, {
        marks: Number(row.marks_obtained),
        absent: row.is_absent,
        feedback: row.feedback ?? '',
      });
      map.set(row.student_id, byStudent);
    }
  } catch {
    // Requires database configuration.
  }
  return map;
}

/**
 * The whole class's results for one exam.
 *
 * Memoised per request: a single page can need the same exam for the dashboard
 * summary, the merit list and one student's own result, and the computation is
 * the expensive part.
 */
async function computeExamResults(examId: number): Promise<ExamComputation | null> {
  const exam = await monthlyExam(examId);
  if (!exam) return null;

  let subjects: SubjectRow['subject'][] = [];
  try {
    const rows = await prisma.monthlyExamSubject.findMany({
      where: { exam_id: exam.id },
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        subject_name: true,
        subject_name_bn: true,
        full_marks: true,
        pass_marks: true,
      },
    });
    subjects = rows.map((row) => ({
      id: row.id,
      subject_name: row.subject_name,
      subject_name_bn: row.subject_name_bn,
      full_marks: Number(row.full_marks),
      pass_marks: Number(row.pass_marks),
    }));
  } catch {
    // Requires database configuration.
  }

  const [roster, marks] = await Promise.all([
    examRoster({
      id: exam.id,
      batch_id: exam.batch_id,
      course_id: exam.course_id,
      show_position: exam.show_position,
      status: exam.status,
      updated_at: exam.updated_at,
    }),
    examMarks(exam.id),
  ]);

  const totalFull = subjects.reduce((sum, subject) => sum + subject.full_marks, 0);
  const students = new Map<number, StudentResult>();

  for (const student of roster) {
    const rows: SubjectRow[] = [];
    let obtained = 0;
    const points: number[] = [];
    let failed = false;
    let entered = 0;

    for (const subject of subjects) {
      const cell = marks.get(student.id)?.get(subject.id) ?? null;
      const row: SubjectRow = {
        subject,
        full: subject.full_marks,
        pass: subject.pass_marks,
        entered: cell !== null,
        absent: cell ? cell.absent : false,
        obtained: cell ? (cell.absent ? 0 : cell.marks) : null,
        feedback: cell?.feedback ?? '',
        percentage: null,
        grade: '',
        point: null,
        passed: null,
      };

      if (cell !== null) {
        entered += 1;
        const value = row.obtained ?? 0;
        const percentage = subject.full_marks > 0 ? (value / subject.full_marks) * 100 : 0;
        const band = gradeForPercentage(percentage);

        row.percentage = round(percentage, 2);
        row.passed = !row.absent && value >= subject.pass_marks;
        // Below the subject's own pass marks is an F even when the percentage
        // band says otherwise — exams may set custom pass marks.
        row.grade = row.passed ? band.grade : 'F';
        row.point = row.passed ? band.point : 0;

        obtained += value;
        points.push(row.point);
        if (!row.passed) failed = true;
      }

      rows.push(row);
    }

    const complete = subjects.length > 0 && entered === subjects.length;
    // Failing one subject zeroes the GPA — the local convention, not the mean.
    const gpa =
      entered === 0 ? null : failed ? 0 : round(points.reduce((a, b) => a + b, 0) / points.length, 2);

    students.set(student.id, {
      student,
      subjects: rows,
      entered,
      complete,
      hasMarks: entered > 0,
      totalFull,
      totalObtained: round(obtained, 2),
      percentage: totalFull > 0 ? round((obtained / totalFull) * 100, 2) : 0,
      gpa,
      grade: gpa === null ? '' : failed ? 'F' : gradeForGpa(gpa),
      passed: complete && !failed,
      failedSubjects: rows.filter((row) => row.passed === false).length,
      position: null,
      hasPosition: exam.show_position,
    });
  }

  // Ranking, among complete results only.
  const ranked = [...students.values()]
    .filter((result) => result.complete)
    .sort((a, b) => {
      if (a.passed !== b.passed) return a.passed ? -1 : 1;
      if (a.passed && a.gpa !== b.gpa) return (b.gpa ?? 0) - (a.gpa ?? 0);
      return b.totalObtained - a.totalObtained;
    });

  let position = 0;
  let index = 0;
  let previousKey: string | null = null;
  for (const result of ranked) {
    index += 1;
    // Identical results share a position; the next one skips ahead.
    const key = `${result.passed ? 1 : 0}|${result.passed ? result.gpa : ''}|${result.totalObtained}`;
    if (key !== previousKey) {
      position = index;
      previousKey = key;
    }
    result.position = position;
  }

  const completeResults = [...students.values()].filter((result) => result.complete);
  const passedCount = completeResults.filter((result) => result.passed).length;
  const totals = completeResults.map((result) => result.totalObtained);

  return {
    subjects,
    students,
    stats: {
      roster: students.size,
      complete: completeResults.length,
      passed: passedCount,
      failed: completeResults.length - passedCount,
      passRate: completeResults.length ? round((passedCount / completeResults.length) * 100, 1) : 0,
      highest: totals.length ? Math.max(...totals) : 0,
      average: totals.length ? round(totals.reduce((a, b) => a + b, 0) / totals.length, 2) : 0,
      totalFull,
    },
  };
}

/**
 * A PUBLISHED exam's results are the same for everybody who may see them and
 * change only when staff edit marks or unpublish — both of which drop the
 * `published-exams` tag. So they sit in the shared cache instead of being
 * recomputed (roster, marks, ranking: ~6 queries) for every student, guardian
 * and merit-list view. Drafts are never cached: marks are being typed into them.
 */
const publishedExamResults = cached(computeExamResults, ['exam:results'], {
  tags: [TAGS.exams],
  revalidate: 3600,
});

export const examResults = cache(async (examId: number): Promise<ExamComputation | null> => {
  const exam = await monthlyExam(examId);
  if (!exam) return null;
  if (exam.status === 'published') {
    try {
      return await publishedExamResults(examId);
    } catch {
      // Fall through to a live computation rather than fail the page.
    }
  }
  return computeExamResults(examId);
});

/**
 * One student's result for one exam, still ranked against the whole class.
 *
 * Computing it in isolation would leave `position` empty, which is the single
 * number a student most wants to see.
 */
export async function studentExamResult(
  examId: number,
  studentId: number
): Promise<{ exam: NonNullable<Awaited<ReturnType<typeof monthlyExam>>>; result: StudentResult; stats: ExamStats } | null> {
  const [exam, computed] = await Promise.all([monthlyExam(examId), examResults(examId)]);
  if (!exam || !computed) return null;
  const result = computed.students.get(studentId);
  return result ? { exam, result, stats: computed.stats } : null;
}

/** A student's PUBLISHED results, newest exam month first. */
export async function studentPublishedResults(studentId: number, limit?: number) {
  let examIds: number[] = [];
  try {
    const exams = await prisma.monthlyExam.findMany({
      where: {
        status: 'published',
        examResult_monthly_exam: { some: { student_id: studentId } },
      },
      orderBy: [{ exam_month: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    examIds = exams.map((exam) => exam.id);
  } catch {
    return [];
  }

  const out: { exam: NonNullable<Awaited<ReturnType<typeof monthlyExam>>>; result: StudentResult; stats: ExamStats }[] = [];
  for (const examId of examIds) {
    const entry = await studentExamResult(examId, studentId);
    if (entry) {
      out.push(entry);
      if (limit && out.length >= limit) break;
    }
  }
  return out;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
