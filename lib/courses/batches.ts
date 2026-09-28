import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { requireRecordBranch, adminBranchLock } from '@/lib/auth/guards';
import { recordBranchId } from '@/lib/branch/assign';

/**
 * Batch management, from admin/batches_management.php.
 *
 * A batch belongs to one course, one branch and one mode (online or offline).
 * The unique key is (course, branch, name, type), which is why **the same batch
 * name may exist at another branch** — "Morning Batch" at two branches is two
 * batches, and treating them as one is the leak the audience rule exists to
 * prevent.
 *
 * **A batch any record points at is never deleted.** Enrolments, students,
 * attendance, exams, applications and live classes all reference it by id;
 * deactivating hides it from the website and the enroll flow while keeping every
 * record intact.
 */

export type BatchType = 'online' | 'offline';

export interface BatchInput {
  id: number;
  course_id: number;
  batch_type: string;
  name: string;
  name_bn: string;
  schedule_info: string;
  schedule_info_bn: string;
  start_date: string;
  capacity: string;
  fee: string;
  status: string;
  sort_order: string;
  branch_id: string;
}

export interface BatchOutcome {
  ok: boolean;
  /** A translation key. */
  message: string;
  vars?: Record<string, string | number>;
  /** Which field the message belongs to, for the form. */
  field?: string;
  batchId?: number;
  courseId?: number;
}

const fail = (message: string, field?: string, vars?: Record<string, string | number>): BatchOutcome => ({
  ok: false,
  message,
  field,
  vars,
});

function validDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const probe = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return (
    probe.getUTCFullYear() === Number(match[1]) &&
    probe.getUTCMonth() === Number(match[2]) - 1 &&
    probe.getUTCDate() === Number(match[3])
  );
}

