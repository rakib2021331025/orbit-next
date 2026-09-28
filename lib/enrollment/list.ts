import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { branchWhere } from '@/lib/auth/guards';
import { paginate, type Pager } from '@/lib/paginate';

/**
 * The enrollment verification queue, from admin/applications.php.
 *
 * The pending tab is sorted **oldest first**: it is a queue, and the person who
 * applied on Monday should not be behind the person who applied this morning.
 * Every other tab is newest first, because those are records being looked up
 * rather than work waiting to be done.
 */

export type EnrollmentState = 'pending' | 'approved' | 'rejected' | 'all';

const STATE_STATUSES: Record<Exclude<EnrollmentState, 'all'>, string[]> = {
  pending: ['pending', 'under_review', 'payment_verified'],
  approved: ['approved'],
  rejected: ['rejected', 'payment_rejected'],
};

/** Which tab a stored status belongs to. */
export function enrollmentState(status: string): Exclude<EnrollmentState, 'all'> {
  if (status === 'approved') return 'approved';
  if (status === 'rejected' || status === 'payment_rejected') return 'rejected';
  return 'pending';
}

export interface ApplicationFilters {
  state: EnrollmentState;
  search: string;
  method: string;
  courseId: number;
  from: string;
  to: string;
  page: number;
}

async function safe<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

function dayStart(value: string): Date | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : null;
}

