'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/guards';
import { getLang, translate } from '@/lib/i18n';
import { formatMoney } from '@/lib/i18n/format';
import {
  addTrackedPayment,
  editTrackedPayment,
  deleteTrackedPayment,
  type PaymentOutcome,
  type TrackingPaymentInput,
} from '@/lib/payments/tracking';

/**
 * Fee register actions, from the POST half of admin/payment_tracking.php.
 *
 * Any admin may record a payment — this is the front desk — but the branch
 * guard inside the library still refuses a student or a payment from another
 * branch, so a branch-locked admin cannot take money against somebody else's
 * roll by editing an id in the form.
 */

export interface TrackingState {
  error: string;
  message: string;
}

function refresh(studentId: number): void {
  revalidatePath('/admin/payment-tracking');
  revalidatePath('/admin/fees');
  revalidatePath('/admin');
  if (studentId > 0) revalidatePath(`/admin/students/${studentId}`);
  revalidatePath('/student/payments');
}

/** Turns a library outcome into the sentence shown on screen. */
async function present(outcome: PaymentOutcome): Promise<TrackingState> {
  const lang = await getLang();
  const params = { ...(outcome.params ?? {}) };
  // Money is formatted in the reader's language and script, not as a raw number.
  if (params.amount !== undefined) params.amount = formatMoney(Number(params.amount), lang);

  const text = translate(lang, outcome.message, params);
  return outcome.ok ? { error: '', message: text } : { error: text, message: '' };
}

function readForm(formData: FormData): TrackingPaymentInput {
  return {
    paymentId: Number(formData.get('payment_id') ?? 0),
    studentId: Number(formData.get('student_id') ?? 0),
    amount: String(formData.get('amount') ?? ''),
    dueAmount: String(formData.get('due_amount') ?? ''),
    month: String(formData.get('payment_month') ?? ''),
    method: String(formData.get('payment_method') ?? 'Cash'),
    notes: String(formData.get('notes') ?? ''),
    dueDate: String(formData.get('due_date') ?? ''),
    // The field is only rendered when editing, and its absence means "leave the
    // due date as it is" rather than "clear it".
    hasDueDate: formData.has('due_date'),
  };
}

export async function savePaymentAction(
  _prev: TrackingState,
  formData: FormData
): Promise<TrackingState> {
  const admin = await requireAdmin();
  const input = readForm(formData);

  const outcome =
    input.paymentId > 0
      ? await editTrackedPayment(input)
      : await addTrackedPayment(input, admin.id);

  if (outcome.ok) refresh(input.studentId);
  return present(outcome);
}

export async function deletePaymentAction(
  _prev: TrackingState,
  formData: FormData
): Promise<TrackingState> {
  await requireAdmin();
  const lang = await getLang();

  const paymentId = Number(formData.get('payment_id') ?? 0);
  const outcome = await deleteTrackedPayment(paymentId, lang);

  if (outcome.ok) refresh(Number(formData.get('student_id') ?? 0));
  return present(outcome);
}
