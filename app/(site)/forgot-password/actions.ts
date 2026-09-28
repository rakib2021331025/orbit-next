'use server';

import { getTranslator } from '@/lib/i18n';
import {
  findAccountByEmail,
  requestPasswordReset,
  cleanupPasswordResets,
} from '@/lib/auth/reset';
import { sendMail } from '@/lib/email/send';
import { throttleStatus, throttleHit, clientIp } from '@/lib/security/throttle';
import { instituteName } from '@/lib/settings';
import { emptyForgotState } from './state';

export interface ForgotState {
  sent: boolean;
  error: string;
  email: string;
}


/**
 * Requests a password reset link.
 *
 * **The answer is the same whether or not the address exists.** Reporting "no
 * such account" would turn this form into a way to test which email addresses
 * belong to students, teachers and admins — which is exactly what an attacker
 * wants before trying passwords. The page says "if an account exists at that
 * address, we have sent a link" either way, and the rate limit is silent too.
 *
 * Two limits. The per-account one (5 an hour) lives in requestPasswordReset(),
 * as in includes/password_reset.php. The per-IP one is new here: without it a
 * script could walk a list of addresses, five mails each, and use the centre's
 * mail account to flood inboxes. Twenty requests an hour from one address is
 * far beyond what a person forgetting a password does.
 */

const IP_PER_HOUR = 20;
export async function forgotPasswordAction(
  _prev: ForgotState,
  formData: FormData
): Promise<ForgotState> {
  const { t, digits } = await getTranslator();
  const email = String(formData.get('email') ?? '').trim().slice(0, 255);

  if (email === '') {
    return { ...emptyForgotState, error: t('auth.forgot.err_required') };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { ...emptyForgotState, email, error: t('auth.forgot.err_email') };
  }

  // Per-IP, keyed in its own scope so other forms' attempts do not count here.
  // Silent, like the per-account limit: the answer below is the same either way.
  const ip = await clientIp();
  const ipLock = await throttleStatus('forgot_password', ip, IP_PER_HOUR, Number.MAX_SAFE_INTEGER, 60);
  if (ipLock.locked) return { sent: true, error: '', email };
  await throttleHit('forgot_password', ip);

  // Housekeeping: no cron on a serverless platform either.
  await cleanupPasswordResets();

  const account = await findAccountByEmail(email);

  if (account) {
    const token = await requestPasswordReset(account);
    if (token) {
      const base = process.env.NEXT_PUBLIC_APP_URL ?? '';
      const link = `${base}/reset-password?token=${token}`;
      const site = await instituteName();

      // A send failure is deliberately not reported: it would reveal that the
      // address exists. The attempt is recorded in email_logs either way.
      await sendMail({
        to: account.email,
        toName: account.name,
        subject: `${site} — ${t('auth.reset.title')}`,
        text: [
          `${account.name},`,
          '',
          t('auth.forgot.sent_body', { email: account.email }),
          '',
          link,
          '',
          t('auth.forgot.expiry', { minutes: digits(60) }),
        ].join('\n'),
        template: 'password_reset',
        relatedType: account.user_type,
        relatedId: account.user_id,
      });
    }
  }

  return { sent: true, error: '', email };
}