export async function saveBatch(input: BatchInput): Promise<BatchOutcome> {
  const id = Number(input.id) || 0;

  let existing: { id: number; branch_id: number | null } | null = null;
  if (id > 0) {
    existing = await prisma.batch
      .findUnique({ where: { id }, select: { id: true, branch_id: true } })
      .catch(() => null);
    if (!existing) return fail('abat.not_found');
    // A branch admin edits only their own branch's batches.
    await requireRecordBranch('batches', id, false);
  }

  const name = input.name.trim();
  const nameBn = input.name_bn.trim();
  const schedule = input.schedule_info.trim();
  const scheduleBn = input.schedule_info_bn.trim();
  const startDate = input.start_date.trim();
  const capacity = input.capacity.trim();
  const fee = input.fee.trim();
  const sortOrder = input.sort_order.trim() === '' ? '0' : input.sort_order.trim();

  const course =
    input.course_id > 0
      ? await prisma.course
          .findUnique({ where: { id: input.course_id }, select: { id: true } })
          .catch(() => null)
      : null;
  if (!course) return fail('abat.err_course', 'course_id');

  if (input.batch_type !== 'online' && input.batch_type !== 'offline') {
    return fail('abat.err_type', 'batch_type');
  }
  if (name === '' || name.length > 150) return fail('abat.err_name', 'name');
  if (nameBn.length > 150) return fail('abat.err_name_bn', 'name_bn');
  if (schedule.length > 255) return fail('abat.err_schedule', 'schedule_info');
  if (scheduleBn.length > 255) return fail('abat.err_schedule', 'schedule_info_bn');
  if (startDate !== '' && !validDate(startDate)) return fail('abat.err_start', 'start_date');
  if (capacity !== '' && (!/^\d+$/.test(capacity) || Number(capacity) < 1 || Number(capacity) > 100000)) {
    return fail('abat.err_capacity', 'capacity');
  }
  if (fee !== '' && (Number.isNaN(Number(fee)) || Number(fee) < 0 || Number(fee) > 99999999)) {
    return fail('abat.err_fee', 'fee');
  }
  if (!/^-?\d{1,6}$/.test(sortOrder)) return fail('abat.err_sort', 'sort_order');

  // A locked admin's own branch, whatever the form said.
  const branchId = await recordBranchId(input.branch_id);
  const branch = branchId > 0 ? branchId : null;

  // Say it before the database does: the unique key is per branch, so the same
  // name at another branch is fine and the message has to be about this one.
  const clash = await prisma.batch
    .findFirst({
      where: {
        course_id: input.course_id,
        branch_id: branch,
        name,
        batch_type: input.batch_type,
        NOT: { id: id > 0 ? id : -1 },
      },
      select: { id: true },
    })
    .catch(() => null);
  if (clash) {
    return fail('abat.err_duplicate', 'name', {
      type: input.batch_type === 'online' ? 'course.type_online' : 'course.type_offline',
    });
  }

  const data = {
    course_id: input.course_id,
    name,
    name_bn: nameBn !== '' ? nameBn : null,
    batch_type: input.batch_type as BatchType,
    schedule_info: schedule !== '' ? schedule : null,
    schedule_info_bn: scheduleBn !== '' ? scheduleBn : null,
    start_date: startDate !== '' ? new Date(`${startDate}T00:00:00.000Z`) : null,
    capacity: capacity === '' ? null : Number(capacity),
    fee: fee === '' ? null : Math.round(Number(fee) * 100) / 100,
    status: input.status === 'inactive' ? ('inactive' as const) : ('active' as const),
    sort_order: Number(sortOrder),
    branch_id: branch,
  };

  let batchId = id;
  try {
    if (existing) {
      await prisma.batch.update({ where: { id: existing.id }, data });
    } else {
      const created = await prisma.batch.create({ data, select: { id: true } });
      batchId = created.id;
    }
  } catch (error) {
    // The unique key is the backstop for a race between the check above and here.
    if ((error as { code?: string }).code === 'P2002') {
      return fail('abat.err_duplicate', 'name', {
        type: input.batch_type === 'online' ? 'course.type_online' : 'course.type_offline',
      });
    }
    return fail('error.generic', 'form');
  }

  // A batch at a branch means that branch offers the course.
  if (branch !== null) await offerCourseAtBranch(branch, input.course_id);

  return {
    ok: true,
    message: existing ? 'abat.updated' : 'abat.created',
    vars: { name },
    batchId,
    courseId: input.course_id,
  };
}

/** Records that a branch offers a course, without disturbing the others. */
export async function offerCourseAtBranch(branchId: number, courseId: number): Promise<void> {
  if (branchId <= 0 || courseId <= 0) return;
  try {
    await prisma.branchCourse.upsert({
      where: { branch_id_course_id: { branch_id: branchId, course_id: courseId } },
      create: { branch_id: branchId, course_id: courseId, status: 'active' },
      update: { status: 'active' },
    });
  } catch {
    // The batch is saved either way; the offering can be set on the course page.
  }
}

export async function toggleBatch(batchId: number): Promise<BatchOutcome> {
  const batch = await prisma.batch
    .findUnique({ where: { id: batchId }, select: { id: true, name: true, status: true, course_id: true } })
    .catch(() => null);
  if (!batch) return fail('abat.not_found');
  await requireRecordBranch('batches', batchId, false);

  const next = batch.status === 'active' ? ('inactive' as const) : ('active' as const);
  try {
    await prisma.batch.update({ where: { id: batchId }, data: { status: next } });
  } catch {
    return fail('error.generic');
  }

  return {
    ok: true,
    message: next === 'active' ? 'abat.activated' : 'abat.deactivated',
    vars: { name: batch.name },
    courseId: batch.course_id ?? 0,
  };
}

