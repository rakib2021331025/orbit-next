import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { branchWhere } from '@/lib/auth/guards';
import { rowDue } from './core';
import { studentsInCourse, studentsInBatch, studentSearch } from '@/lib/reports/students';

/**
 * Who owes money, from the DUES LIST half of includes/fee_lib.php.
 *
 * The original does this with a grouped sub-query per student. Here the charges
 * are read once and folded in memory, which produces the same numbers with one
 * query instead of a correlated one — and keeps the "due" definition in a single
 * place (`rowDue`) rather than repeating the CASE expression in SQL.
 *
 * The order is deliberate: **overdue students first**, then by amount. That is
 * the order somebody works down a list of phone calls in.
 */

export interface DuesFilters {
  courseId: number;
  batchId: number;
  overdue: boolean;
  search: string;
}

export interface DuesRow {
  studentId: number;
  studentIdNo: string | null;
  name: string;
  nameBn: string | null;
  phone: string;
  guardianPhone: string | null;
  email: string;
  course: string;
  batch: string | null;
  paid: number;
  due: number;
  overdueDue: number;
  nextDue: Date | null;
  dueRows: number;
  lastEmail: Date | null;
}

export interface DuesSummary {
  count: number;
  due: number;
  overdueDue: number;
  overdueStudents: number;
}

async function safe<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

export function duesFilters(query: Record<string, string | undefined>): DuesFilters {
  return {
    courseId: /^\d+$/.test(query.course ?? '') ? Number(query.course) : 0,
    batchId: /^\d+$/.test(query.batch ?? '') ? Number(query.batch) : 0,
    overdue: query.overdue === '1',
    search: (query.q ?? '').trim().slice(0, 100),
  };
}

/**
 * Every student with something outstanding, already filtered and sorted.
 *
 * Returned whole rather than paged, because the page needs the totals and the
 * reminder recipient list as well as the visible slice, and all three come from
 * the same fold.
 */
