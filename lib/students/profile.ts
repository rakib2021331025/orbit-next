import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { requireRecordBranch } from '@/lib/auth/guards';
import { rowDue } from '@/lib/fees/core';

/**
 * One student's full record for the admin profile page, from admin/student.php.
 *
 * `loadStudent()` applies the branch rule before returning anything: a
 * branch-locked admin who edits the id in the URL gets null, not another
 * branch's student. Returning null rather than throwing lets the page render
 * the same "no such student" state either way, which is also what stops the
 * page confirming that an id exists at another branch.
 */

export async function loadStudent(id: number) {
  if (!Number.isInteger(id) || id <= 0) return null;

  const student = await prisma.student.findUnique({ where: { id } }).catch(() => null);
  if (!student) return null;

  try {
    await requireRecordBranch('students', id, false);
  } catch {
    return null;
  }
  return student;
}

export type StudentRecord = NonNullable<Awaited<ReturnType<typeof loadStudent>>>;

/**
 * Every charge on the student, newest first.
 *
 * The instalment plan is fetched separately by `plansOf()`: `installment_plan_id`
 * carries no foreign key, so there is no relation to include. A row reading
 * "Instalment 2/4" without saying which plan it belongs to is meaningless once a
 * student has two, which is why the title is resolved at all.
 */
export async function studentCharges(studentId: number) {
  return prisma.payment
    .findMany({
      where: { student_id: studentId },
      orderBy: { id: 'desc' },
      select: {
        id: true,
        amount: true,
        due_amount: true,
        payment_month: true,
        payment_status: true,
        payment_date: true,
        payment_method: true,
        receipt_number: true,
        notes: true,
        fee_type: true,
        due_date: true,
        installment_no: true,
        installment_plan_id: true,
        admission_id: true,
        enrollment_id: true,
      },
    })
    .catch(() => []);
}

export type StudentCharge = Awaited<ReturnType<typeof studentCharges>>[number];

/** The instalment plans a set of charges belong to, by plan id. */
export async function plansOf(charges: { installment_plan_id: number | null }[]) {
  const ids = [
    ...new Set(charges.map((c) => c.installment_plan_id).filter((id): id is number => !!id)),
  ];
  const byId = new Map<number, { title: string; installments: number; status: string }>();
  if (ids.length === 0) return byId;

  const plans = await prisma.installmentPlan
    .findMany({
      where: { id: { in: ids } },
      select: { id: true, title: true, installments: true, status: true },
    })
    .catch(() => []);

  for (const plan of plans) {
    byId.set(plan.id, {
      title: plan.title ?? '',
      installments: plan.installments,
      status: plan.status,
    });
  }
  return byId;
}

export interface ChargeTotals {
  paid: number;
  due: number;
  unpaidCount: number;
}

/** Totals over the charge list, using the app's one definition of "due". */
export function chargeTotals(charges: StudentCharge[]): ChargeTotals {
  let paid = 0;
  let due = 0;
  let unpaidCount = 0;

  for (const charge of charges) {
    if (charge.payment_status === 'paid') {
      paid += Number(charge.amount);
    } else {
      unpaidCount++;
    }
    due += rowDue(charge);
  }

  return { paid, due, unpaidCount };
}

/** The guardian accounts that can see this student in the guardian portal. */
export async function studentGuardians(studentId: number) {
  return prisma.guardianStudent
    .findMany({
      where: { student_id: studentId },
      orderBy: { guardian_id: 'asc' },
      select: {
        relation: true,
        guardian: {
          select: { id: true, name: true, phone: true, email: true, status: true },
        },
      },
    })
    .catch(() => []);
}
