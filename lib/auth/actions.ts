'use server';

import { redirect } from 'next/navigation';
import { loginStudent, loginTeacher, loginGuardian, loginAdmin, type LoginResult } from './login';
import { destroySession, readSession } from './session';
import { forgetUser, forgetCurrentRemember } from './remember';
import { getTranslator } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';

/**
 * Server actions for signing in and out.
 *
 * Next.js rejects a server action whose Origin does not match the host, so these
 * are CSRF-protected without a token in the form — the protection the PHP forms
 * got from csrf_verify().
 *
 * Every message comes from the translation catalogue, with the same keys the PHP
 * pages use, so the two apps say exactly the same thing in both languages.
 */

export interface LoginFormState {
  error: string;
  /** Echoed back so a failed attempt does not clear the field they typed. */
  identifier?: string;
}

interface MessageKeys {
  required: string;
  invalid: string;
  failed: string;
  /** Shown when the password was right but the account is not usable. */
  locked: string;
}

const KEYS: Record<'student' | 'teacher' | 'guardian' | 'admin', MessageKeys> = {
  student: {
    required: 'student.login.required',
    invalid: 'student.login.invalid',
    failed: 'student.login.failed',
    locked: 'student.login.invalid',
  },
  teacher: {
    required: 'auth.required',
    invalid: 'auth.invalid',
    failed: 'auth.failed',
    locked: 'auth.teacher.deactivated',
  },
  guardian: {
    required: 'guardian.login.required',
    invalid: 'guardian.login.invalid',
    failed: 'guardian.login.failed',
    locked: 'guardian.login.invalid',
  },
  admin: {
    required: 'auth.required',
    invalid: 'auth.invalid',
    failed: 'auth.failed',
    locked: 'branch.locked_body',
  },
};

async function messageFor(
  role: keyof typeof KEYS,
  result: Extract<LoginResult, { ok: false }>
): Promise<string> {
  const { t, digits } = await getTranslator();
  if (result.error === 'throttled') {
    return t('error.too_many_attempts', { minutes: digits(result.minutes ?? 15) });
  }
  return t(KEYS[role][result.error === 'locked' ? 'locked' : 'invalid']);
}

/**
 * Where to go after signing in.
 *
 * Only a path inside the portal is honoured. Anything else — another portal, a
 * protocol-relative `//evil.test`, a full URL — falls back to the dashboard.
 * Without this check the `next` parameter would be an open redirect, and a
 * phishing link could carry a user from a genuine Orbit login to another site.
 */
function safeNext(raw: FormDataEntryValue | null, prefix: string, fallback: string): string {
  const value = typeof raw === 'string' ? raw : '';
  if (!value.startsWith(`${prefix}/`) || value.startsWith(`${prefix}//`)) return fallback;
  if (value.includes('\\') || value.includes('://')) return fallback;
  return value;
}

/** The shared shape of all four sign-in actions. */
async function runLogin(
  role: keyof typeof KEYS,
  field: string,
  formData: FormData,
  attempt: (id: string, password: string, remember: boolean) => Promise<LoginResult>,
  onSuccess: (result: Extract<LoginResult, { ok: true }>) => string
): Promise<LoginFormState> {
  const identifier = String(formData.get(field) ?? '');
  const password = String(formData.get('password') ?? '');
  const { t } = await getTranslator();

  if (!identifier.trim() || !password) {
    return { error: t(KEYS[role].required), identifier };
  }

  let result: LoginResult;
  try {
    result = await attempt(identifier, password, formData.get('remember') === '1');
  } catch {
    // A database or provider failure, not a wrong password: say so rather than
    // telling a user with correct credentials that they are wrong.
    return { error: t(KEYS[role].failed), identifier };
  }

  if (!result.ok) return { error: await messageFor(role, result), identifier };

  redirect(onSuccess(result));
}

/* ------------------------------------------------------------------ sign in */

export async function studentLoginAction(
  _prev: LoginFormState,
  formData: FormData
): Promise<LoginFormState> {
  return runLogin(
    'student',
    'username',
    formData,
    (id, password, remember) => loginStudent(id, password, { remember }),
    // The temporary password issued at approval must be replaced before anything
    // else is reachable, as student_auth.php enforces on every page.
    (result) =>
      result.mustChangePassword
        ? '/student/settings?first=1'
        : safeNext(formData.get('next'), '/student', '/student')
  );
}

export async function teacherLoginAction(
  _prev: LoginFormState,
  formData: FormData
): Promise<LoginFormState> {
  return runLogin(
    'teacher',
    'email',
    formData,
    (id, password, remember) => loginTeacher(id, password, { remember }),
    () => safeNext(formData.get('next'), '/teacher', '/teacher')
  );
}

export async function guardianLoginAction(
  _prev: LoginFormState,
  formData: FormData
): Promise<LoginFormState> {
  return runLogin(
    'guardian',
    'phone',
    formData,
    (id, password, remember) => loginGuardian(id, password, { remember }),
    (result) =>
      result.mustChangePassword
        ? '/guardian/settings?first=1'
        : safeNext(formData.get('next'), '/guardian', '/guardian')
  );
}

export async function adminLoginAction(
  _prev: LoginFormState,
  formData: FormData
): Promise<LoginFormState> {
  return runLogin(
    'admin',
    'email',
    formData,
    (id, password, remember) => loginAdmin(id, password, { remember }),
    () => safeNext(formData.get('next'), '/admin', '/admin')
  );
}

/* ----------------------------------------------------------------- sign out */

/**
 * Signs out of this device.
 *
 * orbit_remember_logout() deletes the token belonging to THIS browser's cookie,
 * not every token the account has — so signing out on a phone leaves a desktop
 * still remembered. That is the behaviour users of the PHP app have, and it is
 * kept. Dropping all tokens is reserved for the case where the original does it:
 * a password reset, whose own message promises it ("সব ডিভাইস থেকে আপনাকে লগ আউট
 * করা হয়েছে").
 */
export async function logoutAction(): Promise<void> {
  const session = await readSession();

  await forgetCurrentRemember();
  await destroySession();

  redirect(session?.role ? `/${session.role}/login` : '/');
}

/** Revokes every remembered device. Called on a password change or reset. */
export async function logoutEverywhere(
  role: 'student' | 'teacher' | 'guardian' | 'admin',
  uid: number
): Promise<void> {
  if (role === 'student') {
    // Tokens are keyed by student_login.id, not students.id.
    const logins = await prisma.studentLogin.findMany({
      where: { student_id: uid },
      select: { id: true },
    });
    await Promise.all(logins.map((l) => forgetUser('student', l.id)));
  } else {
    await forgetUser(role, uid);
  }
  await forgetCurrentRemember();
}