function dayEnd(value: string): Date | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T23:59:59.999Z`) : null;
}

async function applicationWhere(filters: ApplicationFilters): Promise<Record<string, unknown>> {
  const where: Record<string, unknown> = { ...(await branchWhere(false)) };
  const and: Record<string, unknown>[] = [];

  if (filters.state !== 'all') {
    and.push({ status: { in: STATE_STATUSES[filters.state] } });
  }

  const search = filters.search.trim();
  if (search !== '') {
    // Everything an admin might have in front of them: the applicant's name in
    // either language, their mobile, the application number, and — the reason
    // this search exists — the transaction id from a bKash statement.
    and.push({
      OR: [
        { fullname: { contains: search, mode: 'insensitive' } },
        { fullname_bn: { contains: search, mode: 'insensitive' } },
        { mobile: { contains: search } },
        { application_no: { contains: search, mode: 'insensitive' } },
        { transaction_id: { contains: search, mode: 'insensitive' } },
        { sender_number: { contains: search } },
      ],
    });
  }

  if (filters.method === 'bkash' || filters.method === 'nagad') {
    and.push({ payment_method: filters.method });
  } else if (filters.method === 'none') {
    and.push({ payment_method: null });
  }

  if (filters.courseId > 0) and.push({ course_id: filters.courseId });

  const from = dayStart(filters.from);
  const to = dayEnd(filters.to);
  if (from || to) {
    and.push({
      created_at: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) },
    });
  }

  if (and.length > 0) where.AND = and;
  return where;
}

export interface ApplicationListResult {
  rows: ApplicationRow[];
  pager: Pager;
}

function selectApplications(
  where: Record<string, unknown>,
  oldestFirst: boolean,
  take: number,
  skip: number
) {
  return prisma.admission.findMany({
    where,
    orderBy: [{ created_at: oldestFirst ? 'asc' : 'desc' }, { id: 'desc' }],
    take,
    skip,
  });
}

export type ApplicationRow = Awaited<ReturnType<typeof selectApplications>>[number] & {
  /** The fee of the chosen batch, falling back to the course's. */
  fee: number | null;
  batchName: string | null;
  studentIdNo: string | null;
  /** Other applications carrying the same transaction id — a duplicate claim. */
  trxDupes: number;
};

export async function applicationList(
  filters: ApplicationFilters
): Promise<ApplicationListResult> {
  const where = await applicationWhere(filters);
  const total = await safe(() => prisma.admission.count({ where }), 0);
  const pager = paginate(total, 15, filters.page);

  const base = await safe(
    () => selectApplications(where, filters.state === 'pending', pager.perPage, pager.offset),
    []
  );
  if (base.length === 0) return { rows: [], pager };

  // The joins the original does in SQL, resolved in one query each rather than
  // per row.
  const batchIds = [...new Set(base.map((row) => row.batch_id).filter((id): id is number => !!id))];
  const courseIds = [...new Set(base.map((row) => row.course_id).filter((id): id is number => !!id))];
  const studentIds = [...new Set(base.map((row) => row.student_id).filter((id): id is number => !!id))];
  const transactions = [
    ...new Set(base.map((row) => row.transaction_id).filter((id): id is string => !!id && id !== '')),
  ];

  const [batches, courses, students, dupes] = await Promise.all([
    batchIds.length > 0
      ? safe(
          () =>
            prisma.batch.findMany({
              where: { id: { in: batchIds } },
              select: { id: true, name: true, fee: true, course_id: true, schedule_info: true, capacity: true },
            }),
          []
        )
      : [],
    safe(
      () =>
        prisma.course.findMany({
          where: { id: { in: [...courseIds, ...batchIds] } },
          select: { id: true, fee: true },
        }),
      []
    ),
    studentIds.length > 0
      ? safe(
          () =>
            prisma.student.findMany({
              where: { id: { in: studentIds } },
              select: { id: true, student_id_no: true, name: true },
            }),
          []
        )
      : [],
    transactions.length > 0
      ? safe(
          () =>
            prisma.admission.groupBy({
              by: ['transaction_id'],
              where: { transaction_id: { in: transactions } },
              _count: { _all: true },
            }),
          []
        )
      : [],
  ]);

  const batchById = new Map(batches.map((batch) => [batch.id, batch]));
  const courseFee = new Map(courses.map((course) => [course.id, course.fee]));
  const studentById = new Map(students.map((student) => [student.id, student]));
  const dupeCount = new Map(dupes.map((row) => [row.transaction_id ?? '', row._count._all]));

  const rows: ApplicationRow[] = base.map((row) => {
    const batch = row.batch_id ? batchById.get(row.batch_id) : undefined;
    const feeSourceCourse = batch?.course_id ?? row.course_id ?? 0;
    const fee =
      batch?.fee !== null && batch?.fee !== undefined
        ? Number(batch.fee)
        : courseFee.get(feeSourceCourse) !== null && courseFee.get(feeSourceCourse) !== undefined
          ? Number(courseFee.get(feeSourceCourse))
          : null;

    return {
      ...row,
      fee,
      batchName: batch?.name ?? row.batch_label ?? null,
      studentIdNo: row.student_id ? (studentById.get(row.student_id)?.student_id_no ?? null) : null,
      // The row itself is in the count, so one occurrence means no duplicate.
      trxDupes: Math.max(0, (dupeCount.get(row.transaction_id ?? '') ?? 0) - 1),
    };
  });

  return { rows, pager };
}

export interface ApplicationTabs {
  pending: number;
  approved: number;
  rejected: number;
  all: number;
}

/** The tab counts and this month's approvals, across the admin's branch scope. */
export async function applicationSummary(): Promise<{
  tabs: ApplicationTabs;
  approvedMonth: number;
  collectedMonth: number;
}> {
  const branch = await branchWhere(false);
  const tabs: ApplicationTabs = { pending: 0, approved: 0, rejected: 0, all: 0 };

  const grouped = await safe(
    () =>
      prisma.admission.groupBy({
        by: ['status'],
        where: branch,
        _count: { _all: true },
      }),
    []
  );
  for (const row of grouped) {
    tabs[enrollmentState(row.status)] += row._count._all;
    tabs.all += row._count._all;
  }

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  const month = await safe(
    () =>
      prisma.admission.aggregate({
        where: { ...branch, status: 'approved', approved_at: { gte: monthStart } },
        _count: { _all: true },
        _sum: { payment_amount: true },
      }),
    { _count: { _all: 0 }, _sum: { payment_amount: null } } as {
      _count: { _all: number };
      _sum: { payment_amount: unknown };
    }
  );

  return {
    tabs,
    approvedMonth: month._count._all,
    collectedMonth: Number(month._sum.payment_amount ?? 0),
  };
}
