import 'server-only';
import { randomInt, randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { settingNumber } from '@/lib/settings';
import { translate, hasTranslation, type Lang } from '@/lib/i18n';
import { monthLabel, toLocalDigits, formatDate } from '@/lib/i18n/format';

/**
 * Money primitives, from includes/fee_lib.php.
 *
 * One definition of "due" runs through the whole app and lives here: **a paid
 * charge still owes its `due_amount`, an unpaid one owes its whole `amount`.**
 * The dashboard, the student portal, the guardian portal and the fee screens all
 * ask `rowDue()` rather than each deciding for itself — when they disagreed,
 * students saw one balance and the office saw another.
 */

export const FEE_TYPES = ['monthly', 'installment', 'admission', 'other'] as const;
export type FeeType = (typeof FEE_TYPES)[number];

/** The four methods the forms offer, in their stored spelling. */
export const FEE_METHODS = ['Cash', 'bKash', 'Nagad', 'Bank'] as const;

export function isFeeType(value: unknown): value is FeeType {
  return typeof value === 'string' && (FEE_TYPES as readonly string[]).includes(value);
}

/** The stored spelling of a posted method, or null when it is not one of ours. */
export function feeMethod(raw: unknown): string | null {
  const value = String(raw ?? '').trim();
  const method = FEE_METHODS.find((m) => m.toLowerCase() === (value === '' ? 'cash' : value.toLowerCase()));
  return method ?? null;
}

export function feeMethodLabel(method: unknown, lang: Lang): string {
  const key = `apay.method_${String(method ?? '').toLowerCase()}`;
  return hasTranslation(key) ? translate(lang, key) : String(method ?? '');
}

const BANGLA_DIGITS: Record<string, string> = {
  '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
  '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9',
};

/** Turns Bangla digits into ASCII, so an amount typed in Bangla is accepted. */
function asciiDigits(raw: string): string {
  return raw.replace(/[০-৯]/g, (digit) => BANGLA_DIGITS[digit] ?? digit);
}

/**
 * A positive amount with at most two decimals, or null.
 *
 * Deliberately strict: signs, exponents and thousands separators are all
 * rejected rather than coerced. `Number('1e3')` is 1000 and `Number('-5')` is
 * -5, and either one silently entered as a fee would be a real money bug.
 */
export function feeAmount(raw: unknown, max = 99999999.99): number | null {
  const value = asciiDigits(String(raw ?? '')).replace(/,/g, '').trim();
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(value)) return null;
  const amount = Math.round(Number(value) * 100) / 100;
  return amount > 0 && amount <= max ? amount : null;
}

/** Like `feeAmount` but zero is a legitimate answer (a nil outstanding balance). */
export function feeAmountOrZero(raw: unknown, max = 9999999999): number | null {
  const value = asciiDigits(String(raw ?? '')).replace(/,/g, '').trim();
  if (value === '') return 0;
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(value)) return null;
  const amount = Math.round(Number(value) * 100) / 100;
  return amount <= max ? amount : null;
}

/** 'YYYY-MM' or null. */
export function feeMonth(raw: unknown): string | null {
  const value = String(raw ?? '').trim();
  return /^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(value) ? value : null;
}

/** 'YYYY-MM-DD' of a real calendar date, or null. */
export function feeDate(raw: unknown): string | null {
  const value = String(raw ?? '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const probe = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  // 31 February rolls over to March, and a rolled-over date is not the date
  // that was typed.
  if (
    probe.getUTCFullYear() !== Number(match[1]) ||
    probe.getUTCMonth() !== Number(match[2]) - 1 ||
    probe.getUTCDate() !== Number(match[3])
  ) {
    return null;
  }
  return value;
}

/** Days in a 'YYYY-MM'. */
function daysInMonth(month: string): number {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m, 0)).getUTCDate();
}

export async function feeDueDay(): Promise<number> {
  const day = await settingNumber('fee_default_due_day', 10);
  return Math.max(1, Math.min(31, Math.floor(day)));
}

export async function feeGapDays(): Promise<number> {
  const days = await settingNumber('fee_reminder_gap_days', 3);
  return Math.max(0, Math.min(60, Math.floor(days)));
}

/**
 * When a month's fee falls due: that month plus the institute's due day,
 * clamped to the month's length so February never produces the 31st.
 */
export async function defaultDueDate(month: unknown): Promise<string> {
  const target = feeMonth(month) ?? new Date().toISOString().slice(0, 7);
  const day = Math.min(await feeDueDay(), daysInMonth(target));
  return `${target}-${String(day).padStart(2, '0')}`;
}

