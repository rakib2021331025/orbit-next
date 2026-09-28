import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { toLatinDigits } from '@/lib/results/grades';
import { validDate, validId } from '@/lib/reports/core';
import { studentsInBatch, studentsInCourse } from '@/lib/reports/students';

/**
 * Coaching analytics, from includes/coaching_analytics_lib.php.
 *
 * Revenue, dues, the fee-type split, student growth, exam performance and
 * attendance — all computed from records that already exist, month by month.
 * Nothing here is stored.
 *
 * The **fee type** is the subtle part. A payment row may carry no `fee_type` at
 * all (they predate the column), so the type is inferred exactly as the original
 * does: an explicit type wins, then a `payment_month` of "admission", then one
 * that looks like a month, and everything else is "other". Dropping the
 * inference would file years of real income under "other".
 */

export const RANGES = ['this_month', 'last_3', 'last_6', 'this_year', 'custom'] as const;
export type Range = (typeof RANGES)[number];

export const FEE_TYPES = ['monthly', 'installment', 'admission', 'other'] as const;
export type FeeTypeName = (typeof FEE_TYPES)[number];

export interface CanFilters {
  range: Range;
  from: string;
  to: string;
  courseId: number;
  batchId: number;
  /** The Student ID as typed. */
  student: string;
  studentId: number;
  studentName: string;
  studentFound: boolean;
  type: FeeTypeName | '';
  /** Every `Y-m` in the period, oldest first. */
  months: string[];
}

