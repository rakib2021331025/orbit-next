'use server';

import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { getLang, translate } from '@/lib/i18n';
import { toLocalDigits, formatMoney, monthLabel } from '@/lib/i18n/format';
import { saveSetting } from '@/lib/settings/save';
import { collectFee } from '@/lib/fees/collect';
import { monthlyGenerate } from '@/lib/fees/monthly';
import { feeAmount, feeMonth, feeDate } from '@/lib/fees/core';
import { planInput, createPlan, cancelPlan } from '@/lib/fees/plans';
import { saveDiscount, toggleDiscount, deleteDiscount } from '@/lib/fees/discounts';
import { prisma } from '@/lib/db/prisma';

/**
 * The fee hub's actions, from admin/fees.php.
 *
 * **Super admins only.** Fees are institute-wide money, and a branch-restricted
 * admin must not see or change another branch's — the page is off their allow-list
 * and `requireSuperAdmin()` is the second, explicit check the original also makes.
 */

export interface FeeState {
  error: string;
  message: string;
}

function refresh(studentId?: number): void {
  revalidatePath('/admin/fees');
  revalidatePath('/admin/payment-tracking');
  revalidatePath('/admin');
  if (studentId) revalidatePath(`/admin/students/${studentId}`);
  revalidatePath('/student/payments');
}

function text(formData: FormData, field: string, max = 255): string {
  return String(formData.get(field) ?? '').trim().slice(0, max);
}

/** Money received against one charge. */
export async function collectAction(_prev: FeeState, formData: FormData): Promise<FeeState> {
  const admin = await requireSuperAdmin();
  const lang = await getLang();

  const result = await collectFee(
    Number(formData.get('payment_id') ?? 0),
    text(formData, 'amount', 20),
    text(formData, 'payment_method', 30),
    text(formData, 'transaction_id', 100),
    text(formData, 'notes', 1000),
    admin.id
  );

  if (!result.ok) return { error: translate(lang, result.error), message: '' };

  refresh(result.studentId);

  return {
    error: '',
    message:
      result.status === 'paid'
        ? translate(lang, 'fees.collected_full', { amount: formatMoney(result.amount, lang) })
        : translate(lang, 'fees.collected_partial', {
            amount: formatMoney(result.amount, lang),
            balance: formatMoney(result.balance, lang),
          }),
  };
}

/** Raising a month's fees for the students that were ticked. */
export async function generateAction(_prev: FeeState, formData: FormData): Promise<FeeState> {
  const admin = await requireSuperAdmin();
  const lang = await getLang();

  const monthRaw = text(formData, 'month', 7);
  const dueRaw = text(formData, 'due_date', 10);
  const amountRaw = text(formData, 'amount', 20);

  const month = feeMonth(monthRaw);
  const due = dueRaw === '' ? null : feeDate(dueRaw);
  const amount = amountRaw === '' ? null : feeAmount(amountRaw);

  if (month === null || (dueRaw !== '' && due === null) || (amountRaw !== '' && amount === null)) {
    return { error: translate(lang, 'fees.err_generate_input'), message: '' };
  }

  const students = formData
    .getAll('students')
    .map((value) => Number(value))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (students.length === 0) {
    return { error: translate(lang, 'fees.err_no_students'), message: '' };
  }

  const result = await monthlyGenerate(
    {
      month,
      dueDate: due ?? undefined,
      amount,
      courseId: Number(formData.get('course') ?? 0) || 0,
      batchId: Number(formData.get('batch') ?? 0) || 0,
      studentIds: students,
    },
    admin.id
  );

  refresh();

  const message = translate(lang, 'fees.generated', {
    created: toLocalDigits(result.created, lang),
    skipped: toLocalDigits(result.skipped, lang),
    month: monthLabel(month, lang),
  });
  // Nothing created is not an error, but it is not a success either.
  return result.created > 0 ? { error: '', message } : { error: message, message: '' };
}

