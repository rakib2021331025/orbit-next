import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { branchWhere, adminBranchLock } from '@/lib/auth/guards';
import { paginate, type Pager } from '@/lib/paginate';

/**
 * The admin student list, from admin/students.php.
 *
 * Search covers the five things an admin actually has in front of them when
 * someone is standing at the desk: the English name, the Bangla name, the
 * Student ID, the phone number and the roll. Not the address, not the guardian —
 * those produce surprising matches.
 *
 * The branch filter comes from `branchWhere()`, so a branch-locked admin sees
 * their own students and nothing else, and the filters the admin chose apply on
 * top of it rather than instead of it.
 */

export interface StudentFilters {
  search: string;
  batchId: number;
  status: '' | 'Active' | 'Inactive';
  page: number;
}

export interface StudentTotals {
  total: number;
  active: number;
  inactive: number;
  noId: number;
}

async function safe<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

/** The four headline counts, across the admin's whole branch scope. */
export async function studentTotals(): Promise<StudentTotals> {
  const branch = await branchWhere();

  const [byStatus, noId] = await Promise.all([
    // Total and active from one grouped count rather than two counts.
    safe(
      () =>
        prisma.student.groupBy({
          by: ['student_status'],
          where: branch,
          _count: { _all: true },
        }),
      [] as { student_status: string; _count: { _all: number } }[]
    ),
    safe(
      () =>
        prisma.student.count({
          where: { ...branch, OR: [{ student_id_no: null }, { student_id_no: '' }] },
        }),
      0
    ),
  ]);

  const total = byStatus.reduce((sum, group) => sum + group._count._all, 0);
  const active = byStatus.find((group) => group.student_status === 'Active')?._count._all ?? 0;

  return { total, active, inactive: total - active, noId };
}

/** The `where` for one set of filters, branch scope included. */
async function studentWhere(filters: StudentFilters): Promise<Record<string, unknown>> {
  const where: Record<string, unknown> = { ...(await branchWhere()) };
  const and: Record<string, unknown>[] = [];

  const search = filters.search.trim();
  if (search !== '') {
    // `contains` with no mode is case-sensitive on Postgres, and an admin typing
    // "rahim" must find "Rahim", so the search is explicitly insensitive.
    and.push({
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { name_bn: { contains: search, mode: 'insensitive' } },
        { student_id_no: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { roll_number: { contains: search, mode: 'insensitive' } },
      ],
    });
  }
  if (filters.batchId > 0) and.push({ batch_id: filters.batchId });
  if (filters.status !== '') and.push({ student_status: filters.status });

  // The filters narrow the branch scope; they never replace it.
  if (and.length > 0) where.AND = and;
  return where;
}

export interface StudentListResult {
  rows: Awaited<ReturnType<typeof fetchStudentRows>>;
  pager: Pager;
  matching: number;
  missingIds: number;
}

function fetchStudentRows(where: Record<string, unknown>, take: number, skip: number) {
  return prisma.student.findMany({
    where,
    orderBy: { id: 'desc' },
    take,
    skip,
    select: {
      id: true,
      student_id_no: true,
      name: true,
      name_bn: true,
      phone: true,
      image: true,
      course: true,
      batch: true,
      batch_id: true,
      roll_number: true,
      status: true,
      student_status: true,
      branch_id: true,
      _count: { select: { examResult_student: true } },
    },
  });
}

export async function studentList(filters: StudentFilters): Promise<StudentListResult> {
  const where = await studentWhere(filters);

  const [matching, missingIds] = await Promise.all([
    safe(() => prisma.student.count({ where }), 0),
    safe(
      () =>
        prisma.student.count({
          where: { ...where, OR: [{ student_id_no: null }, { student_id_no: '' }] },
        }),
      0
    ),
  ]);

  const pager = paginate(matching, 25, filters.page);
  const rows = await safe(() => fetchStudentRows(where, pager.perPage, pager.offset), []);

  return { rows, pager, matching, missingIds };
}

export type StudentRow = StudentListResult['rows'][number];

/**
 * The batches a set of students belong to, by batch id.
 *
 * **`students.batch_id` has no foreign key**, so there is no relation to include
 * — the original's LEFT JOIN becomes a second query. Reading the batch through a
 * relation that does not exist would have been a build error; resolving it in two
 * steps also means a student pointing at a deleted batch still lists, showing
 * their free-text `batch` column instead of vanishing.
 */
export async function batchesOf(rows: { batch_id: number | null }[]) {
  const ids = [...new Set(rows.map((row) => row.batch_id).filter((id): id is number => !!id))];
  const byId = new Map<number, AssignableBatch>();
  if (ids.length === 0) return byId;

  const batches = await safe(
    () =>
      prisma.batch.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          name: true,
          name_bn: true,
          batch_type: true,
          status: true,
          branch_id: true,
          course_id: true,
          course: { select: { id: true, name: true, name_bn: true } },
        },
      }),
    []
  );
  for (const batch of batches) byId.set(batch.id, batch);
  return byId;
}

/**
 * Batches an admin may put a student in.
 *
 * A branch-locked admin sees their own branch's batches only — moving a student
 * to another branch's batch is exactly what the lock exists to prevent. An
 * all-branch admin sees every batch, and the label names the branch, because
 * "Morning Batch" may exist at several.
 */
export async function assignableBatches() {
  const lock = await adminBranchLock();

  return safe(
    () =>
      prisma.batch.findMany({
        where: lock > 0 ? { OR: [{ branch_id: lock }, { branch_id: null }] } : {},
        orderBy: [{ batch_type: 'asc' }, { sort_order: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          name_bn: true,
          batch_type: true,
          status: true,
          branch_id: true,
          course_id: true,
          course: { select: { id: true, name: true, name_bn: true } },
        },
      }),
    []
  );
}

export type AssignableBatch = Awaited<ReturnType<typeof assignableBatches>>[number];
