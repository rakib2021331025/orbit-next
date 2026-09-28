'use server';

import { getTranslator } from '@/lib/i18n';
import { completePasswordReset } from '@/lib/auth/reset';

export interface ResetState {
  done: boolean;
  error: string;
}


/**
 * Sets a new password from a reset link.
 *
 * The token travels in a hidden field rather than staying in the URL for the
 * POST, and the two typed passwords are compared here — not only in the browser,
 * where the check is a convenience that can be skipped.
 */
export async function resetPasswordAction(
  _prev: ResetState,
  formData: FormData
): Promise<ResetState> {
  const { t } = await getTranslator();

  const token = String(formData.get('token') ?? '');
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  if (password !== confirm) {
    return { done: false, error: t('auth.reset.mismatch') };
  }

  const outcome = await completePasswordReset(token, password);
  return outcome.ok ? { done: true, error: '' } : { done: false, error: outcome.error };
}
