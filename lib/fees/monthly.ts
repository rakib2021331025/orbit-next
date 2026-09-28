import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { feeAmount, feeMonth, feeDate, defaultDueDate } from './core';
import { activeDiscountsFor, discountValue } from './discounts';
import { studentsInCourse, studentsInBatch } from '@/lib/reports/students';

/**
 * Raising the month's fees, from fee_monthly_preview() / fee_monthly_generate().
 *
 * **Preview, then confirm.** Charging a whole batch is not undoable in one
 * gesture, so the admin sees each student, the fee that would be used, the
 * discount that applies and what would happen — and then ticks who to charge.
 *
 * Where the fee comes from, in order: the amount the admin typed, the batch's own
 * fee, the fee recorded on the student's enrolment, then the course fee. The first
 * one that exists wins, which is why a batch with its own fee overrides its
 * course.
 *
 * Generation is **idempotent**: each student is re-checked at the moment of
 * writing, so pressing confirm twice does not charge anybody twice.
 */

export type PreviewStatus = 'create' | 'exists' | 'no_fee' | 'zero';

export interface PreviewRow {
  studentId: number;
  studentIdNo: string;
  name: string;
  nameBn: string | null;
  phone: string;
  courseLabel: string;
  batchLabel: string;
  /** The fee before any discount, or null when none could be found. */
  base: number | null;
  discount: number;
  final: number;
  status: PreviewStatus;
}

export interface MonthlyOptions {
  month: string;
  dueDate?: string;
  /** An amount typed by the admin, which overrides every stored fee. */
  amount?: number | null;
  courseId?: number;
  batchId?: number;
  /** When given, exactly these students. */
  studentIds?: number[];
}

async function safe<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

/**
 * Every way a charge for `month` (Y-m) may be spelled. Older rows store the
 * month as free text ("October 2026"), so those spellings count too.
 */
function monthSpellings(month: string): Set<string> {
  const monthDate = new Date(`${month}-01T00:00:00.000Z`);
  return new Set([
    month,
    monthDate.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).toLowerCase(),
    monthDate.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).toLowerCase(),
  ]);
}

/**
 * The charges of these students that may be for the month, as
 * (student_id, payment_month) pairs.
 *
 * The database narrows by "contains one of the spellings, any case" — a
 * superset of the exact trimmed match, which the caller still applies — so a
 * student's whole payment history is no longer read just to find one month.
 */
async function monthCharges(studentIds: number[], spellings: Set<string>) {
  return safe(
    () =>
      prisma.payment.findMany({
        where: {
          student_id: studentIds.length === 1 ? studentIds[0] : { in: studentIds },
          OR: [...spellings].map((spelling) => ({
            payment_month: { contains: spelling, mode: 'insensitive' as const },
          })),
        },
        select: { student_id: true, payment_month: true },
      }),
    [] as { student_id: number; payment_month: string }[]
  );
}

