'use server';

import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { requireStudent } from '@/lib/auth/guards';
import { getTranslator } from '@/lib/i18n';
import { verifyPassword, hashPassword } from '@/lib/auth/password';
import { throttleStatus, throttleHit, throttleClear } from '@/lib/security/throttle';
import { forgetUser } from '@/lib/auth/remember';
import { createSession } from '@/lib/auth/session';

export interface PasswordState {
  error: string;
  done: boolean;
}


/**
 * A student changes their own password, from student/settings.php.
 *
 * Five rules from the original, each of which matters:
 *
 *   1. **The current password is required.** Without it, an unlocked laptop is a
 *      permanent account takeover.
 *   2. **Throttled** under `student_password`, so the current-password field
 *      cannot be brute-forced from inside a session.
 *   3. **8–72 characters** with a letter and a digit. The upper bound is bcrypt's
 *      limit: anything longer is silently truncated, so a 100-character password
 *      would not be the password the user thinks it is.
 *   4. **`must_change_password` is cleared**, which is what releases the rest of
 *      the portal.
 *   5. **Every remembered device is revoked.** A device kept signed in with the
 *      OLD password must not stay signed in — that is half the point of changing
 *      it. This session continues under a fresh token.
 */
export async function changePasswordAction(
  _prev: PasswordState,
  formData: FormData
): Promise<PasswordState> {
  const student = await requireStudent();
  const { t, digits } = await getTranslator();

  const current = String(formData.get('current_password') ?? '');
  const next = String(formData.get('new_password') ?? '');
  const confirm = String(formData.get('confirm_password') ?? '');
  const first = String(formData.get('first') ?? '') === '1';

  const key = `student:${student.id}`;
  const throttle = await throttleStatus('student_password', key);
  if (throttle.locked) {
    return { done: false, error: t('error.too_many_attempts', { minutes: digits(throttle.minutes) }) };
  }

  if (current === '' || next === '' || confirm === '') {
    return { done: false, error: t('student.settings.err_required') };
  }
  if (next !== confirm) {
    return { done: false, error: t('student.settings.err_mismatch') };
  }
  // 72 bytes is bcrypt's limit; a longer password would be silently cut.
  if (next.length < 8 || next.length > 72 || !/\p{L}/u.test(next) || !/\d/.test(next)) {
    return { done: false, error: t('student.settings.err_weak') };
  }
  if (current === next) {
    return { done: false, error: t('student.settings.err_same') };
  }

  try {
    const login = await prisma.studentLogin.findUnique({
      where: { id: student.loginId },
      select: { password: true },
    });

    if (!login || !(await verifyPassword(current, login.password))) {
      await throttleHit('student_password', key);
      return { done: false, error: t('student.settings.err_current') };
    }

    await prisma.studentLogin.update({
      where: { id: student.loginId },
      data: { password: await hashPassword(next), must_change_password: false },
    });
    await throttleClear('student_password', key);

    // Remembered devices held the old password; they lose access.
    await forgetUser('student', student.loginId);

    // A fresh session token, with the must-change flag cleared.
    await createSession({
      uid: student.id,
      role: 'student',
      branchId: student.branch_id,
      mustChangePassword: false,
    });
  } catch {
    return { done: false, error: t('error.generic') };
  }

  // The first-login case lands on the dashboard, which was blocked until now.
  redirect(first ? '/student' : '/student/settings?changed=1');
}
