import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { branchWhere, requireRecordBranch } from '@/lib/auth/guards';
import { paginate, type Pager } from '@/lib/paginate';
import type { Lang } from '@/lib/i18n';
import {
  feeAmount,
  feeLabel,
  feeAmountOrZero,
  feeDate,
  feeMethod,
  receiptNumber,
  refreshPlan,
  rowDue,
  rowState,
} from '@/lib/fees/core';

/**
 * The fee register, from admin/payment_tracking.php.
 *
 * Two things here are not interchangeable with admin/payment.php, which also
 * records payments:
 *
 *   1. A row added **here** is money already in the drawer, so it is written
 *      `paid` with today's date. `due_amount` above zero is what makes it a
 *      part payment.
 *   2. The branch in focus is **the payment's own** `branch_id` — where the
 *      money was taken — not the student's branch today. Moving a student
 *      between branches must not move last month's takings with them.
 */

export interface TrackingFilters {
  search: string;
  course: string;
  status: '' | 'paid' | 'unpaid';
  page: number;
}

export interface TrackingTotals {
  records: number;
  collected: number;
  due: number;
}

export interface TrackingRow {
  id: number;
  studentId: number;
  studentName: string;
  studentIdNo: string;
  course: string;
  phone: string;
  amount: number;
  dueAmount: number;
  due: number;
  status: 'paid' | 'partial' | 'unpaid';
  paymentStatus: string;
  month: string;
  method: string;
  transactionId: string;
  notes: string;
  feeType: string;
  dueDate: Date | null;
  paymentDate: Date | null;
  planTitle: string | null;
  planInstallments: number | null;
  /** True when something is still owed and the due date has gone by. */
  overdue: boolean;
}

export interface PaymentOutcome {
  ok: boolean;
  /** A translation key, with its placeholders already filled by the caller. */
  message: string;
  params?: Record<string, string>;
}

async function safe<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

export function trackingFilters(params: Record<string, string | undefined>): TrackingFilters {
  const status = params.status === 'paid' || params.status === 'unpaid' ? params.status : '';
  return {
    search: (params.search ?? '').trim().slice(0, 100),
    course: (params.course ?? '').trim().slice(0, 100),
    status,
    page: Number(params.page ?? 1),
  };
}

async function trackingWhere(filters: TrackingFilters): Promise<Record<string, unknown>> {
  const where: Record<string, unknown> = { ...(await branchWhere()) };
  const and: Record<string, unknown>[] = [];

  if (filters.search !== '') {
    and.push({
      OR: [
        { student: { name: { contains: filters.search, mode: 'insensitive' } } },
        { student: { phone: { contains: filters.search } } },
        { payment_month: { contains: filters.search, mode: 'insensitive' } },
      ],
    });
  }
  if (filters.course !== '') and.push({ student: { course: filters.course } });
  if (filters.status !== '') and.push({ payment_status: filters.status });

  if (and.length > 0) where.AND = and;
  return where;
}

/** Records, money taken and money still owed — over the filtered set, not the page. */
export async function trackingTotals(filters: TrackingFilters): Promise<TrackingTotals> {
  const where = await trackingWhere(filters);

  const [records, paid, unpaid] = await Promise.all([
    safe(() => prisma.payment.count({ where }), 0),
    safe(
      () =>
        prisma.payment.aggregate({
          where: { ...where, payment_status: 'paid' },
          _sum: { amount: true, due_amount: true },
        }),
      { _sum: { amount: null, due_amount: null } }
    ),
    safe(
      () =>
        prisma.payment.aggregate({
          where: { ...where, NOT: { payment_status: 'paid' } },
          _sum: { amount: true },
        }),
      { _sum: { amount: null } }
    ),
  ]);

  return {
    records,
    collected: Number(paid._sum.amount ?? 0),
    // The same reading as rowDue(), summed: a paid row owes its due_amount, an
    // unpaid row owes the whole amount.
    due: Number(paid._sum.due_amount ?? 0) + Number(unpaid._sum.amount ?? 0),
  };
}

export async function trackingRows(
  filters: TrackingFilters,
  total: number
): Promise<{ rows: TrackingRow[]; pager: Pager }> {
  const pager = paginate(total, 20, filters.page);
  const where = await trackingWhere(filters);

  const payments = await safe(
    () =>
      prisma.payment.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: pager.offset,
        take: pager.perPage,
        include: {
          student: {
            select: { id: true, name: true, student_id_no: true, course: true, phone: true },
          },
        },
      }),
    []
  );

  // installment_plans has no foreign key from payments, so the titles are a
  // second read rather than an include.
  const planIds = [
    ...new Set(payments.map((row) => row.installment_plan_id).filter((id): id is number => !!id)),
  ];
  const plans =
    planIds.length > 0
      ? await safe(
          () =>
            prisma.installmentPlan.findMany({
              where: { id: { in: planIds } },
              select: { id: true, title: true, installments: true },
            }),
          []
        )
      : [];
  const planById = new Map(plans.map((plan) => [plan.id, plan]));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rows: TrackingRow[] = payments.map((payment) => {
    const plan = payment.installment_plan_id
      ? (planById.get(payment.installment_plan_id) ?? null)
      : null;
    const due = rowDue(payment);

    return {
      id: payment.id,
      studentId: payment.student_id,
      studentName: payment.student.name,
      studentIdNo: payment.student.student_id_no ?? '',
      course: payment.student.course ?? '',
      phone: payment.student.phone ?? '',
      amount: Number(payment.amount),
      dueAmount: Number(payment.due_amount ?? 0),
      due,
      status: rowState(payment),
      paymentStatus: payment.payment_status ?? '',
      month: payment.payment_month ?? '',
      method: payment.payment_method ?? 'Cash',
      transactionId: payment.transaction_id ?? '',
      notes: payment.notes ?? '',
      feeType: payment.fee_type ?? '',
      dueDate: payment.due_date,
      paymentDate: payment.payment_date,
      planTitle: plan?.title ?? null,
      planInstallments: plan?.installments ?? null,
      overdue: due > 0 && payment.due_date !== null && payment.due_date < today,
    };
  });

  return { rows, pager };
}

