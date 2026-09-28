'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin, requireRecordBranch } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/prisma';
import { getLang, translate } from '@/lib/i18n';
import { hashPassword } from '@/lib/auth/password';
import { passwordStrengthError } from '@/lib/auth/reset';

/**
 * Student portal logins, from admin/student_login_management.php.
 *
 * **The username defaults to the Student ID**, which is what a student knows and
 * what is printed on their card. It may be changed, but never to something with
 * a space in it: a username that cannot be typed reliably down a phone line is
 * not a username.
 *
 * Resetting a password or deleting a login drops that account's remembered
 * devices, so an old phone cannot keep the session alive.
 */

export interface LoginState {
  error: string;
  message: string;
}

function refresh(): void {
  revalidatePath('/admin/student-logins');
  revalidatePath('/admin/students');
}

/** Remembered devices belong to the login row, not to the student. */
async function forgetTokens(loginId: number): Promise<void> {
  await prisma.authRememberToken
    .deleteMany({ where: { user_type: 'student', user_id: loginId } })
    .catch(() => null);
}

export async function createLoginAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  await requireAdmin();
  const lang = await getLang();

  const studentId = Number(formData.get('student_id') ?? 0);
  const student = await prisma.student
    .findFirst({
      where: { id: studentId, status: 'approved' },
      select: { id: true, name: true, student_id_no: true },
    })
    .catch(() => null);
  if (!student) return { error: translate(lang, 'alogin.err_student'), message: '' };

  await requireRecordBranch('students', studentId, false);

  const typed = String(formData.get('username') ?? '').trim();
  const username = typed !== '' ? typed : (student.student_id_no ?? '').trim();

  if (username === '' || username.length > 100 || /\s/u.test(username)) {
    return { error: translate(lang, 'alogin.err_username'), message: '' };
  }

  const password = String(formData.get('password') ?? '');
  const weak = await passwordStrengthError(password);
  if (weak !== null) return { error: weak, message: '' };

  const [hasLogin, taken] = await Promise.all([
    prisma.studentLogin.findFirst({ where: { student_id: studentId }, select: { id: true } }),
    prisma.studentLogin.findFirst({ where: { username }, select: { id: true } }),
  ]);
  if (hasLogin) return { error: translate(lang, 'alogin.err_has_login'), message: '' };
  if (taken) return { error: translate(lang, 'alogin.err_username_taken'), message: '' };

  try {
    await prisma.studentLogin.create({
      data: {
        student_id: studentId,
        username,
        password: await hashPassword(password),
        // An admin typed this password, so the student may keep it: unlike the
        // approval flow's generated one, it was chosen deliberately here.
        must_change_password: false,
      },
    });
  } catch {
    return { error: translate(lang, 'error.generic'), message: '' };
  }

  refresh();
  return {
    error: '',
    message: translate(lang, 'alogin.created', { name: student.name, username }),
  };
}

export async function resetLoginPasswordAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  await requireAdmin();
  const lang = await getLang();

  const loginId = Number(formData.get('login_id') ?? 0);
  const login = await prisma.studentLogin
    .findUnique({
      where: { id: loginId },
      select: { id: true, student_id: true, student: { select: { name: true } } },
    })
    .catch(() => null);
  if (!login) return { error: translate(lang, 'alogin.not_found'), message: '' };

  await requireRecordBranch('students', login.student_id, false);

  const password = String(formData.get('new_password') ?? '');
  const weak = await passwordStrengthError(password);
  if (weak !== null) return { error: weak, message: '' };

  try {
    await prisma.studentLogin.update({
      where: { id: loginId },
      data: { password: await hashPassword(password) },
    });
  } catch {
    return { error: translate(lang, 'error.generic'), message: '' };
  }
  await forgetTokens(loginId);

  refresh();
  return {
    error: '',
    message: translate(lang, 'alogin.reset_done', { name: login.student.name }),
  };
}

export async function deleteLoginAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  await requireAdmin();
  const lang = await getLang();

  const loginId = Number(formData.get('login_id') ?? 0);
  const login = await prisma.studentLogin
    .findUnique({
      where: { id: loginId },
      select: { id: true, username: true, student_id: true, student: { select: { name: true } } },
    })
    .catch(() => null);
  if (!login) return { error: translate(lang, 'alogin.not_found'), message: '' };

  await requireRecordBranch('students', login.student_id, false);

  try {
    // Only the login: the student's record, results and payments stay.
    await prisma.studentLogin.delete({ where: { id: loginId } });
  } catch {
    return { error: translate(lang, 'error.generic'), message: '' };
  }
  await forgetTokens(loginId);

  refresh();
  return {
    error: '',
    message: translate(lang, 'alogin.deleted', {
      name: login.student.name,
      username: login.username,
    }),
  };
}
