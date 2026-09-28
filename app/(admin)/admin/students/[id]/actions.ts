'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/guards';
import { getLang, translate } from '@/lib/i18n';
import { addPayment, markPaymentPaid } from '@/lib/payments/manage';

/**
 * The payment actions on a student's profile, from admin/payment.php.
 *
 * The original redirects back with `?msg=<fixed English text>` and translates
 * only the handful of texts it knows, so the parameter cannot inject anything.
 * Here the outcome comes back in the action's own state, so there is no
 * round-trip through the URL to sanitise at all — the same safety, with the
 * translation happening once, here.
 */

export interface PaymentState {
  error: string;
  message: string;
}


function text(formData: FormData, field: string): string {
  return String(formData.get(field) ?? '');
}

async function present(outcome: { ok: boolean; message: string }): Promise<PaymentState> {
  const message = translate(await getLang(), outcome.message);
  return outcome.ok ? { error: '', message } : { error: message, message: '' };
}

export async function addPaymentAction(
  _prev: PaymentState,
  formData: FormData
): Promise<PaymentState> {
  const admin = await requireAdmin();
  const studentId = Number(formData.get('student_id') ?? 0);

  const outcome = await addPayment(
    {
      studentId,
      amount: text(formData, 'amount'),
      due_amount: text(formData, 'due_amount'),
      status: text(formData, 'status'),
      month: text(formData, 'month'),
      notes: text(formData, 'notes'),
      payment_method: text(formData, 'payment_method'),
      fee_type: text(formData, 'fee_type'),
      due_date: text(formData, 'due_date'),
    },
    admin.id
  );

  revalidatePath(`/admin/students/${studentId}`);
  revalidatePath('/admin/payment-tracking');
  revalidatePath('/admin/fees');

  return present(outcome);
}

export async function markPaidAction(
  _prev: PaymentState,
  formData: FormData
): Promise<PaymentState> {
  await requireAdmin();

  const studentId = Number(formData.get('student_id') ?? 0);
  const outcome = await markPaymentPaid(Number(formData.get('payment_id') ?? 0), studentId);

  revalidatePath(`/admin/students/${studentId}`);
  revalidatePath('/admin/payment-tracking');
  revalidatePath('/admin/fees');

  return present(outcome);
}
