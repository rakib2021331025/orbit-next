import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { cached, TAGS } from '@/lib/cache';
import { mailIsConfigured } from '@/lib/email/send';
import { adminBadgeCounts } from '@/lib/nav/admin';

/**
 * The figures on the admin dashboard, from admin/index.php.
 *
 * **Every figure follows the branch the admin is looking at**, and each table
 * gets there by its own route, which is the part worth keeping straight:
 *
 *   - students, batches, admissions, notices: their own `branch_id`
 *   - courses: through `branch_courses`, because a course is offered at a branch
 *     rather than belonging to one
 *   - payments: `payments.branch_id`, the branch the money was taken at — NOT
 *     the student's current branch, so a student moving branch never moves last
 *     month's takings with them
 *   - attendance: the branch stored on the register
 *   - monthly exams: the branch of the exam's batch, with a batch-less exam
 *     counting everywhere
 *
 * Nothing here throws. A dashboard that fails to render because one count could
 * not be read is worse than a dashboard with a zero on it, which is why the
 * original wraps every one of these in its own try/catch.
 */

export interface DashboardCounts {
  studentsActive: number;
  studentsTotal: number;
  coursesActive: number;
  batchesActive: number;
  draftExams: number;
  pendingReviews: number;
  pendingApps: number;
  pendingEval: number;
  newInquiries: number;
}

export interface AttendanceToday {
  present: number;
  late: number;
  half_day: number;
  absent: number;
  total: number;
  /** null when nothing has been marked today — not 0, which would read as awful. */
  rate: number | null;
}

export interface MoneySummary {
  collectedMonth: number;
  collectedCount: number;
  duesTotal: number;
  duesStudents: number;
  overdueTotal: number;
  overdueStudents: number;
}

/** Today at midnight, in the server's own day — what CURDATE() means. */
export function todayDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/** The first of this month and the first of next, the collection window. */
export function monthWindow(): { start: Date; next: Date } {
  const now = new Date();
  return {
    start: new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)),
    next: new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1)),
  };
}

async function safe<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

const money = (value: unknown): number => Number(value ?? 0);

export async function dashboardCounts(branchId: number): Promise<DashboardCounts> {
  const branch = branchId > 0 ? { branch_id: branchId } : {};

  const [
    studentGroups,
    coursesActive,
    batchesActive,
    draftExams,
    pendingReviews,
    pendingApps,
    badges,
  ] = await Promise.all([
    // Active and total approved students in ONE grouped read rather than two
    // counts: the total is the sum of the groups, the active figure one of them.
    safe(
      () =>
        prisma.student.groupBy({
          by: ['student_status'],
          where: { status: 'approved', ...branch },
          _count: { _all: true },
        }),
      [] as { student_status: string; _count: { _all: number } }[]
    ),
    // A course is offered at a branch through branch_courses; both the offering
    // and the course itself have to be active for it to count.
    branchId > 0
      ? safe(
          () =>
            prisma.branchCourse.count({
              where: { branch_id: branchId, status: 'active', course: { status: 'active' } },
            }),
          0
        )
      : safe(() => prisma.course.count({ where: { status: 'active' } }), 0),
    safe(() => prisma.batch.count({ where: { status: 'active', ...branch } }), 0),
    safe(
      () =>
        prisma.monthlyExam.count({
          where: {
            status: 'draft',
            // A batch-less exam belongs to no branch, so it counts everywhere.
            ...(branchId > 0
              ? { OR: [{ batch_id: null }, { batch: { branch_id: branchId } }] }
              : {}),
          },
        }),
      0
    ),
    safe(() => prisma.feedback.count({ where: { status: 'pending' } }), 0),
    // With no branch in focus this is exactly the shell's "applications" badge,
    // already counted for this request; a branch needs its own count.
    branchId > 0
      ? safe(
          () =>
            prisma.admission.count({
              where: { status: { in: ['pending', 'under_review', 'payment_verified'] }, ...branch },
            }),
          0
        )
      : null,
    // Evaluations and inquiries are institute-wide in the original's badges —
    // the very counts the admin shell shows, memoised per request, so they are
    // reused rather than counted a second time.
    adminBadgeCounts(),
  ]);

  const pendingEval = badges.evaluations;
  const newInquiries = badges.inquiries;

  const studentsActive =
    studentGroups.find((group) => group.student_status === 'Active')?._count._all ?? 0;
  const studentsTotal = studentGroups.reduce((sum, group) => sum + group._count._all, 0);

  return {
    studentsActive,
    studentsTotal,
    coursesActive,
    batchesActive,
    draftExams,
    pendingReviews,
    pendingApps: pendingApps ?? badges.apps,
    pendingEval,
    newInquiries,
  };
}

/**
 * Today's register.
 *
 * The rate is the one the whole app uses: (present + late + ½ half-day) ÷ marked.
 * A late arrival is still a student in the room; a half day is half of one.
 */
