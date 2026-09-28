import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { feeAmount, feeDate, addMonths, rowDue } from './core';

/**
 * Instalment plans, from the INSTALMENT PLANS half of includes/fee_lib.php.
 *
 * A plan is a title, a total and N charges. The **schedule is whole taka each,
 * with the last instalment taking the remainder**, because a charge of 1666.67 is
 * not a thing anybody hands over at a desk — and `due_amount` is whole taka in
 * this schema anyway.
 *
 * Cancelling removes only the charges nothing has been paid on. Money already
 * taken stays recorded; that is not something a cancellation may erase.
 */

export interface PlanScheduleRow {
  no: number;
  dueDate: string;
  amount: number;
}

export function planSchedule(
  total: number,
  count: number,
  firstDue: string,
  interval: number
): PlanScheduleRow[] {
  const amount = Math.round(total * 100) / 100;
  const parts = Math.max(1, count);

  // Whole taka each; if that floors to zero the total is tiny, so fall back to an
  // even split with paisa.
  let each = Math.floor(amount / parts);
  if (each <= 0) each = Math.round((amount / parts) * 100) / 100;

  const rows: PlanScheduleRow[] = [];
  for (let index = 1; index <= parts; index++) {
    rows.push({
      no: index,
      dueDate: addMonths(firstDue, (index - 1) * interval),
      // The last one carries the rounding, so the parts always add to the total.
      amount: index < parts ? each : Math.round((amount - each * (parts - 1)) * 100) / 100,
    });
  }
  return rows;
}

export interface PlanInput {
  title: string;
  total: string;
  count: string;
  firstDue: string;
  interval: string;
  note: string;
}

export interface PlanData {
  title: string;
  total: number;
  count: number;
  first: string;
  interval: number;
  note: string;
}

/** Validates plan input; the errors are translation keys. */
export function planInput(input: PlanInput): { data: PlanData | null; errors: string[] } {
  const title = input.title.trim().slice(0, 150);
  const total = feeAmount(input.total);
  const count = /^\d+$/.test(input.count.trim()) ? Number(input.count) : 0;
  const first = feeDate(input.firstDue);
  const interval = /^\d+$/.test(input.interval.trim()) ? Number(input.interval) : 0;
  const note = input.note.trim().slice(0, 1000);

  const errors: string[] = [];
  if (title === '') errors.push('fees.err_title');
  if (total === null) errors.push('fees.err_amount');
  if (count < 2 || count > 24) errors.push('fees.err_count');
  if (first === null) errors.push('fees.err_date');
  if (interval < 1 || interval > 12) errors.push('fees.err_interval');
  // Fewer taka than instalments cannot be split into whole-taka charges.
  if (total !== null && count >= 2 && total < count) errors.push('fees.err_amount');

  const unique = [...new Set(errors)];
  if (unique.length > 0 || total === null || first === null) {
    return { data: null, errors: unique.length > 0 ? unique : ['fees.err_amount'] };
  }
  return { data: { title, total, count, first, interval, note }, errors: [] };
}

/** Creates a plan and its N unpaid charges. */
export async function createPlan(
  studentId: number,
  data: PlanData,
  adminId: number
): Promise<number> {
  const [enrollment, student] = await Promise.all([
    prisma.enrollment
      .findFirst({
        where: { student_id: studentId, status: 'active' },
        orderBy: [{ enrolled_at: 'desc' }, { id: 'desc' }],
        select: { id: true },
      })
      .catch(() => null),
    prisma.student
      .findUnique({ where: { id: studentId }, select: { branch_id: true } })
      .catch(() => null),
  ]);

  // The plan and its charges together or not at all: a plan saved without
  // (some of) its charges would bill less than its total and never complete.
  // The charges go in as one createMany rather than an insert each.
  const schedule = planSchedule(data.total, data.count, data.first, data.interval);
  const plan = await prisma.$transaction(async (tx) => {
    const created = await tx.installmentPlan.create({
      data: {
        student_id: studentId,
        enrollment_id: enrollment?.id ?? null,
        title: data.title,
        total_amount: data.total,
        installments: data.count,
        first_due_date: new Date(`${data.first}T00:00:00.000Z`),
        interval_months: data.interval,
        note: data.note !== '' ? data.note : null,
        created_by: adminId > 0 ? adminId : null,
      },
      select: { id: true },
    });

    await tx.payment.createMany({
      data: schedule.map((row) => ({
        student_id: studentId,
        amount: row.amount,
        // `payment_month` is free text that older screens print as-is.
        payment_month: `Installment ${row.no}/${data.count}`,
        payment_status: 'unpaid' as const,
        payment_date: new Date(),
        due_amount: 0,
        payment_method: 'Cash',
        notes: data.title.slice(0, 2000),
        fee_type: 'installment',
        due_date: new Date(`${row.dueDate}T00:00:00.000Z`),
        original_amount: row.amount,
        discount_amount: 0,
        installment_plan_id: created.id,
        installment_no: row.no,
        created_by: adminId > 0 ? adminId : null,
        branch_id: student?.branch_id ?? null,
      })),
    });

    return created;
  });

  return plan.id;
}

