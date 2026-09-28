import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { scopeWhere, scopeOpenWhere, type StudentScope } from './scope';
import { rowDue } from '@/lib/fees/core';

/**
 * The queries behind the student portal.
 *
 * Every one of them narrows by the student's audience scope. The rule that makes
 * this safe: when `scopeWhere` returns null the student has no course or batch,
 * and the answer is an EMPTY LIST — never an unfiltered query. A helper that
 * "falls back to no filter" would hand every student the whole institute's
 * material, which is the failure this module is shaped to prevent.
 */

const safe = async <T>(run: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await run();
  } catch {
    // Requires database configuration.
    return fallback;
  }
};

/* ------------------------------------------------------------- study material */

export async function studentMaterials(scope: StudentScope, take = 20) {
  const where = scopeWhere(scope);
  if (where === null) return [];

  return safe(
    () =>
      prisma.studyMaterial.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        take,
        select: {
          id: true,
          title: true,
          description: true,
          file_path: true,
          file_type: true,
          course: true,
          batch: true,
          created_at: true,
        },
      }),
    []
  );
}

/**
 * PDF class notes for the student's courses and batches, from the notes half of
 * student/materials.php.
 *
 * `admin_notes.batch` holds **one course or batch name**, so the match is a
 * plain name comparison against every name the student is known by — the same
 * scoping the rest of the portal uses.
 */
export async function studentNotes(scope: StudentScope, take = 100) {
  const names = [...scope.courses, ...scope.batches];
  if (names.length === 0) return [];

  return safe(
    () =>
      prisma.adminNote.findMany({
        where: { batch: { in: names } },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        take,
        select: {
          id: true,
          title: true,
          message: true,
          pdf_path: true,
          batch: true,
          created_at: true,
        },
      }),
    []
  );
}

/* ---------------------------------------------------------------- assignments */