export async function attendanceToday(branchId: number): Promise<AttendanceToday> {
  const grouped = await safe(
    () =>
      prisma.attendance.groupBy({
        by: ['status'],
        where: {
          attendance_date: todayDate(),
          ...(branchId > 0 ? { branch_id: branchId } : {}),
        },
        _count: { _all: true },
      }),
    [] as { status: string | null; _count: { _all: number } }[]
  );

  const counts: AttendanceToday = {
    present: 0,
    late: 0,
    half_day: 0,
    absent: 0,
    total: 0,
    rate: null,
  };

  for (const row of grouped) {
    if (row.status === 'present') counts.present = row._count._all;
    else if (row.status === 'late') counts.late = row._count._all;
    else if (row.status === 'half_day') counts.half_day = row._count._all;
    else if (row.status === 'absent') counts.absent = row._count._all;
  }

  counts.total = counts.present + counts.late + counts.half_day + counts.absent;
  counts.rate =
    counts.total > 0
      ? ((counts.present + counts.late + 0.5 * counts.half_day) / counts.total) * 100
      : null;

  return counts;
}

/**
 * Money: collected this month, outstanding, and overdue.
 *
 * "Due" has one definition across the whole app (orbit_student_payment_totals):
 * a paid charge still owes its `due_amount`, an unpaid one owes its full amount.
 * Overdue is the same sum limited to charges whose due date has passed.
 */
async function computeMoneySummary(branchId: number): Promise<MoneySummary> {
  const { start, next } = monthWindow();
  const today = todayDate();
  const branch = branchId > 0 ? Prisma.sql`AND p.branch_id = ${branchId}` : Prisma.empty;

  // One pass over `payments` instead of seven queries. It used to be an
  // aggregate for the month, then — for dues and again for overdue — a sum of
  // the paid part, a sum of the unpaid part and a DISTINCT student_id list that
  // was fetched whole just to be counted (thousands of rows on a big install).
  // Each FILTER below is exactly one of those old WHERE clauses:
  //
  //   collected   paid, paid this month
  //   paid part   paid with due_amount > 0, summing due_amount
  //   unpaid part unpaid, summing amount
  //   students    unpaid OR due_amount > 0 (any status, as before)
  //
  // and the overdue columns add `due_date < today` to the last three. Outstanding
  // still cannot be one SUM: what is owed depends on whether the charge was paid.
  const rows = await safe(
    () =>
      prisma.$queryRaw<
        {
          collected: number;
          collected_count: bigint;
          due_paid: number;
          due_unpaid: number;
          due_students: bigint;
          over_paid: number;
          over_unpaid: number;
          over_students: bigint;
        }[]
      >(
        Prisma.sql`
          SELECT
            COALESCE(SUM(p.amount) FILTER (WHERE p.payment_status = 'paid'
              AND p.payment_date >= ${start} AND p.payment_date < ${next}), 0)::float8 AS collected,
            COUNT(*) FILTER (WHERE p.payment_status = 'paid'
              AND p.payment_date >= ${start} AND p.payment_date < ${next})::bigint AS collected_count,
            COALESCE(SUM(p.due_amount) FILTER (WHERE p.payment_status = 'paid' AND p.due_amount > 0), 0)::float8 AS due_paid,
            COALESCE(SUM(p.amount) FILTER (WHERE p.payment_status = 'unpaid'), 0)::float8 AS due_unpaid,
            COUNT(DISTINCT p.student_id) FILTER (WHERE p.payment_status = 'unpaid' OR p.due_amount > 0)::bigint AS due_students,
            COALESCE(SUM(p.due_amount) FILTER (WHERE p.payment_status = 'paid' AND p.due_amount > 0
              AND p.due_date < ${today}::date), 0)::float8 AS over_paid,
            COALESCE(SUM(p.amount) FILTER (WHERE p.payment_status = 'unpaid'
              AND p.due_date < ${today}::date), 0)::float8 AS over_unpaid,
            COUNT(DISTINCT p.student_id) FILTER (WHERE (p.payment_status = 'unpaid' OR p.due_amount > 0)
              AND p.due_date < ${today}::date)::bigint AS over_students
          FROM payments p
          WHERE TRUE ${branch}`
      ),
    []
  );

  const row = rows[0];
  if (!row) {
    return {
      collectedMonth: 0,
      collectedCount: 0,
      duesTotal: 0,
      duesStudents: 0,
      overdueTotal: 0,
      overdueStudents: 0,
    };
  }

  return {
    collectedMonth: money(row.collected),
    collectedCount: Number(row.collected_count),
    duesTotal: money(row.due_paid) + money(row.due_unpaid),
    duesStudents: Number(row.due_students),
    overdueTotal: money(row.over_paid) + money(row.over_unpaid),
    overdueStudents: Number(row.over_students),
  };
}

