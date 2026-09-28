import 'server-only';
import { prisma } from '@/lib/db/prisma';

/**
 * The queries behind the teacher portal.
 *
 * **Every one is keyed to the signed-in teacher's id.** A teacher sees their own
 * classes, their own exams and submissions on their own exams — never another
 * teacher's. There is no "all teachers" variant here, so a page cannot ask for
 * one by accident.
 */

const safe = async <T>(run: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await run();
  } catch {
    // Requires database configuration.
    return fallback;
  }
};

/* ------------------------------------------------------------- live classes */

/** Today's classes for this teacher. Cancelled ones are left out. */
export async function teacherClassesToday(teacherId: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86_400_000);

  return safe(
    () =>
      prisma.liveClass.findMany({
        where: {
          teacher_id: teacherId,
          class_date: { gte: today, lt: tomorrow },
          status: { not: 'cancelled' },
        },
        orderBy: { start_time: 'asc' },
      }),
    []
  );
}

/** The next seven days, not counting today. */
export async function teacherClassesUpcoming(teacherId: number, take = 6) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const weekEnd = new Date(today.getTime() + 8 * 86_400_000);

  return safe(
    () =>
      prisma.liveClass.findMany({
        where: {
          teacher_id: teacherId,
          class_date: { gte: tomorrow, lt: weekEnd },
          status: 'scheduled',
        },
        orderBy: [{ class_date: 'asc' }, { start_time: 'asc' }],
        take,
      }),
    []
  );
}

/** Every class this teacher owns, for the live-classes page. */
export async function teacherLiveClasses(teacherId: number, take = 100) {
  return safe(
    () =>
      prisma.liveClass.findMany({
        where: { teacher_id: teacherId },
        orderBy: [{ class_date: 'desc' }, { start_time: 'desc' }],
        take,
      }),
    []
  );
}

/* -------------------------------------------------------------------- exams */

/** This teacher's exams, with question and attempt counts. */
export async function teacherExams(teacherId: number, take = 100) {
  return safe(
    () =>
      prisma.exam.findMany({
        where: { teacher_id: teacherId },
        orderBy: [{ start_datetime: 'desc' }, { id: 'desc' }],
        take,
        include: {
          _count: { select: { examQuestion_exam: true, examAttempt_exam: true } },
        },
      }),
    []
  );
}

/** Exams still to run, for the dashboard. */
export async function teacherUpcomingExams(teacherId: number, take = 6) {
  return safe(
    () =>
      prisma.exam.findMany({
        where: {
          teacher_id: teacherId,
          end_datetime: { gte: new Date() },
          status: { not: 'cancelled' },
        },
        orderBy: { start_datetime: 'asc' },
        take,
        include: {
          _count: { select: { examQuestion_exam: true, examAttempt_exam: true } },
        },
      }),
    []
  );
}

/** One exam, but only if it belongs to this teacher. */
export async function teacherExam(teacherId: number, examId: number) {
  if (!Number.isInteger(examId) || examId <= 0) return null;
  return safe(
    () => prisma.exam.findFirst({ where: { id: examId, teacher_id: teacherId } }),
    null
  );
}

/* --------------------------------------------------------------- dashboard */

export interface TeacherStats {
  classesToday: number;
  pending: number;
  exams: number;
  students: number;
}

export async function teacherStats(teacherId: number, classesToday: number): Promise<TeacherStats> {
  const [pending, exams, students] = await Promise.all([
    safe(
      () =>
        prisma.examAttempt.count({
          where: { status: 'submitted', exam: { teacher_id: teacherId } },
        }),
      0
    ),
    safe(
      () => prisma.exam.count({ where: { teacher_id: teacherId, status: 'published' } }),
      0
    ),
    teacherStudentCount(teacherId),
  ]);

  return { classesToday, pending, exams, students };
}

/**
 * Students reachable through this teacher's assigned batches.
 *
 * `teacher_batches.batch` holds a NAME, and the original matches it against both
 * `students.batch` and `students.course` — an assignment may name either. Keeping
 * both halves is what stops the count reading zero for a teacher assigned to a
 * whole course rather than one batch.
 */
async function teacherStudentCount(teacherId: number): Promise<number> {
  return safe(async () => {
    const assigned = await prisma.teacherBatch.findMany({
      where: { teacher_id: teacherId },
      select: { batch: true },
    });
    const names = assigned.map((row) => row.batch).filter((name) => name.trim() !== '');
    if (names.length === 0) return 0;

    return prisma.student.count({
      where: { OR: [{ batch: { in: names } }, { course: { in: names } }] },
    });
  }, 0);
}

/** The subjects and batches an admin assigned to this teacher. */
export async function teacherAssignments(teacherId: number) {
  const [subjects, batches] = await Promise.all([
    safe(
      () =>
        prisma.teacherSubject.findMany({
          where: { teacher_id: teacherId },
          orderBy: { subject: 'asc' },
          select: { subject: true },
        }),
      []
    ),
    safe(
      () =>
        prisma.teacherBatch.findMany({
          where: { teacher_id: teacherId },
          orderBy: { batch: 'asc' },
          select: { batch: true },
        }),
      []
    ),
  ]);

  return {
    subjects: subjects.map((row) => row.subject),
    batches: batches.map((row) => row.batch),
  };
}