/**
 * Cancels an active plan.
 *
 * Only its **unpaid** charges are removed, and never one that came from an
 * enrolment application. Returns how many were removed, or null when the plan was
 * not active.
 */
export async function cancelPlan(planId: number): Promise<number | null> {
  const plan = await prisma.installmentPlan
    .findUnique({ where: { id: planId }, select: { id: true, status: true } })
    .catch(() => null);
  if (!plan || plan.status !== 'active') return null;

  try {
    // Both or neither: charges removed from a plan still marked active would
    // leave it owing nothing yet never completing.
    const [removed] = await prisma.$transaction([
      prisma.payment.deleteMany({
        where: {
          installment_plan_id: planId,
          payment_status: 'unpaid',
          admission_id: null,
          enrollment_id: null,
        },
      }),
      prisma.installmentPlan.update({ where: { id: planId }, data: { status: 'cancelled' } }),
    ]);
    return removed.count;
  } catch {
    return null;
  }
}

export interface PlanProgress {
  id: number;
  title: string;
  status: string;
  installments: number;
  totalAmount: number;
  firstDue: Date | null;
  intervalMonths: number;
  note: string | null;
  studentId: number;
  studentName: string;
  studentIdNo: string | null;
  charges: number;
  openCharges: number;
  paidAmount: number;
  dueAmount: number;
}

/** Plans with their progress, active first. */
export async function planList(status = '', take = 50): Promise<PlanProgress[]> {
  const plans = await prisma.installmentPlan
    .findMany({
      where: ['active', 'completed', 'cancelled'].includes(status)
        ? { status: status as 'active' | 'completed' | 'cancelled' }
        : {},
      orderBy: { id: 'desc' },
      take,
      include: {
        student: { select: { id: true, name: true, name_bn: true, student_id_no: true } },
      },
    })
    .catch(() => []);
  if (plans.length === 0) return [];

  const charges = await prisma.payment
    .findMany({
      where: { installment_plan_id: { in: plans.map((plan) => plan.id) } },
      select: {
        installment_plan_id: true,
        installment_no: true,
        amount: true,
        due_amount: true,
        payment_status: true,
      },
    })
    .catch(() => []);

  const rows = plans.map((plan) => {
    const own = charges.filter((charge) => charge.installment_plan_id === plan.id);
    const numbers = new Set(own.map((charge) => charge.installment_no));
    const openNumbers = new Set(
      own.filter((charge) => rowDue(charge) > 0).map((charge) => charge.installment_no)
    );

    return {
      id: plan.id,
      title: plan.title ?? '',
      status: plan.status,
      installments: plan.installments,
      totalAmount: Number(plan.total_amount),
      firstDue: plan.first_due_date,
      intervalMonths: plan.interval_months,
      note: plan.note,
      studentId: plan.student.id,
      studentName: plan.student.name,
      studentIdNo: plan.student.student_id_no,
      charges: numbers.size,
      openCharges: openNumbers.size,
      paidAmount: own
        .filter((charge) => charge.payment_status === 'paid')
        .reduce((sum, charge) => sum + Number(charge.amount), 0),
      dueAmount: own.reduce((sum, charge) => sum + rowDue(charge), 0),
    };
  });

  // Active plans are the ones being worked on, so they lead.
  const weight = (value: string) => (value === 'active' ? 0 : value === 'completed' ? 1 : 2);
  return rows.sort((a, b) => weight(a.status) - weight(b.status) || b.id - a.id);
}