/** Adds whole months, keeping the day where the month allows it. */
export function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const total = year * 12 + (month - 1) + months;
  const y2 = Math.floor(total / 12);
  const m2 = (total % 12) + 1;
  const d2 = Math.min(day, daysInMonth(`${y2}-${String(m2).padStart(2, '0')}`));
  return `${String(y2).padStart(4, '0')}-${String(m2).padStart(2, '0')}-${String(d2).padStart(2, '0')}`;
}

/** What one charge still owes. The single definition of "due". */
export function rowDue(payment: {
  payment_status: string | null;
  amount: unknown;
  due_amount: unknown;
}): number {
  return payment.payment_status === 'paid'
    ? Math.max(0, Number(payment.due_amount ?? 0))
    : Number(payment.amount ?? 0);
}

/** paid | partial | unpaid — what the badge on a row says. */
export function rowState(payment: {
  payment_status: string | null;
  due_amount: unknown;
}): 'paid' | 'partial' | 'unpaid' {
  if (payment.payment_status !== 'paid') return 'unpaid';
  return Number(payment.due_amount ?? 0) > 0 ? 'partial' : 'paid';
}

export function feeTypeLabel(type: unknown, lang: Lang): string {
  return translate(lang, `fees.type_${isFeeType(type) ? type : 'other'}`);
}

/**
 * What a charge is for, in the reader's language: "October 2026",
 * "Course fee — Instalment 2/4", "Admission fee", or the stored free text.
 */
export function feeLabel(
  payment: {
    fee_type?: string | null;
    installment_no?: number | null;
    payment_month?: string | null;
    plan_title?: string | null;
    plan_installments?: number | null;
  },
  lang: Lang,
  withTitle = true
): string {
  if (payment.fee_type === 'installment' && payment.installment_no) {
    const count = payment.plan_installments ?? 0;
    const label =
      count > 0
        ? translate(lang, 'fees.label_installment', {
            no: toLocalDigits(payment.installment_no, lang),
            total: toLocalDigits(count, lang),
          })
        : translate(lang, 'fees.label_installment_no', {
            no: toLocalDigits(payment.installment_no, lang),
          });
    const title = (payment.plan_title ?? '').trim();
    return withTitle && title !== '' ? `${title} — ${label}` : label;
  }

  const forWhat = (payment.payment_month ?? '').trim();
  if (forWhat.toLowerCase() === 'admission' || (payment.fee_type === 'admission' && forWhat === '')) {
    return translate(lang, 'student.pay.admission');
  }
  if (/^\d{4}-\d{2}$/.test(forWhat)) return monthLabel(forWhat, lang);

  // Free text that still names a month and year, e.g. "October 2026".
  if (/\b\d{4}\b/.test(forWhat)) {
    const parsed = new Date(`1 ${forWhat}`);
    if (!Number.isNaN(parsed.getTime())) return formatDate(parsed, 'F Y', lang);
  }
  return forWhat;
}

/**
 * `REC-<year>-<5 digits>` that no other payment uses.
 *
 * Random rather than sequential on purpose: a receipt number is handed to a
 * student, and a sequential one would tell them how much money the institute
 * takes. Ten tries, then a hex tail that cannot realistically collide.
 */
export async function receiptNumber(): Promise<string> {
  const year = new Date().getFullYear();

  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = `REC-${year}-${String(randomInt(1, 100000)).padStart(5, '0')}`;
    const taken = await prisma.payment
      .findFirst({ where: { receipt_number: candidate }, select: { id: true } })
      .catch(() => null);
    if (!taken) return candidate;
  }
  return `REC-${year}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

/**
 * Marks an instalment plan completed once nothing on it is due any more.
 *
 * Called after every change to a payment that belongs to a plan. A plan that
 * stays "active" with nothing owing clutters the fee screen and misreports how
 * many students are still paying by instalments.
 */
export async function refreshPlan(planId: number | null | undefined): Promise<void> {
  if (!planId || planId <= 0) return;

  try {
    const rows = await prisma.payment.findMany({
      where: { installment_plan_id: planId },
      select: { payment_status: true, amount: true, due_amount: true },
    });
    if (rows.length === 0) return;

    const due = rows.reduce((sum, row) => sum + rowDue(row), 0);
    if (due > 0) return;

    await prisma.installmentPlan.updateMany({
      where: { id: planId, status: 'active' },
      data: { status: 'completed' },
    });
  } catch {
    // A stale plan status must not fail the payment that was just recorded.
  }
}
