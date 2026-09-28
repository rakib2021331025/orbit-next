'use server';

import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { requireGuardian } from '@/lib/auth/guards';
import { getTranslator } from '@/lib/i18n';
import { verifyPassword, hashPassword } from '@/lib/auth/password';
import { throttleStatus, throttleHit, throttleClear } from '@/lib/security/throttle';
import { forgetUser } from '@/lib/auth/remember';
import { createSession } from '@/lib/auth/session';

export interface PasswordState {
  error: string;
}

/** orbit_password_strength_error()'s list, compared case-insensitively. */
const TOO_COMMON = ['password', '12345678', 'password1', 'admin123', 'qwerty123', 'orbit123'];

/**
 * A guardian changes their own password, from guardian/settings.php.
 *
 * The same rules as the student's: the current (or temporary) password is
 * required and throttled under `guardian_password`; 8–72 characters with a
 * letter and a digit (72 is bcrypt's limit — longer would be silently cut) and
 * not one of the common ones; `must_change_password` is cleared, which unlocks
 * the portal; and every remembered device is signed out, because a device kept
 * signed in with the OLD password must not stay signed in.
 */
export async function changeGuardianPasswordAction(
  _prev: PasswordState,
  formData: FormData
): Promise<PasswordState> {
  const guardian = await requireGuardian();
  const { t, digits } = await getTranslator();

  const current = String(formData.get('current_password') ?? '');
  const next = String(formData.get('new_password') ?? '');
  const confirm = String(formData.get('confirm_password') ?? '');

  const key = `guardian:${guardian.id}`;
  const throttle = await throttleStatus('guardian_password', key);
  if (throttle.locked) {
    return { error: t('error.too_many_attempts', { minutes: digits(throttle.minutes) }) };
  }

  if (current === '' || next === '' || confirm === '') return { error: t('guardian.settings.err_required') };
  if (next !== confirm) return { error: t('guardian.settings.err_mismatch') };
  if (
    next.length < 8 ||
    Buffer.byteLength(next, 'utf8') > 72 ||
    !/[A-Za-z]/.test(next) ||
    !/\d/.test(next) ||
    TOO_COMMON.includes(next.toLowerCase())
  ) {
    return { error: t('guardian.settings.err_weak') };
  }
  if (current === next) return { error: t('guardian.settings.err_same') };

  try {
    const row = await prisma.guardian.findUnique({ where: { id: guardian.id }, select: { password: true } });
    if (!row || !(await verifyPassword(current, row.password))) {
      await throttleHit('guardian_password', key);
      return { error: t('guardian.settings.err_current') };
    }

    await prisma.guardian.update({
      where: { id: guardian.id },
      data: { password: await hashPassword(next), must_change_password: false },
    });
    await throttleClear('guardian_password', key);

    await forgetUser('guardian', guardian.id);
    await createSession({ uid: guardian.id, role: 'guardian', mustChangePassword: false });
  } catch {
    return { error: t('error.generic') };
  }

  // The first-login case lands on the dashboard, which was blocked until now.
  redirect(guardian.mustChangePassword ? '/guardian' : '/guardian/settings?changed=1');
}
