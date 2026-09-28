import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { feeAmount, feeMonth, feeDate } from './core';
import { formatNumber, formatMoney, type Lang } from '@/lib/i18n/format';

/**
 * Per-student fee discounts, from includes/fee_lib.php and the discounts tab of
 * admin/fees.php.
 *
 * A discount is either a **fixed** amount or a **percentage**, applies to monthly
 * fees or to everything, and may run between two dates. Several can apply at once:
 * fixed amounts and percentages add up, and the total is capped at the fee — a
 * discount never turns into money owed to the student.
 */

export interface DiscountOutcome {
  ok: boolean;
  /** A translation key. */
  message: string;
  field?: string;
}

const fail = (message: string, field?: string): DiscountOutcome => ({ ok: false, message, field });

async function safe<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

export interface DiscountRow {
  id: number;
  student_id: number;
  discount_type: string;
  value: unknown;
  applies_to: string;
  reason: string | null;
  starts_on: Date | null;
  ends_on: Date | null;
  is_active: boolean;
}

/**
 * The discounts in force for one student in one month.
 *
 * A discount counts when its window **overlaps** the month, not when it contains
 * it: a discount starting mid-month still applies to that month's fee.
 */
export async function activeDiscounts(
  studentId: number,
  month: string,
  appliesTo: 'monthly' | 'all' = 'monthly'
): Promise<DiscountRow[]> {
  return (await activeDiscountsFor([studentId], month, appliesTo)).get(studentId) ?? [];
}

/**
 * `activeDiscounts` for a whole list of students in ONE query, keyed by
 * student. A monthly-fee preview covers up to hundreds of students, and asking
 * once per student was a query per row. Same filter, same id order per student.
 */
export async function activeDiscountsFor(
  studentIds: number[],
  month: string,
  appliesTo: 'monthly' | 'all' = 'monthly'
): Promise<Map<number, DiscountRow[]>> {
  const out = new Map<number, DiscountRow[]>();
  if (studentIds.length === 0) return out;

  const target = feeMonth(month) ?? new Date().toISOString().slice(0, 7);
  const [year, monthNumber] = target.split('-').map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 0));

  const rows = await safe(
    () =>
      prisma.feeDiscount.findMany({
        where: {
          student_id: studentIds.length === 1 ? studentIds[0] : { in: studentIds },
          is_active: true,
          applies_to: { in: [appliesTo, 'all'] },
          AND: [
            { OR: [{ starts_on: null }, { starts_on: { lte: end } }] },
            { OR: [{ ends_on: null }, { ends_on: { gte: start } }] },
          ],
        },
        orderBy: { id: 'asc' },
      }),
    []
  );

  for (const row of rows) {
    const list = out.get(row.student_id) ?? [];
    list.push(row);
    out.set(row.student_id, list);
  }
  return out;
}

/**
 * What a set of discounts takes off an amount.
 *
 * Percentages are rounded to whole taka — the fee columns hold whole taka for
 * everything owed — and the total can never exceed the amount itself.
 */
export function discountValue(amount: number, discounts: DiscountRow[]): number {
  let total = 0;
  for (const discount of discounts) {
    const value = Number(discount.value ?? 0);
    total +=
      discount.discount_type === 'percent'
        ? Math.round((amount * Math.min(100, value)) / 100)
        : value;
  }
  return Math.round(Math.min(amount, Math.max(0, total)) * 100) / 100;
}

/** "৳500" or "10%" for one discount row. */
export function discountText(discount: DiscountRow, lang: Lang): string {
  const value = Number(discount.value ?? 0);
  return discount.discount_type === 'percent'
    ? `${formatNumber(value, Number.isInteger(value) ? 0 : 2, lang)}%`
    : formatMoney(value, lang);
}

export interface DiscountInput {
  id: number;
  studentId: number;
  type: string;
  value: string;
  appliesTo: string;
  reason: string;
  startsOn: string;
  endsOn: string;
  isActive: boolean;
}

export async function saveDiscount(
  input: DiscountInput,
  adminId: number
): Promise<DiscountOutcome> {
  const student = await safe(
    () => prisma.student.findUnique({ where: { id: input.studentId }, select: { id: true } }),
    null
  );
  if (!student) return fail('fees.err_student', 'student_id');

  if (!['fixed', 'percent'].includes(input.type) || !['monthly', 'all'].includes(input.appliesTo)) {
    return fail('fees.err_discount');
  }

  const value = feeAmount(input.value);
  // A percentage above 100 would be a discount larger than the fee.
  if (value === null || (input.type === 'percent' && value > 100)) {
    return fail('fees.err_discount_value', 'value');
  }

  const start = input.startsOn.trim() === '' ? null : feeDate(input.startsOn);
  const end = input.endsOn.trim() === '' ? null : feeDate(input.endsOn);
  if (
    (input.startsOn.trim() !== '' && start === null) ||
    (input.endsOn.trim() !== '' && end === null) ||
    (start !== null && end !== null && end < start)
  ) {
    return fail('fees.err_period', 'starts_on');
  }

  if (input.id > 0) {
    const exists = await safe(
      () => prisma.feeDiscount.findUnique({ where: { id: input.id }, select: { id: true } }),
      null
    );
    if (!exists) return fail('error.not_found_body');
  }

  const data = {
    student_id: input.studentId,
    discount_type: input.type as 'fixed' | 'percent',
    value,
    applies_to: input.appliesTo as 'monthly' | 'all',
    reason: input.reason.trim() !== '' ? input.reason.trim().slice(0, 255) : null,
    starts_on: start !== null ? new Date(`${start}T00:00:00.000Z`) : null,
    ends_on: end !== null ? new Date(`${end}T00:00:00.000Z`) : null,
    is_active: input.isActive,
  };

  try {
    if (input.id > 0) await prisma.feeDiscount.update({ where: { id: input.id }, data });
    else await prisma.feeDiscount.create({ data: { ...data, created_by: adminId > 0 ? adminId : null } });
  } catch {
    return fail('error.generic');
  }

  return { ok: true, message: 'fees.discount_saved' };
}

export async function toggleDiscount(id: number): Promise<DiscountOutcome> {
  const discount = await safe(
    () => prisma.feeDiscount.findUnique({ where: { id }, select: { is_active: true } }),
    null
  );
  if (!discount) return fail('error.not_found_body');

  try {
    await prisma.feeDiscount.update({ where: { id }, data: { is_active: !discount.is_active } });
  } catch {
    return fail('error.generic');
  }
  return { ok: true, message: 'fees.discount_toggled' };
}

export async function deleteDiscount(id: number): Promise<DiscountOutcome> {
  try {
    const removed = await prisma.feeDiscount.deleteMany({ where: { id } });
    if (removed.count === 0) return fail('error.not_found_body');
  } catch {
    return fail('error.generic');
  }
  return { ok: true, message: 'fees.discount_deleted' };
}

/** Every discount, newest first, with the student it belongs to. */
export async function discountList(take = 100) {
  return safe(
    () =>
      prisma.feeDiscount.findMany({
        orderBy: [{ is_active: 'desc' }, { id: 'desc' }],
        take,
        include: {
          student: {
            select: { id: true, name: true, name_bn: true, student_id_no: true, course: true },
          },
        },
      }),
    []
  );
}
