import 'server-only';
import { prisma } from '@/lib/db/prisma';

/**
 * Every branch side by side — orbit_branch_stats().
 *
 * A handful of grouped queries, **whatever the number of branches**. The original's own
 * comment says it: never one query per branch. A dashboard that adds a round
 * trip per branch gets slower every time the institute opens one.
 *
 * Only an all-branch admin ever sees this; a branch-locked admin has nothing to
 * compare their branch with.
 */

export interface BranchStat {
  students: number;
  active: number;
  pending: number;
  admissionsMonth: number;
  batches: number;
  courses: number;
  collected: number;
  attMarked: number;
  /** Weighted present count: present + late + ½ half-day. */
  attPresent: number;
}

const EMPTY: BranchStat = {
  students: 0,
  active: 0,
  pending: 0,
  admissionsMonth: 0,
  batches: 0,
  courses: 0,
  collected: 0,
  attMarked: 0,
  attPresent: 0,
};

async function safe<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

/** Every branch, in id order, for a table that lists them all. */
export async function branchList() {
  return safe(
    () =>
      prisma.branch.findMany({
        orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
        // Branches store a `name_en` / `name_bn` PAIR, not a base column plus a
        // translation, which is why the UI picks them with `pickPair`.
        select: { id: true, name_en: true, name_bn: true, status: true, sort_order: true },
      }),
    []
  );
}

export async function branchStats(
  monthStart: Date,
  monthNext: Date,
  today: Date
): Promise<Map<number, BranchStat>> {
  const stats = new Map<number, BranchStat>();

  const branches = await safe(
    () => prisma.branch.findMany({ orderBy: { id: 'asc' }, select: { id: true } }),
    []
  );
  for (const branch of branches) stats.set(branch.id, { ...EMPTY });

  // A row whose branch_id is null or points at a deleted branch is skipped
  // rather than added, exactly as the original's isset() check does.
  const into = (branchId: number | null, apply: (stat: BranchStat) => void) => {
    if (branchId === null) return;
    const stat = stats.get(branchId);
    if (stat) apply(stat);
  };

  const [students, pending, month, batches, courses, collected, attendance] =
    await Promise.all([
      // Total and active students from one grouping: grouped by status as well,
      // the total is the sum of a branch's groups and the active figure one of them.
      safe(
        () =>
          prisma.student.groupBy({
            by: ['branch_id', 'student_status'],
            where: { status: 'approved' },
            _count: { _all: true },
          }),
        []
      ),
      safe(
        () =>
          prisma.admission.groupBy({
            by: ['branch_id'],
            where: { status: { in: ['pending', 'under_review', 'payment_verified'] } },
            _count: { _all: true },
          }),
        []
      ),
      safe(
        () =>
          prisma.admission.groupBy({
            by: ['branch_id'],
            where: { created_at: { gte: monthStart, lt: monthNext } },
            _count: { _all: true },
          }),
        []
      ),
      safe(
        () =>
          prisma.batch.groupBy({
            by: ['branch_id'],
            where: { status: 'active' },
            _count: { _all: true },
          }),
        []
      ),
      safe(
        () =>
          prisma.branchCourse.groupBy({
            by: ['branch_id'],
            where: { status: 'active', course: { status: 'active' } },
            _count: { _all: true },
          }),
        []
      ),
      // The branch the money was taken at, not the student's branch today.
      safe(
        () =>
          prisma.payment.groupBy({
            by: ['branch_id'],
            where: {
              payment_status: 'paid',
              payment_date: { gte: monthStart, lt: monthNext },
            },
            _sum: { amount: true },
          }),
        []
      ),
      safe(
        () =>
          prisma.attendance.groupBy({
            by: ['branch_id', 'status'],
            where: { attendance_date: today },
            _count: { _all: true },
          }),
        []
      ),
    ]);

  for (const row of students) {
    into(row.branch_id, (s) => {
      s.students += row._count._all;
      if (row.student_status === 'Active') s.active += row._count._all;
    });
  }
  for (const row of pending) into(row.branch_id, (s) => (s.pending = row._count._all));
  for (const row of month) into(row.branch_id, (s) => (s.admissionsMonth = row._count._all));
  for (const row of batches) into(row.branch_id, (s) => (s.batches = row._count._all));
  for (const row of courses) into(row.branch_id, (s) => (s.courses = row._count._all));
  for (const row of collected) {
    into(row.branch_id, (s) => (s.collected = Number(row._sum.amount ?? 0)));
  }

  for (const row of attendance) {
    // present and late count as one, a half day as half, absent as none.
    const weight = row.status === 'present' || row.status === 'late' ? 1 : row.status === 'half_day' ? 0.5 : 0;
    into(row.branch_id, (s) => {
      s.attMarked += row._count._all;
      s.attPresent += weight * row._count._all;
    });
  }

  return stats;
}