export async function monthlyPreview(
  options: MonthlyOptions,
  limit = 500
): Promise<PreviewRow[]> {
  const month = feeMonth(options.month);
  if (month === null) return [];

  const ids = [...new Set((options.studentIds ?? []).filter((id) => Number.isInteger(id) && id > 0))];

  let where: Record<string, unknown>;
  if (ids.length > 0) {
    where = { status: 'approved', student_status: 'Active', id: { in: ids } };
  } else {
    const and = [
      await studentsInCourse(options.courseId ?? 0),
      studentsInBatch(options.batchId ?? 0),
    ].filter((part): part is Record<string, unknown> => part !== null);

    // Without a course or batch there is no audience: charging "everybody"
    // by accident is exactly what this refusal prevents.
    if (and.length === 0) return [];
    where = { status: 'approved', student_status: 'Active', AND: and };
  }

  const students = await safe(
    () =>
      prisma.student.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: limit,
        select: {
          id: true,
          student_id_no: true,
          name: true,
          name_bn: true,
          phone: true,
          batch_id: true,
          enrollment_student: {
            where: { status: 'active' },
            orderBy: [{ enrolled_at: 'desc' }, { id: 'desc' }],
            take: 1,
            select: { fee: true, batch_id: true, course_id: true },
          },
        },
      }),
    []
  );
  if (students.length === 0) return [];

  const spellings = monthSpellings(month);
  const studentIds = students.map((student) => student.id);

  const [batches, courses, existing, discountsByStudent] = await Promise.all([
    safe(
      () =>
        prisma.batch.findMany({
          select: { id: true, course_id: true, name: true, name_bn: true, fee: true },
        }),
      []
    ),
    safe(() => prisma.course.findMany({ select: { id: true, name: true, name_bn: true, fee: true } }), []),
    // What each student already has for this month, in one query.
    monthCharges(studentIds, spellings),
    // Every student's discounts in one query, not one per row.
    activeDiscountsFor(studentIds, month, 'monthly'),
  ]);

  const batchById = new Map(batches.map((batch) => [batch.id, batch]));
  const courseById = new Map(courses.map((course) => [course.id, course]));

  const charged = new Set<number>();
  for (const row of existing) {
    if (spellings.has(row.payment_month.trim().toLowerCase())) charged.add(row.student_id);
  }

  const rows: PreviewRow[] = [];
  for (const student of students) {
    const enrollment = student.enrollment_student[0];

    const batchId = options.batchId || student.batch_id || enrollment?.batch_id || 0;
    const batch = batchId > 0 ? batchById.get(batchId) : undefined;
    const courseId = options.courseId || batch?.course_id || enrollment?.course_id || 0;
    const course = courseId > 0 ? courseById.get(courseId) : undefined;

    // The typed amount wins; then the batch's fee, the enrolment's, the course's.
    let base: number | null = options.amount ?? null;
    if (base === null && batch?.fee !== null && batch?.fee !== undefined && Number(batch.fee) > 0) {
      base = Number(batch.fee);
    }
    if (base === null && enrollment?.fee !== null && enrollment?.fee !== undefined && Number(enrollment.fee) > 0) {
      base = Number(enrollment.fee);
    }
    if (base === null && course?.fee !== null && course?.fee !== undefined && Number(course.fee) > 0) {
      base = Number(course.fee);
    }

    const discounts = discountsByStudent.get(student.id) ?? [];
    const discount = base !== null ? discountValue(base, discounts) : 0;
    const final = base !== null ? Math.round((base - discount) * 100) / 100 : 0;

    const status: PreviewStatus = charged.has(student.id)
      ? 'exists'
      : base === null
        ? 'no_fee'
        : final <= 0
          ? 'zero'
          : 'create';

    rows.push({
      studentId: student.id,
      studentIdNo: (student.student_id_no ?? '').trim() || `STU-${String(student.id).padStart(5, '0')}`,
      name: student.name,
      nameBn: student.name_bn,
      phone: student.phone,
      courseLabel: course?.name ?? '',
      batchLabel: batch?.name ?? '',
      base,
      discount,
      final,
      status,
    });
  }

  return rows;
}

export interface GenerateResult {
  created: number;
  skipped: number;
  ids: number[];
}

export async function monthlyGenerate(
  options: MonthlyOptions,
  adminId: number
): Promise<GenerateResult> {
  const month = feeMonth(options.month);
  const result: GenerateResult = { created: 0, skipped: 0, ids: [] };
  if (month === null || (options.studentIds ?? []).length === 0) return result;

  const dueDate = feeDate(options.dueDate ?? '') ?? (await defaultDueDate(month));
  const ids = [...new Set(options.studentIds ?? [])];

  // One preview for everybody ticked — its fee, discount and status per row —
  // and their branches in one read, instead of a full preview (five queries)
  // plus a student read for each student in turn.
  const [preview, branches] = await Promise.all([
    monthlyPreview({ ...options, studentIds: ids }, Math.max(1, ids.length)),
    safe(
      () =>
        prisma.student.findMany({
          where: { id: { in: ids } },
          select: { id: true, branch_id: true },
        }),
      [] as { id: number; branch_id: number | null }[]
    ),
  ]);
  const previewById = new Map(preview.map((row) => [row.studentId, row]));
  const branchById = new Map(branches.map((student) => [student.id, student.branch_id]));
  const spellings = monthSpellings(month);

  for (const studentId of ids) {
    const row = previewById.get(studentId);
    if (!row || row.status !== 'create' || row.base === null) {
      result.skipped++;
      continue;
    }

    // Whether the month is already charged is re-checked per student at the
    // moment of writing, so confirming twice does not charge anybody twice.
    const charged = (await monthCharges([studentId], spellings)).some((charge) =>
      spellings.has(charge.payment_month.trim().toLowerCase())
    );
    if (charged) {
      result.skipped++;
      continue;
    }

    try {
      const created = await prisma.payment.create({
        data: {
          student_id: studentId,
          amount: row.final,
          payment_month: month,
          payment_status: 'unpaid',
          payment_date: new Date(),
          due_amount: 0,
          payment_method: 'Cash',
          fee_type: 'monthly',
          due_date: new Date(`${dueDate}T00:00:00.000Z`),
          // What the fee was before the discount, so a receipt can show both.
          original_amount: row.base,
          discount_amount: row.discount,
          created_by: adminId > 0 ? adminId : null,
          // Where the money is owed, kept for branch revenue.
          branch_id: branchById.get(studentId) ?? null,
        },
        select: { id: true },
      });
      result.ids.push(created.id);
      result.created++;
    } catch {
      result.skipped++;
    }
  }

  return result;
}

export { feeAmount };