/** The course names on the filter, limited to the admin's branch scope. */
export async function trackingCourses(): Promise<string[]> {
  const branch = await branchWhere();
  const rows = await safe(
    () =>
      prisma.student.findMany({
        where: branch,
        distinct: ['course'],
        orderBy: { course: 'asc' },
        select: { course: true },
      }),
    []
  );
  return rows.map((row) => row.course ?? '').filter((course) => course !== '');
}

/** Approved students, for the "record a payment" dropdown. */
export async function trackingStudents() {
  const branch = await branchWhere();
  return safe(
    () =>
      prisma.student.findMany({
        where: { ...branch, status: 'approved' },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, course: true, student_id_no: true },
      }),
    []
  );
}

export interface TrackingPaymentInput {
  paymentId: number;
  studentId: number;
  amount: string;
  dueAmount: string;
  month: string;
  method: string;
  notes: string;
  dueDate: string;
  /** Absent means "leave the due date alone", as the original's array_key_exists does. */
  hasDueDate: boolean;
}

interface ValidFields {
  amount: number;
  due: number;
  month: string;
  method: string;
  notes: string;
}

function validate(input: TrackingPaymentInput): { error: string } | ValidFields {
  const amount = feeAmount(input.amount);
  if (amount === null) return { error: 'apay.err_amount' as const };

  const due = feeAmountOrZero(input.dueAmount);
  if (due === null) return { error: 'apay.err_due' as const };

  const month = input.month.trim();
  if (month === '' || month.length > 20) return { error: 'apay.err_month' as const };

  if (input.hasDueDate && input.dueDate.trim() !== '' && feeDate(input.dueDate) === null) {
    return { error: 'fees.err_date' as const };
  }

  return {
    amount,
    due: Math.round(due),
    month,
    method: feeMethod(input.method) ?? 'Cash',
    notes: input.notes.trim().slice(0, 2000),
  };
}

/** A payment taken at the desk: always `paid`, dated now. */
export async function addTrackedPayment(
  input: TrackingPaymentInput,
  adminId: number
): Promise<PaymentOutcome> {
  const student = await safe(
    () =>
      prisma.student.findUnique({
        where: { id: input.studentId },
        select: { id: true, name: true, branch_id: true },
      }),
    null
  );
  if (!student) return { ok: false, message: 'apay.err_student' };

  await requireRecordBranch('students', student.id, false);

  const checked = validate(input);
  if ('error' in checked) return { ok: false, message: checked.error };

  try {
    await prisma.payment.create({
      data: {
        student_id: student.id,
        amount: checked.amount,
        payment_month: checked.month,
        payment_status: 'paid',
        payment_date: new Date(),
        payment_method: checked.method,
        notes: checked.notes !== '' ? checked.notes : null,
        due_amount: checked.due,
        receipt_number: await receiptNumber(),
        // Where the money was taken, read once and never rewritten.
        branch_id: student.branch_id,
        created_by: adminId > 0 ? adminId : null,
      },
    });
  } catch {
    return { ok: false, message: 'error.generic' };
  }

  return {
    ok: true,
    message: 'apay.added',
    params: { amount: String(checked.amount), name: student.name },
  };
}

/**
 * Correcting a payment already recorded.
 *
 * The student is never changed — a payment entered against the wrong person is
 * deleted and re-entered, so the receipt number never points at two people.
 */
export async function editTrackedPayment(input: TrackingPaymentInput): Promise<PaymentOutcome> {
  const payment = await safe(
    () => prisma.payment.findUnique({ where: { id: input.paymentId }, select: { id: true } }),
    null
  );
  if (!payment) return { ok: false, message: 'apay.not_found' };

  await requireRecordBranch('payments', payment.id, false);

  const checked = validate(input);
  if ('error' in checked) return { ok: false, message: checked.error };

  const dueDate = input.dueDate.trim() !== '' ? feeDate(input.dueDate) : null;

  try {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        amount: checked.amount,
        payment_month: checked.month,
        payment_method: checked.method,
        notes: checked.notes !== '' ? checked.notes : null,
        due_amount: checked.due,
        ...(input.hasDueDate
          ? { due_date: dueDate !== null ? new Date(`${dueDate}T00:00:00.000Z`) : null }
          : {}),
      },
    });
  } catch {
    return { ok: false, message: 'error.generic' };
  }

  return { ok: true, message: 'apay.updated' };
}

export async function deleteTrackedPayment(
  paymentId: number,
  lang: Lang
): Promise<PaymentOutcome> {
  const payment = await safe(
    () =>
      prisma.payment.findUnique({
        where: { id: paymentId },
        include: { student: { select: { name: true } } },
      }),
    null
  );
  if (!payment) return { ok: false, message: 'apay.not_found' };

  await requireRecordBranch('payments', payment.id, false);

  // A payment verified through an enrollment application is the record of that
  // approval; deleting it would leave the enrollment looking unpaid.
  if (payment.admission_id || payment.enrollment_id) {
    return { ok: false, message: 'apay.delete_linked' };
  }

  try {
    await prisma.payment.delete({ where: { id: payment.id } });
  } catch {
    return { ok: false, message: 'error.generic' };
  }

  await refreshPlan(payment.installment_plan_id);

  return {
    ok: true,
    message: 'apay.deleted',
    params: { name: payment.student.name, month: feeLabel(payment, lang) },
  };
}