/** Tables that still point at a batch, with counts. Empty means safe to delete. */
export async function batchUsage(batchId: number): Promise<Record<string, number>> {
  const usage: Record<string, number> = {};

  const counts = await Promise.all([
    prisma.enrollment.count({ where: { batch_id: batchId } }),
    prisma.student.count({ where: { batch_id: batchId } }),
    prisma.attendance.count({ where: { batch_id: batchId } }),
    prisma.monthlyExam.count({ where: { batch_id: batchId } }),
    prisma.admission.count({ where: { batch_id: batchId } }),
    prisma.liveClass.count({ where: { batch_id: batchId } }),
  ]);

  const tables = ['enrollments', 'students', 'attendance', 'monthly_exams', 'admissions', 'live_classes'];
  tables.forEach((table, index) => {
    if (counts[index] > 0) usage[table] = counts[index];
  });

  return usage;
}

export async function deleteBatch(batchId: number): Promise<BatchOutcome & { usage?: Record<string, number> }> {
  const batch = await prisma.batch
    .findUnique({ where: { id: batchId }, select: { id: true, name: true, course_id: true } })
    .catch(() => null);
  if (!batch) return fail('abat.not_found');
  await requireRecordBranch('batches', batchId, false);

  let usage: Record<string, number>;
  try {
    usage = await batchUsage(batchId);
  } catch {
    // A check that could not run means the delete is refused, not allowed.
    return fail('error.generic');
  }

  if (Object.keys(usage).length > 0) {
    return { ok: false, message: 'abat.in_use', vars: { name: batch.name }, usage };
  }

  try {
    await prisma.batch.delete({ where: { id: batchId } });
  } catch {
    return fail('error.generic');
  }

  return {
    ok: true,
    message: 'abat.deleted',
    vars: { name: batch.name },
    courseId: batch.course_id ?? 0,
  };
}

/**
 * The quick fee / duration / status edit on a course, from the "Course details"
 * dialog. Everything else about a course is on the courses page.
 */
export async function saveCourseQuick(
  courseId: number,
  fee: string,
  duration: string,
  status: string
): Promise<BatchOutcome> {
  const course = await prisma.course
    .findUnique({ where: { id: courseId }, select: { id: true, name: true } })
    .catch(() => null);
  if (!course) return fail('abat.course_not_found');

  const feeRaw = fee.trim();
  const durationRaw = duration.trim();

  if (feeRaw !== '' && (Number.isNaN(Number(feeRaw)) || Number(feeRaw) < 0 || Number(feeRaw) > 99999999)) {
    return fail('abat.err_fee', 'fee');
  }
  if (durationRaw.length > 100) return fail('abat.err_duration', 'duration');

  try {
    await prisma.course.update({
      where: { id: courseId },
      data: {
        fee: feeRaw === '' ? null : Math.round(Number(feeRaw) * 100) / 100,
        duration: durationRaw !== '' ? durationRaw : null,
        status: status === 'inactive' ? 'inactive' : 'active',
      },
    });
  } catch {
    return fail('error.generic');
  }

  return { ok: true, message: 'abat.course_saved', vars: { name: course.name }, courseId };
}

/**
 * Courses with their batches, for the grouped list.
 *
 * Only the branch in focus, so an admin looking at one branch sees the batches
 * that branch actually runs.
 */
export async function batchesByCourse() {
  const lock = await adminBranchLock();

  const [courses, batches, studentCounts] = await Promise.all([
    prisma.course
      .findMany({
        orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          name_bn: true,
          course_type: true,
          fee: true,
          duration: true,
          status: true,
        },
      })
      .catch(() => []),
    prisma.batch
      .findMany({
        where: lock > 0 ? { branch_id: lock } : {},
        orderBy: [{ batch_type: 'asc' }, { sort_order: 'asc' }, { name: 'asc' }],
      })
      .catch(() => []),
    prisma.student
      .groupBy({ by: ['batch_id'], where: { batch_id: { not: null } }, _count: { _all: true } })
      .catch(() => []),
  ]);

  const students = new Map(studentCounts.map((row) => [row.batch_id ?? 0, row._count._all]));
  const grouped = new Map<number, typeof batches>();
  for (const batch of batches) {
    const key = batch.course_id ?? 0;
    grouped.set(key, [...(grouped.get(key) ?? []), batch]);
  }

  return { courses, grouped, students };
}