export async function createPlanAction(_prev: FeeState, formData: FormData): Promise<FeeState> {
  const admin = await requireSuperAdmin();
  const lang = await getLang();

  const studentId = Number(formData.get('student_id') ?? 0);
  const { data, errors } = planInput({
    title: text(formData, 'title', 150),
    total: text(formData, 'total', 20),
    count: text(formData, 'count', 3),
    firstDue: text(formData, 'first_due', 10),
    interval: text(formData, 'interval', 2),
    note: text(formData, 'note', 1000),
  });

  const student =
    studentId > 0
      ? await prisma.student
          .findUnique({ where: { id: studentId }, select: { id: true, name: true } })
          .catch(() => null)
      : null;
  if (!student) return { error: translate(lang, 'fees.err_student'), message: '' };
  if (data === null) return { error: translate(lang, errors[0]), message: '' };

  try {
    await createPlan(student.id, data, admin.id);
  } catch {
    return { error: translate(lang, 'error.generic'), message: '' };
  }

  refresh(student.id);
  return {
    error: '',
    message: translate(lang, 'fees.plan_created', {
      count: toLocalDigits(data.count, lang),
      name: student.name,
    }),
  };
}

export async function cancelPlanAction(_prev: FeeState, formData: FormData): Promise<FeeState> {
  await requireSuperAdmin();
  const lang = await getLang();

  const removed = await cancelPlan(Number(formData.get('plan_id') ?? 0));
  if (removed === null) return { error: translate(lang, 'fees.err_plan'), message: '' };

  refresh();
  return {
    error: '',
    message: translate(lang, 'fees.plan_cancelled', { count: toLocalDigits(removed, lang) }),
  };
}

export async function saveDiscountAction(_prev: FeeState, formData: FormData): Promise<FeeState> {
  const admin = await requireSuperAdmin();
  const lang = await getLang();

  const outcome = await saveDiscount(
    {
      id: Number(formData.get('id') ?? 0),
      studentId: Number(formData.get('student_id') ?? 0),
      type: text(formData, 'discount_type', 10),
      value: text(formData, 'value', 20),
      appliesTo: text(formData, 'applies_to', 20),
      reason: text(formData, 'reason', 255),
      startsOn: text(formData, 'starts_on', 10),
      endsOn: text(formData, 'ends_on', 10),
      isActive: formData.get('is_active') !== null,
    },
    admin.id
  );

  if (outcome.ok) refresh();
  return outcome.ok
    ? { error: '', message: translate(lang, outcome.message) }
    : { error: translate(lang, outcome.message), message: '' };
}

export async function toggleDiscountAction(_prev: FeeState, formData: FormData): Promise<FeeState> {
  await requireSuperAdmin();
  const lang = await getLang();

  const outcome = await toggleDiscount(Number(formData.get('id') ?? 0));
  if (outcome.ok) refresh();
  return outcome.ok
    ? { error: '', message: translate(lang, outcome.message) }
    : { error: translate(lang, outcome.message), message: '' };
}

export async function deleteDiscountAction(_prev: FeeState, formData: FormData): Promise<FeeState> {
  await requireSuperAdmin();
  const lang = await getLang();

  const outcome = await deleteDiscount(Number(formData.get('id') ?? 0));
  if (outcome.ok) refresh();
  return outcome.ok
    ? { error: '', message: translate(lang, outcome.message) }
    : { error: translate(lang, outcome.message), message: '' };
}

/**
 * The two fee settings: how many days between reminders, and the default due day.
 *
 * The due day is capped at 28 so that every month has one — a default of the 30th
 * would have no meaning in February.
 */
export async function saveFeeSettingsAction(
  _prev: FeeState,
  formData: FormData
): Promise<FeeState> {
  await requireSuperAdmin();
  const lang = await getLang();

  const gap = text(formData, 'gap_days', 3);
  const day = text(formData, 'due_day', 3);

  if (
    !/^\d+$/.test(gap) ||
    Number(gap) > 60 ||
    !/^\d+$/.test(day) ||
    Number(day) < 1 ||
    Number(day) > 28
  ) {
    return { error: translate(lang, 'fees.err_settings'), message: '' };
  }

  await saveSetting('fee_reminder_gap_days', String(Number(gap)));
  await saveSetting('fee_default_due_day', String(Number(day)));

  refresh();
  return { error: '', message: translate(lang, 'fees.settings_saved') };
}