export async function studentAssignments(studentId: number, scope: StudentScope, take = 20) {
  const where = scopeWhere(scope);
  if (where === null) return [];

  const rows = await safe(
    () =>
      prisma.assignment.findMany({
        where,
        orderBy: [{ due_date: 'asc' }, { id: 'desc' }],
        take,
        select: {
          id: true,
          title: true,
          description: true,
          due_date: true,
          file_path: true,
          course: true,
          batch: true,
          created_at: true,
          assignmentSubmission_assignment: {
            where: { student_id: studentId },
            select: { id: true, submitted_at: true, file_path: true, marks: true, feedback: true },
            take: 1,
          },
        },
      }),
    []
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return rows
    .map((row) => {
      const submission = row.assignmentSubmission_assignment[0] ?? null;
      const due = row.due_date;
      return {
        ...row,
        submission,
        overdue: Boolean(due && due < today && !submission),
        // "Open" means not yet submitted and not past the due date.
        open: !submission && (!due || due >= today),
      };
    })
    // Open ones first, by due date; then the rest, newest first.
    .sort((a, b) => {
      if (a.open !== b.open) return a.open ? -1 : 1;
      if (a.open && a.due_date && b.due_date) return a.due_date.getTime() - b.due_date.getTime();
      return b.id - a.id;
    });
}

/* -------------------------------------------------------------------- notices */

/**
 * Notices for the student: institute-wide plus their own branch's.
 *
 * `notice` carries no course or batch column, so only the branch narrows it —
 * which is why `scopeOpenWhere` is not used here.
 */
export async function studentNotices(scope: StudentScope, take = 20) {
  const branch =
    scope.branchIds.length > 0
      ? { OR: [{ branch_id: null }, { branch_id: { in: scope.branchIds } }] }
      : {};

  return safe(
    () =>
      prisma.notice.findMany({
        where: { status: 'active', ...branch },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        take,
        select: { id: true, title: true, description: true, created_at: true, branch_id: true },
      }),
    []
  );
}

/* -------------------------------------------------------------------- routine */

export async function studentRoutine(scope: StudentScope) {
  const where = scopeWhere(scope);
  if (where === null) return [];

  return safe(
    () =>
      prisma.classRoutine.findMany({
        where,
        orderBy: [{ day_of_week: 'asc' }, { start_time: 'asc' }],
        select: {
          id: true,
          day_of_week: true,
          start_time: true,
          end_time: true,
          subject: true,
          teacher_name: true,
          room_number: true,
          course: true,
          batch: true,
        },
      }),
    []
  );
}

/* --------------------------------------------------------------- live classes */

/**
 * Live classes for the student.
 *
 * `upcoming` includes a class that has STARTED but not finished — a student who
 * joins five minutes late still needs the link. That is what the original's
 * `class_date + start_time + duration >= NOW()` expresses.
 */
export async function studentLiveClasses(scope: StudentScope, upcomingOnly = true, take = 50) {
  const where = scopeOpenWhere(scope, 'batch', 'course');

  const rows = await safe(
    () =>
      prisma.liveClass.findMany({
        where: { ...where, ...(upcomingOnly ? { status: 'scheduled' } : {}) },
        orderBy: upcomingOnly
          ? [{ class_date: 'asc' }, { start_time: 'asc' }]
          : [{ class_date: 'desc' }, { start_time: 'desc' }],
        take,
        select: {
          id: true,
          subject: true,
          topic: true,
          teacher_name: true,
          course: true,
          batch: true,
          class_date: true,
          start_time: true,
          duration_minutes: true,
          description: true,
          meet_url: true,
          status: true,
          class_mode: true,
          provider: true,
        },
      }),
    []
  );

  if (!upcomingOnly) return rows;

  const now = Date.now();
  return rows.filter((row) => endsAt(row.class_date, row.start_time, row.duration_minutes) >= now);
}

/** When a class finishes, as a timestamp. */
export function endsAt(date: Date, startTime: Date, durationMinutes: number): number {
  // `start_time` is a TIME column, so Prisma returns it as a Date on the epoch;
  // only its clock part is meaningful and it is grafted onto the class date.
  const start = new Date(date);
  start.setHours(startTime.getUTCHours(), startTime.getUTCMinutes(), startTime.getUTCSeconds(), 0);
  return start.getTime() + durationMinutes * 60_000;
}

/** When a class starts, as a timestamp. */
export function startsAt(date: Date, startTime: Date): number {
  const start = new Date(date);
  start.setHours(startTime.getUTCHours(), startTime.getUTCMinutes(), startTime.getUTCSeconds(), 0);
  return start.getTime();
}

/* ----------------------------------------------------------------- recordings */

export async function studentRecordings(scope: StudentScope, take = 50) {
  const where = scopeOpenWhere(scope, 'batch', 'course');

  return safe(
    () =>
      prisma.recordedClass.findMany({
        where: { ...where, status: 'published' },
        orderBy: [{ class_date: 'desc' }, { id: 'desc' }],
        take,
        select: {
          id: true,
          title: true,
          description: true,
          subject: true,
          course: true,
          batch: true,
          teacher_name: true,
          class_date: true,
          duration_minutes: true,
          drive_file_id: true,
        },
      }),
    []
  );
}

/* ---------------------------------------------------------------------- exams */

/** Online exams the student may see, with their own attempt if any. */
export async function studentExams(studentId: number, scope: StudentScope, take = 50) {
  const where = scopeOpenWhere(scope, 'batch', 'course');

  return safe(
    () =>
      prisma.exam.findMany({
        where: { ...where, status: 'published' },
        orderBy: [{ start_datetime: 'desc' }, { id: 'desc' }],
        take,
        select: {
          id: true,
          title: true,
          subject: true,
          course: true,
          batch: true,
          total_marks: true,
          duration_minutes: true,
          start_datetime: true,
          end_datetime: true,
          instructions: true,
          examAttempt_exam: {
            where: { student_id: studentId },
            select: {
              id: true,
              status: true,
              started_at: true,
              submitted_at: true,
              total_score: true,
            },
            take: 1,
          },
        },
      }),
    []
  );
}

/* ----------------------------------------------------------------- attendance */

/** The date window shared by the attendance list and its summary. */
function attendanceWhere(studentId: number, from?: Date, to?: Date) {
  return {
    student_id: studentId,
    ...(from || to
      ? { attendance_date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {}),
  };
}

/**
 * A student's attendance rows, newest first.
 *
 * `page` bounds the read. Without a date window a student's history grows by
 * a row per class for as long as they study, so a page that only shows the
 * latest few — or a page at a time — passes one, and figures come from
 * `studentAttendanceSummary` instead of from the rows.
 */
export async function studentAttendance(
  studentId: number,
  from?: Date,
  to?: Date,
  page?: { take: number; skip?: number }
) {
  return safe(
    () =>
      prisma.attendance.findMany({
        where: attendanceWhere(studentId, from, to),
        orderBy: { attendance_date: 'desc' },
        ...(page ? { take: page.take, skip: page.skip ?? 0 } : {}),
        select: {
          id: true,
          attendance_date: true,
          status: true,
          class_label: true,
          note: true,
          course_id: true,
          batch_id: true,
        },
      }),
    []
  );
}

export interface AttendanceSummary {
  total: number;
  present: number;
  late: number;
  halfDay: number;
  absent: number;
  /** present + late + ½ × half_day. */
  attended: number;
  rate: number;
}

/**
 * The attendance rate, from includes/attendance_lib.php:
 *
 *     rate = (present + late + ½ × half_day) ÷ classes recorded
 *
 * The two weightings are the institution's rule, not a convenience:
 *
 *   - **late counts in full.** A student who arrived is not absent, and counting
 *     it against them would make the figure a punctuality score wearing an
 *     attendance label.
 *   - **half_day counts as a half.** It exists precisely because neither present
 *     nor absent is true.
 *
 * There are four statuses and no more — `present`, `late`, `half_day`, `absent`.
 */
export function attendanceSummary(rows: { status: string | null }[]): AttendanceSummary {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (row.status !== null) counts[row.status] = (counts[row.status] ?? 0) + 1;
  }
  return attendanceSummaryFromCounts(counts);
}

/** The same summary from per-status counts, e.g. a database groupBy. */
export function attendanceSummaryFromCounts(counts: Record<string, number>): AttendanceSummary {
  const present = counts.present ?? 0;
  const late = counts.late ?? 0;
  const halfDay = counts.half_day ?? 0;
  const absent = counts.absent ?? 0;

  const total = present + late + halfDay + absent;
  const attended = present + late + 0.5 * halfDay;

  return {
    total,
    present,
    late,
    halfDay,
    absent,
    attended,
    rate: total === 0 ? 0 : Math.round((attended / total) * 1000) / 10,
  };
}

/**
 * `attendanceSummary` computed in the database: one row per status instead of
 * every mark the student has ever had. For pages that show the figures but not
 * the whole history (dashboards, progress, the admin profile).
 */
export async function studentAttendanceSummary(
  studentId: number,
  from?: Date,
  to?: Date
): Promise<AttendanceSummary> {
  return (await studentAttendanceCounts(studentId, from, to)).summary;
}

/**
 * The summary plus how many rows there are in all — including any row with no
 * status, which the summary does not count but a paged list still shows.
 */
export async function studentAttendanceCounts(
  studentId: number,
  from?: Date,
  to?: Date
): Promise<{ summary: AttendanceSummary; records: number }> {
  const groups = await safe(
    () =>
      prisma.attendance.groupBy({
        by: ['status'],
        where: attendanceWhere(studentId, from, to),
        _count: { _all: true },
      }),
    [] as { status: string | null; _count: { _all: number } }[]
  );
  const counts: Record<string, number> = {};
  let records = 0;
  for (const group of groups) {
    records += group._count._all;
    if (group.status !== null) counts[group.status] = group._count._all;
  }
  return { summary: attendanceSummaryFromCounts(counts), records };
}

/* ------------------------------------------------------------------- payments */

/**
 * Only the three columns `paymentSummary` reads, for pages that show the
 * totals but not the list.
 */
export async function studentPaymentTotals(studentId: number): Promise<PaymentSummary> {
  const rows = await safe(
    () =>
      prisma.payment.findMany({
        where: { student_id: studentId },
        select: { amount: true, due_amount: true, payment_status: true },
      }),
    [] as { amount: unknown; due_amount: unknown; payment_status: string | null }[]
  );
  return paymentSummary(rows);
}

export async function studentPayments(studentId: number) {
  return safe(
    () =>
      prisma.payment.findMany({
        where: { student_id: studentId },
        orderBy: [{ payment_date: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          amount: true,
          due_amount: true,
          payment_month: true,
          payment_status: true,
          payment_date: true,
          payment_method: true,
          receipt_number: true,
          fee_type: true,
          notes: true,
          due_date: true,
          discount_amount: true,
          original_amount: true,
          installment_no: true,
        },
      }),
    []
  );
}

export interface PaymentSummary {
  paid: number;
  due: number;
  count: number;
}

/**
 * Totals, from orbit_student_payment_totals():
 *
 *   paid = Σ amount of PAID rows
 *   due  = Σ due_amount of paid rows (a partial payment's remainder)
 *        + Σ amount of every row not yet paid
 *
 * An unpaid row's `amount` is the charge itself, not money received — counting
 * it as paid would tell a parent the fees are settled when nothing came in.
 */
export function paymentSummary(
  rows: { amount: unknown; due_amount: unknown; payment_status: string | null }[]
): PaymentSummary {
  let paid = 0;
  let due = 0;
  for (const row of rows) {
    if (row.payment_status === 'paid') paid += Number(row.amount ?? 0);
    due += rowDue(row);
  }
  return { paid, due, count: rows.length };
}

/* --------------------------------------------------------------- notifications */

export async function studentNotifications(studentId: number, take = 20) {
  return safe(
    () =>
      prisma.notification.findMany({
        where: { user_type: 'student', user_id: studentId },
        orderBy: { created_at: 'desc' },
        take,
        select: {
          id: true,
          title: true,
          message: true,
          link: true,
          icon: true,
          is_read: true,
          created_at: true,
        },
      }),
    []
  );
}