async function safe<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function firstOfMonth(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

function shiftMonths(value: string, months: number): string {
  const [year, month] = value.slice(0, 7).split('-').map(Number);
  return iso(new Date(Date.UTC(year, month - 1 + months, 1)));
}

/** The filters, with the period already resolved to two dates and a month list. */
export function canFilters(query: Record<string, string | undefined>): CanFilters {
  const range: Range = RANGES.includes(query.range as Range) ? (query.range as Range) : 'last_6';
  const today = iso(new Date());
  const first = firstOfMonth(today);

  let from: string;
  switch (range) {
    case 'this_month':
      from = first;
      break;
    case 'last_3':
      from = shiftMonths(first, -2);
      break;
    case 'this_year':
      from = `${today.slice(0, 4)}-01-01`;
      break;
    case 'custom':
      from = validDate(query.from) || shiftMonths(first, -5);
      break;
    default:
      from = shiftMonths(first, -5);
  }

  let to = range === 'custom' ? validDate(query.to) || today : today;
  if (from > to) [from, to] = [to, from];

  // Five years of months at most in one view.
  const limit = shiftMonths(firstOfMonth(to), -59);
  if (from < limit) from = limit;

  const months: string[] = [];
  for (
    let month = firstOfMonth(from), guard = 0;
    month.slice(0, 7) <= to.slice(0, 7) && guard < 120;
    month = shiftMonths(month, 1), guard++
  ) {
    months.push(month.slice(0, 7));
  }

  const type = FEE_TYPES.includes(query.type as FeeTypeName) ? (query.type as FeeTypeName) : '';

  return {
    range,
    from,
    to,
    courseId: validId(query.course),
    batchId: validId(query.batch),
    student: (query.student ?? '').trim().slice(0, 30),
    studentId: 0,
    studentName: '',
    studentFound: true,
    type,
    months,
  };
}

/**
 * Resolves the Student ID typed into the filter.
 *
 * An id nobody has is **not** the same as no filter: `studentId` becomes -1 so
 * every figure comes out empty, rather than silently showing the whole institute.
 */
export async function resolveStudent(filters: CanFilters): Promise<CanFilters> {
  if (filters.student === '') return filters;

  const code = toLatinDigits(filters.student).toUpperCase();
  const student = await safe(
    () =>
      prisma.student.findFirst({
        where: { student_id_no: { equals: code, mode: 'insensitive' } },
        select: { id: true, name: true, student_id_no: true },
      }),
    null
  );

  return {
    ...filters,
    studentId: student ? student.id : -1,
    studentName: student ? student.name : '',
    studentFound: student !== null,
  };
}

/** The filters as a query string, for the export links. */
export function canQuery(filters: CanFilters, extra: Record<string, string> = {}): string {
  const query = new URLSearchParams({ range: filters.range });
  if (filters.range === 'custom') {
    query.set('from', filters.from);
    query.set('to', filters.to);
  }
  if (filters.courseId > 0) query.set('course', String(filters.courseId));
  if (filters.batchId > 0) query.set('batch', String(filters.batchId));
  if (filters.student !== '') query.set('student', filters.student);
  if (filters.type !== '') query.set('type', filters.type);
  for (const [key, value] of Object.entries(extra)) query.set(key, value);
  return query.toString();
}

/** The fee type of a payment row, inferred when the column is empty. */
function feeTypeSql(alias = 'p'): Prisma.Sql {
  return Prisma.raw(`CASE
    WHEN ${alias}.fee_type IN ('monthly', 'installment', 'admission', 'other') THEN ${alias}.fee_type::text
    WHEN LOWER(TRIM(${alias}.payment_month)) = 'admission' THEN 'admission'
    WHEN ${alias}.payment_month ~ '^[0-9]{4}-[0-9]{2}$' THEN 'monthly'
    WHEN LOWER(TRIM(${alias}.payment_month)) ~ '^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*( [0-9]{4})?$' THEN 'monthly'
    ELSE 'other' END`);
}

/**
 * The student ids the course / batch / student filters allow, or null for "no
 * limit".
 *
 * Resolved to a list of ids on purpose: the course match has three possible
 * paths (batch, enrolment, legacy course name) and expressing that inside every
 * raw aggregate would repeat it six times.
 */
async function allowedStudentIds(filters: CanFilters): Promise<number[] | null> {
  if (filters.studentId === -1) return [];
  if (filters.studentId > 0) return [filters.studentId];
  if (filters.courseId === 0 && filters.batchId === 0) return null;

  const and: Record<string, unknown>[] = [];
  if (filters.courseId > 0) and.push((await studentsInCourse(filters.courseId)) ?? { id: -1 });
  if (filters.batchId > 0) and.push(studentsInBatch(filters.batchId) ?? { id: -1 });

  const rows = await safe(
    () => prisma.student.findMany({ where: { AND: and }, select: { id: true } }),
    []
  );
  return rows.map((row) => row.id);
}

/** `AND p.student_id IN (…)`, or nothing when there is no student filter. */
function studentClause(ids: number[] | null, column: string): Prisma.Sql {
  if (ids === null) return Prisma.empty;
  if (ids.length === 0) return Prisma.sql` AND false`;
  return Prisma.sql` AND ${Prisma.raw(column)} IN (${Prisma.join(ids)})`;
}

function typeClause(type: FeeTypeName | ''): Prisma.Sql {
  return type === '' ? Prisma.empty : Prisma.sql` AND ${feeTypeSql('p')} = ${type}`;
}

function dayStart(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function dayEnd(value: string): Date {
  return new Date(`${value}T23:59:59.999Z`);
}

export interface MonthMoney {
  revenue: number;
  payments: number;
  students: number;
}

export interface RevenueData {
  months: Record<string, MonthMoney>;
  total: MonthMoney;
}

export async function revenue(filters: CanFilters): Promise<RevenueData> {
  const ids = await allowedStudentIds(filters);

  const rows = await safe(
    () =>
      prisma.$queryRaw<{ ym: string; revenue: number; payments: bigint; students: bigint }[]>(
        Prisma.sql`
          SELECT to_char(p.payment_date, 'YYYY-MM') AS ym,
                 COALESCE(SUM(p.amount), 0)::float8 AS revenue,
                 COUNT(*)::bigint AS payments,
                 COUNT(DISTINCT p.student_id)::bigint AS students
          FROM payments p
          WHERE p.payment_status = 'paid'
            AND p.payment_date BETWEEN ${dayStart(filters.from)} AND ${dayEnd(filters.to)}
            ${studentClause(ids, 'p.student_id')}
            ${typeClause(filters.type)}
          GROUP BY 1`
      ),
    []
  );

  const byMonth = new Map(rows.map((row) => [row.ym, row]));
  const months: Record<string, MonthMoney> = {};
  for (const month of filters.months) {
    const row = byMonth.get(month);
    months[month] = {
      revenue: row ? Math.round(row.revenue * 100) / 100 : 0,
      payments: row ? Number(row.payments) : 0,
      students: row ? Number(row.students) : 0,
    };
  }

  // The period total counts each student once, not once per month.
  const totalRows = await safe(
    () =>
      prisma.$queryRaw<{ revenue: number; payments: bigint; students: bigint }[]>(
        Prisma.sql`
          SELECT COALESCE(SUM(p.amount), 0)::float8 AS revenue,
                 COUNT(*)::bigint AS payments,
                 COUNT(DISTINCT p.student_id)::bigint AS students
          FROM payments p
          WHERE p.payment_status = 'paid'
            AND p.payment_date BETWEEN ${dayStart(filters.from)} AND ${dayEnd(filters.to)}
            ${studentClause(ids, 'p.student_id')}
            ${typeClause(filters.type)}`
      ),
    []
  );

  const total = totalRows[0];
  return {
    months,
    total: {
      revenue: total ? Math.round(total.revenue * 100) / 100 : 0,
      payments: total ? Number(total.payments) : 0,
      students: total ? Number(total.students) : 0,
    },
  };
}

/** This calendar month and last, with the non-date filters applied. */
export async function recentRevenue(
  filters: CanFilters
): Promise<{ thisMonth: number; lastMonth: number }> {
  const ids = await allowedStudentIds(filters);
  const thisStart = firstOfMonth(iso(new Date()));
  const lastStart = shiftMonths(thisStart, -1);

  const rows = await safe(
    () =>
      prisma.$queryRaw<{ this_month: number; last_month: number }[]>(
        Prisma.sql`
          SELECT COALESCE(SUM(CASE WHEN p.payment_date >= ${dayStart(thisStart)} THEN p.amount END), 0)::float8 AS this_month,
                 COALESCE(SUM(CASE WHEN p.payment_date >= ${dayStart(lastStart)}
                                    AND p.payment_date < ${dayStart(thisStart)} THEN p.amount END), 0)::float8 AS last_month
          FROM payments p
          WHERE p.payment_status = 'paid'
            AND p.payment_date >= ${dayStart(lastStart)}
            ${studentClause(ids, 'p.student_id')}
            ${typeClause(filters.type)}`
      ),
    []
  );

  const row = rows[0];
  return {
    thisMonth: row ? Math.round(row.this_month * 100) / 100 : 0,
    lastMonth: row ? Math.round(row.last_month * 100) / 100 : 0,
  };
}

/** Money owed right now — deliberately NOT limited to the period. */
export async function outstanding(
  filters: CanFilters
): Promise<{ due: number; students: number }> {
  const ids = await allowedStudentIds(filters);

  const rows = await safe(
    () =>
      prisma.$queryRaw<{ due: number; students: bigint }[]>(
        Prisma.sql`
          SELECT COALESCE(SUM(CASE WHEN p.payment_status = 'paid'
                                   THEN GREATEST(COALESCE(p.due_amount, 0), 0)
                                   ELSE p.amount END), 0)::float8 AS due,
                 COUNT(DISTINCT p.student_id)::bigint AS students
          FROM payments p
          WHERE (p.payment_status = 'unpaid'
                 OR (p.payment_status = 'paid' AND COALESCE(p.due_amount, 0) > 0))
            ${studentClause(ids, 'p.student_id')}
            ${typeClause(filters.type)}`
      ),
    []
  );

  const row = rows[0];
  return {
    due: row ? Math.round(row.due * 100) / 100 : 0,
    students: row ? Number(row.students) : 0,
  };
}

export interface TypeSplit {
  revenue: number;
  payments: number;
  /** How many of those rows had no stored fee type. */
  inferred: number;
}

export async function typeBreakdown(
  filters: CanFilters
): Promise<Record<FeeTypeName, TypeSplit>> {
  const ids = await allowedStudentIds(filters);

  const rows = await safe(
    () =>
      prisma.$queryRaw<{ type: string; revenue: number; payments: bigint; inferred: bigint }[]>(
        Prisma.sql`
          SELECT ${feeTypeSql('p')} AS type,
                 COALESCE(SUM(p.amount), 0)::float8 AS revenue,
                 COUNT(*)::bigint AS payments,
                 COUNT(*) FILTER (WHERE p.fee_type IS NULL)::bigint AS inferred
          FROM payments p
          WHERE p.payment_status = 'paid'
            AND p.payment_date BETWEEN ${dayStart(filters.from)} AND ${dayEnd(filters.to)}
            ${studentClause(ids, 'p.student_id')}
            ${typeClause(filters.type)}
          GROUP BY 1`
      ),
    []
  );

  const out = {} as Record<FeeTypeName, TypeSplit>;
  for (const type of FEE_TYPES) out[type] = { revenue: 0, payments: 0, inferred: 0 };

  for (const row of rows) {
    if (!FEE_TYPES.includes(row.type as FeeTypeName)) continue;
    out[row.type as FeeTypeName] = {
      revenue: Math.round(row.revenue * 100) / 100,
      payments: Number(row.payments),
      inferred: Number(row.inferred),
    };
  }
  return out;
}

export interface GrowthData {
  months: Record<string, number>;
  period: number;
  active: number;
  newThis: number;
  newLast: number;
}

export async function growth(filters: CanFilters): Promise<GrowthData> {
  const ids = await allowedStudentIds(filters);
  const scope: Record<string, unknown> =
    ids === null ? {} : { id: { in: ids.length > 0 ? ids : [-1] } };

  const joined = await safe(
    () =>
      prisma.student.findMany({
        where: {
          ...scope,
          status: 'approved',
          created_at: { gte: dayStart(filters.from), lte: dayEnd(filters.to) },
        },
        select: { created_at: true },
      }),
    []
  );

  const months: Record<string, number> = {};
  for (const month of filters.months) months[month] = 0;
  for (const row of joined) {
    const month = row.created_at.toISOString().slice(0, 7);
    if (month in months) months[month] += 1;
  }

  const thisStart = firstOfMonth(iso(new Date()));
  const lastStart = shiftMonths(thisStart, -1);

  const [active, newThis, newLast] = await Promise.all([
    safe(
      () =>
        prisma.student.count({
          where: { ...scope, status: 'approved', student_status: 'Active' },
        }),
      0
    ),
    safe(
      () =>
        prisma.student.count({
          where: { ...scope, status: 'approved', created_at: { gte: dayStart(thisStart) } },
        }),
      0
    ),
    safe(
      () =>
        prisma.student.count({
          where: {
            ...scope,
            status: 'approved',
            created_at: { gte: dayStart(lastStart), lt: dayStart(thisStart) },
          },
        }),
      0
    ),
  ]);

  return {
    months,
    period: Object.values(months).reduce((sum, value) => sum + value, 0),
    active,
    newThis,
    newLast,
  };
}

export interface PerformanceMonth {
  pct: number | null;
  students: number;
  exams: number;
}

export interface PerformanceData {
  months: Record<string, PerformanceMonth>;
  overall: number | null;
}

/**
 * Average marks per month, over published monthly exams **and** hand-entered
 * results.
 *
 * An absence counts as zero rather than being skipped, and a mark is clamped to
 * the subject's full marks — a data-entry slip must not push an average above
 * 100%.
 */
export async function performance(filters: CanFilters): Promise<PerformanceData> {
  const ids = await allowedStudentIds(filters);

  const rows = await safe(
    () =>
      prisma.$queryRaw<
        { ym: string; obtained: number; full: number; students: bigint; exams: bigint }[]
      >(
        // "full" is quoted: FULL is a reserved word in PostgreSQL (FULL JOIN), and
        // unquoted it is a syntax error that safe() used to hide as an empty chart.
        Prisma.sql`
          SELECT ym,
                 SUM(obtained)::float8 AS obtained,
                 SUM("full")::float8 AS "full",
                 COUNT(DISTINCT student_id)::bigint AS students,
                 COUNT(DISTINCT exam_key)::bigint AS exams
          FROM (
            SELECT e.exam_month AS ym, r.student_id, 'm' || e.id AS exam_key,
                   CASE WHEN r.is_absent THEN 0
                        ELSE LEAST(GREATEST(r.marks_obtained, 0), es.full_marks) END AS obtained,
                   es.full_marks AS "full"
            FROM exam_results r
            JOIN monthly_exams e ON e.id = r.monthly_exam_id AND e.status = 'published'
            JOIN monthly_exam_subjects es
              ON es.id = r.exam_subject_id AND es.exam_id = e.id AND es.full_marks > 0
            WHERE e.exam_month BETWEEN ${filters.from.slice(0, 7)} AND ${filters.to.slice(0, 7)}
              ${studentClause(ids, 'r.student_id')}

            UNION ALL

            SELECT to_char(COALESCE(r.exam_date, r.created_at), 'YYYY-MM'), r.student_id,
                   'l' || r.exam_name || '|' || COALESCE(r.exam_date::text, ''),
                   CASE WHEN r.is_absent THEN 0
                        ELSE LEAST(GREATEST(r.marks_obtained, 0), r.total_marks) END,
                   r.total_marks
            FROM exam_results r
            WHERE r.monthly_exam_id IS NULL AND r.total_marks > 0
              AND COALESCE(r.exam_date, r.created_at::date)
                  BETWEEN ${dayStart(filters.from)}::date AND ${dayStart(filters.to)}::date
              ${studentClause(ids, 'r.student_id')}
          ) x
          GROUP BY ym`
      ),
    []
  );

  const byMonth = new Map(rows.map((row) => [row.ym, row]));
  const months: Record<string, PerformanceMonth> = {};
  let obtained = 0;
  let full = 0;

  for (const month of filters.months) {
    const row = byMonth.get(month);
    months[month] = {
      pct: row && row.full > 0 ? Math.round((row.obtained / row.full) * 10000) / 100 : null,
      students: row ? Number(row.students) : 0,
      exams: row ? Number(row.exams) : 0,
    };
    if (row) {
      obtained += row.obtained;
      full += row.full;
    }
  }

  return {
    months,
    overall: full > 0 ? Math.round((obtained / full) * 10000) / 100 : null,
  };
}

export interface AttendanceMonth {
  present: number;
  absent: number;
  late: number;
  halfDay: number;
  total: number;
  pct: number | null;
}

export interface AttendanceData {
  months: Record<string, AttendanceMonth>;
  overall: number | null;
}

/** Attendance per month. Late counts as present, a half day as half. */
export async function attendance(filters: CanFilters): Promise<AttendanceData> {
  const and: Record<string, unknown>[] = [
    { attendance_date: { gte: dayStart(filters.from), lte: dayEnd(filters.to) } },
  ];

  if (filters.courseId > 0) {
    // attendance has no `batch` relation (batch_id is a plain column), so a
    // relation filter here is rejected by Prisma — and, swallowed by safe(), it
    // used to empty the whole panel whenever a course was picked. The course's
    // batches are resolved first and matched by id instead.
    const courseBatches = await safe(
      () =>
        prisma.batch.findMany({ where: { course_id: filters.courseId }, select: { id: true } }),
      [] as { id: number }[]
    );
    and.push({
      OR: [
        { course_id: filters.courseId },
        ...(courseBatches.length > 0
          ? [{ batch_id: { in: courseBatches.map((batch) => batch.id) } }]
          : []),
      ],
    });
  }
  if (filters.batchId > 0) and.push({ batch_id: filters.batchId });
  if (filters.studentId !== 0) and.push({ student_id: filters.studentId });

  // Counted per day and status in the database rather than one row per mark:
  // an institute-wide six-month range is tens of thousands of rows, but at most
  // (days × statuses) groups.
  const rows = await safe(
    () =>
      prisma.attendance.groupBy({
        by: ['attendance_date', 'status'],
        where: { AND: and },
        _count: { _all: true },
      }),
    []
  );

  const empty = (): AttendanceMonth => ({
    present: 0,
    absent: 0,
    late: 0,
    halfDay: 0,
    total: 0,
    pct: null,
  });

  const months: Record<string, AttendanceMonth> = {};
  for (const month of filters.months) months[month] = empty();
  const all = empty();

  const add = (bucket: AttendanceMonth, status: string, n: number) => {
    // A row with no status is not a mark either way, so it is not counted at all.
    if (status === '') return;
    if (status === 'present') bucket.present += n;
    else if (status === 'absent') bucket.absent += n;
    else if (status === 'late') bucket.late += n;
    else if (status === 'half_day') bucket.halfDay += n;
    bucket.total += n;
  };

  for (const row of rows) {
    const month = row.attendance_date.toISOString().slice(0, 7);
    // attendance.status is nullable in the schema; an unset row counts as nothing.
    const status = row.status ?? '';
    if (month in months) add(months[month], status, row._count._all);
    add(all, status, row._count._all);
  }

  const share = (bucket: AttendanceMonth) =>
    bucket.total > 0
      ? Math.round(
          ((bucket.present + bucket.late + bucket.halfDay * 0.5) / bucket.total) * 10000
        ) / 100
      : null;

  for (const month of Object.keys(months)) months[month].pct = share(months[month]);

  return { months, overall: share(all) };
}

export interface CanData {
  revenue: RevenueData;
  recent: { thisMonth: number; lastMonth: number };
  outstanding: { due: number; students: number };
  breakdown: Record<FeeTypeName, TypeSplit>;
  growth: GrowthData;
  performance: PerformanceData;
  attendance: AttendanceData;
}

/** Everything for one filter set. */
export async function canData(filters: CanFilters): Promise<CanData> {
  const [rev, recent, due, split, grow, perf, att] = await Promise.all([
    revenue(filters),
    recentRevenue(filters),
    outstanding(filters),
    typeBreakdown(filters),
    growth(filters),
    performance(filters),
    attendance(filters),
  ]);

  return {
    revenue: rev,
    recent,
    outstanding: due,
    breakdown: split,
    growth: grow,
    performance: perf,
    attendance: att,
  };
}