/** Failed sends in the last week, and whether mail is configured at all. */
/**
 * The money strip, per branch, held for one minute in the shared cache: the one
 * aggregate over the whole payments table on a page every admin opens many
 * times a day. Admin-only data, but not per-user — every admin of a branch sees
 * the same figures — so a key per branch is safe. A minute stale is invisible on
 * a dashboard; the Fees and Payment pages always read live.
 */
export const moneySummary = cached(computeMoneySummary, ['admin:money-summary'], {
  tags: [TAGS.stats],
  revalidate: 60,
});

export async function mailHealth(): Promise<{ failed: number; configured: boolean }> {
  const week = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const failed = await safe(
    () => prisma.emailLog.count({ where: { status: 'failed', created_at: { gte: week } } }),
    0
  );
  return { failed, configured: mailIsConfigured() };
}

/* ------------------------------------------------------------------ lists */

export async function pendingAdmissions(branchId: number, take = 6) {
  return safe(
    () =>
      prisma.admission.findMany({
        where: {
          status: { in: ['pending', 'under_review', 'payment_verified'] },
          ...(branchId > 0 ? { branch_id: branchId } : {}),
        },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        take,
        select: {
          id: true,
          application_no: true,
          fullname: true,
          fullname_bn: true,
          course: true,
          batch_label: true,
          batch_type: true,
          payment_method: true,
          payment_amount: true,
          status: true,
          created_at: true,
        },
      }),
    []
  );
}

export async function classesToday(branchId: number, take = 6) {
  return safe(
    () =>
      prisma.liveClass.findMany({
        where: {
          class_date: todayDate(),
          status: 'scheduled',
          // A class with no branch is shared by all of them.
          ...(branchId > 0 ? { OR: [{ branch_id: null }, { branch_id: branchId }] } : {}),
        },
        orderBy: { start_time: 'asc' },
        take,
        select: {
          id: true,
          subject: true,
          topic: true,
          teacher_name: true,
          batch: true,
          course: true,
          start_time: true,
          class_date: true,
          duration_minutes: true,
        },
      }),
    []
  );
}

export async function recentMonthlyExams(branchId: number, take = 5) {
  return safe(
    () =>
      prisma.monthlyExam.findMany({
        where:
          branchId > 0 ? { OR: [{ batch_id: null }, { batch: { branch_id: branchId } }] } : {},
        orderBy: [{ exam_month: 'desc' }, { id: 'desc' }],
        take,
        select: { id: true, title: true, title_bn: true, exam_month: true, status: true },
      }),
    []
  );
}

export async function recentPayments(branchId: number, take = 6) {
  return safe(
    () =>
      prisma.payment.findMany({
        where: { payment_status: 'paid', ...(branchId > 0 ? { branch_id: branchId } : {}) },
        orderBy: [{ payment_date: 'desc' }, { id: 'desc' }],
        take,
        select: {
          id: true,
          amount: true,
          payment_month: true,
          payment_method: true,
          payment_date: true,
          student: { select: { name: true, name_bn: true, student_id_no: true } },
        },
      }),
    []
  );
}

export async function recentNotices(branchId: number, take = 4) {
  return safe(
    () =>
      prisma.notice.findMany({
        where: branchId > 0 ? { OR: [{ branch_id: null }, { branch_id: branchId }] } : {},
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        take,
        select: { id: true, title: true, status: true, created_at: true, branch_id: true },
      }),
    []
  );
}

/**
 * Student reviews, pending ones first.
 *
 * This is the only place a review is approved for the public site, which is why
 * the pending ones sort to the top however old they are.
 */
export async function dashboardReviews(all: boolean) {
  const LIMIT = 8;
  const columns = {
    id: true,
    name: true,
    course_name: true,
    rating: true,
    feedback: true,
    status: true,
    created_at: true,
  } as const;
  const newest = [{ created_at: 'desc' as const }, { id: 'desc' as const }];

  const total = await safe(() => prisma.feedback.count(), 0);

  // `ORDER BY status = 'pending' DESC` cannot be expressed as a column sort —
  // the enum's own order is alphabetical — so the pending ones are fetched
  // first and the rest fill the page behind them. Sorting after a LIMIT would
  // have silently dropped older pending reviews off the dashboard, which is the
  // one thing this list exists to surface.
  const pending = await safe(
    () =>
      prisma.feedback.findMany({
        where: { status: 'pending' },
        orderBy: newest,
        ...(all ? {} : { take: LIMIT }),
        select: columns,
      }),
    []
  );

  const remaining = all ? Number.MAX_SAFE_INTEGER : LIMIT - pending.length;
  const rest =
    remaining <= 0
      ? []
      : await safe(
          () =>
            prisma.feedback.findMany({
              where: { NOT: { status: 'pending' } },
              orderBy: newest,
              ...(all ? {} : { take: remaining }),
              select: columns,
            }),
          []
        );

  return { rows: [...pending, ...rest], total };
}