export async function duesRows(filters: DuesFilters): Promise<DuesRow[]> {
  const branch = await branchWhere();

  // The course, batch and search rules are the shared report ones, so the dues
  // list counts exactly the students every other report counts — including those
  // who predate enrolments.
  const and = [
    await studentsInCourse(filters.courseId),
    studentsInBatch(filters.batchId),
    studentSearch(filters.search),
  ].filter((part): part is Record<string, unknown> => part !== null);

  // Students first: the filters are all about the student, and this keeps the
  // charge query to the people who can actually appear.
  const students = await safe(
    () =>
      prisma.student.findMany({
        where: {
          status: 'approved',
          ...branch,
          ...(and.length > 0 ? { AND: and } : {}),
        },
        select: {
          id: true,
          student_id_no: true,
          name: true,
          name_bn: true,
          phone: true,
          guardian_phone: true,
          email: true,
          course: true,
          batch: true,
          batch_id: true,
        },
      }),
    []
  );
  if (students.length === 0) return [];

  const ids = students.map((student) => student.id);

  // Only the charges that can still owe something are read row by row: a
  // charge not marked paid (NULL included, as rowDue treats it), or a paid one
  // with a remainder. Every fully paid charge used to be read too, only to be
  // added into `paid` — that total now comes from one grouped sum per student.
  const [charges, paidTotals, reminders] = await Promise.all([
    safe(
      () =>
        prisma.payment.findMany({
          where: {
            student_id: { in: ids },
            OR: [
              { payment_status: null },
              { payment_status: { not: 'paid' } },
              { due_amount: { gt: 0 } },
            ],
          },
          select: {
            student_id: true,
            amount: true,
            due_amount: true,
            payment_status: true,
            due_date: true,
          },
        }),
      []
    ),
    safe(
      () =>
        prisma.payment.groupBy({
          by: ['student_id'],
          where: { student_id: { in: ids }, payment_status: 'paid' },
          _sum: { amount: true },
        }),
      [] as { student_id: number; _sum: { amount: unknown } }[]
    ),
    safe(
      () =>
        prisma.feeReminder.findMany({
          where: { student_id: { in: ids }, channel: 'email', status: 'sent' },
          select: { student_id: true, created_at: true },
        }),
      []
    ),
  ]);

  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));

  const totals = new Map<
    number,
    { paid: number; due: number; overdueDue: number; nextDue: Date | null; dueRows: number }
  >();

  for (const charge of charges) {
    const entry =
      totals.get(charge.student_id) ??
      { paid: 0, due: 0, overdueDue: 0, nextDue: null as Date | null, dueRows: 0 };

    const due = rowDue(charge);
    if (due > 0) {
      entry.due += due;
      entry.dueRows++;
      if (charge.due_date !== null && charge.due_date < todayUtc) entry.overdueDue += due;
      if (charge.due_date !== null && (entry.nextDue === null || charge.due_date < entry.nextDue)) {
        entry.nextDue = charge.due_date;
      }
    }

    totals.set(charge.student_id, entry);
  }

  const paidByStudent = new Map(
    paidTotals.map((row) => [row.student_id, Number(row._sum.amount ?? 0)])
  );

  const lastEmail = new Map<number, Date>();
  for (const reminder of reminders) {
    const current = lastEmail.get(reminder.student_id);
    if (!current || reminder.created_at > current) lastEmail.set(reminder.student_id, reminder.created_at);
  }

  const rows: DuesRow[] = [];
  for (const student of students) {
    const entry = totals.get(student.id);
    // Nothing outstanding: not a row on a dues list.
    if (!entry || entry.due <= 0) continue;
    if (filters.overdue && entry.overdueDue <= 0) continue;

    rows.push({
      studentId: student.id,
      studentIdNo: student.student_id_no,
      name: student.name,
      nameBn: student.name_bn,
      phone: student.phone,
      guardianPhone: student.guardian_phone,
      email: student.email,
      course: student.course,
      batch: student.batch,
      paid: paidByStudent.get(student.id) ?? 0,
      due: entry.due,
      overdueDue: entry.overdueDue,
      nextDue: entry.nextDue,
      dueRows: entry.dueRows,
      lastEmail: lastEmail.get(student.id) ?? null,
    });
  }

  // Overdue first, then the largest amount: the order you make calls in.
  return rows.sort(
    (a, b) =>
      Number(b.overdueDue > 0) - Number(a.overdueDue > 0) ||
      b.due - a.due ||
      a.name.localeCompare(b.name)
  );
}

export function duesSummary(rows: DuesRow[]): DuesSummary {
  return {
    count: rows.length,
    due: rows.reduce((sum, row) => sum + row.due, 0),
    overdueDue: rows.reduce((sum, row) => sum + row.overdueDue, 0),
    overdueStudents: rows.filter((row) => row.overdueDue > 0).length,
  };
}

/**
 * Everything one student owes, item by item.
 *
 * A charge paid in parts is **one item**, which is why the paid parts are folded
 * into their parent rather than listed: the student is owed one answer to "what
 * do I still have to pay", not a ledger.
 */
export async function studentDueItems(studentId: number) {
  const charges = await safe(
    () =>
      prisma.payment.findMany({
        where: { student_id: studentId },
        orderBy: [{ due_date: 'asc' }, { id: 'asc' }],
      }),
    []
  );

  const plans = await safe(
    () =>
      prisma.installmentPlan.findMany({
        where: { student_id: studentId },
        select: { id: true, title: true, installments: true, status: true },
      }),
    []
  );
  const planById = new Map(plans.map((plan) => [plan.id, plan]));

  const items = charges
    .filter((charge) => rowDue(charge) > 0)
    .map((charge) => ({
      ...charge,
      due: rowDue(charge),
      plan_title: charge.installment_plan_id
        ? (planById.get(charge.installment_plan_id)?.title ?? null)
        : null,
      plan_installments: charge.installment_plan_id
        ? (planById.get(charge.installment_plan_id)?.installments ?? null)
        : null,
    }));

  const paid = charges
    .filter((charge) => charge.payment_status === 'paid')
    .reduce((sum, charge) => sum + Number(charge.amount), 0);

  return { items, paid, due: items.reduce((sum, item) => sum + item.due, 0), charges };
}
