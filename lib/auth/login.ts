import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { throttleStatus, throttleHit, throttleClear } from '@/lib/security/throttle';
import { verifyPassword, hashPassword, needsRehash } from './password';
import { createSession } from './session';
import { issueRemember } from './remember';
import { normaliseBdPhone } from './phone';

/**
 * The four sign-in flows, each checking exactly what the PHP page checks:
 *
 *   student   student_login.username + password    → students (JOIN only, NO status filter)
 *   teacher   teachers.email + password_hash       → status must be 'active'
 *   guardian  guardians.phone + password           → status must be 'active'
 *   admin     admins.email + password_hash         → status must be 'active'
 *
 * The asymmetry is deliberate and comes from the original: student/login.php
 * does not test students.status at all, so a student whose admission row is
 * still 'pending' can sign in once an admin has created their login. Adding a
 * filter here would lock out real students the PHP app admits.
 *
 * Throttling matches includes/security.php: failures counted per identifier and
 * per IP in login_attempts, 5 / 25 in a 15-minute window.
 */

const WINDOW_MINUTES = 15;

/**
 * A bcrypt hash of a value nobody knows, from the original guardian login.
 * Verifying against it when no account matched keeps the response time the same
 * whether or not the identifier exists, so the form cannot be used to enumerate
 * who is registered.
 */
const DUMMY_HASH = '$2y$10$usesomesillystringfore7hnbRJHxXVLeakoG8K30oukPsA.ztMG';

export type LoginError = 'invalid' | 'locked' | 'throttled';

export type LoginResult =
  | { ok: true; mustChangePassword: boolean }
  | { ok: false; error: LoginError; minutes?: number };

export interface LoginOptions {
  remember?: boolean;
}

const throttled: LoginResult = { ok: false, error: 'throttled', minutes: WINDOW_MINUTES };
const invalid: LoginResult = { ok: false, error: 'invalid' };

/* ------------------------------------------------------------------ student */

export async function loginStudent(
  username: string,
  password: string,
  opts: LoginOptions = {}
): Promise<LoginResult> {
  // Capped like the other three: an unbounded identifier would be hashed and
  // sent to the database as-is.
  const id = username.trim().slice(0, 100);
  if (!id || !password) return invalid;
  if ((await throttleStatus('student_login', id)).locked) return throttled;

  // ORDER BY sl.id DESC LIMIT 1, as both login.php and student_auth.php do:
  // where an account was re-issued, the newest login row wins.
  const login = await prisma.studentLogin.findFirst({
    where: { username: id },
    orderBy: { id: 'desc' },
    select: {
      id: true,
      student_id: true,
      password: true,
      must_change_password: true,
      student: { select: { branch_id: true } },
    },
  });

  const ok = await verifyPassword(password, login?.password ?? DUMMY_HASH);
  if (!login || !ok) {
    await throttleHit('student_login', id);
    return invalid;
  }

  await throttleClear('student_login', id);
  if (needsRehash(login.password)) {
    await prisma.studentLogin.update({
      where: { id: login.id },
      data: { password: await hashPassword(password) },
    });
  }
  await prisma.studentLogin.update({ where: { id: login.id }, data: { last_login: new Date() } });

  await createSession({
    uid: login.student_id,
    role: 'student',
    branchId: login.student.branch_id,
    mustChangePassword: login.must_change_password,
  });
  // The remembered id is student_login.id here, not students.id — the original's
  // convention, which orbit_remember_load_account() depends on.
  if (opts.remember) await issueRemember('student', login.id);

  return { ok: true, mustChangePassword: login.must_change_password };
}

/* ------------------------------------------------------------------ teacher */

export async function loginTeacher(
  email: string,
  password: string,
  opts: LoginOptions = {}
): Promise<LoginResult> {
  const id = email.trim().slice(0, 255);
  if (!id || !password) return invalid;
  if ((await throttleStatus('teacher_login', id)).locked) return throttled;

  const teacher = await prisma.teacher.findFirst({
    where: { email: id },
    select: { id: true, password_hash: true, status: true },
  });

  const ok = await verifyPassword(password, teacher?.password_hash ?? DUMMY_HASH);
  if (!teacher || !ok) {
    await throttleHit('teacher_login', id);
    return invalid;
  }

  // The original clears the throttle on a correct password, then reports the
  // deactivation — a deactivated teacher is not a failed attempt.
  await throttleClear('teacher_login', id);
  if (teacher.status !== 'active') return { ok: false, error: 'locked' };

  if (needsRehash(teacher.password_hash)) {
    await prisma.teacher.update({
      where: { id: teacher.id },
      data: { password_hash: await hashPassword(password) },
    });
  }
  await prisma.teacher.update({ where: { id: teacher.id }, data: { last_login: new Date() } });

  await createSession({ uid: teacher.id, role: 'teacher' });
  if (opts.remember) await issueRemember('teacher', teacher.id);

  return { ok: true, mustChangePassword: false };
}

/* ----------------------------------------------------------------- guardian */

export async function loginGuardian(
  phone: string,
  password: string,
  opts: LoginOptions = {}
): Promise<LoginResult> {
  const raw = phone.trim();
  if (!raw || !password) return invalid;

  const normalised = normaliseBdPhone(raw);
  // The throttle key is the normalised number when it is valid, so 01712345678
  // and +8801712345678 count as attempts on the same account.
  const ident = normalised ?? raw.toLowerCase().slice(0, 40);
  if ((await throttleStatus('guardian_login', ident)).locked) return throttled;

  const guardian = normalised
    ? await prisma.guardian.findUnique({
        where: { phone: normalised },
        select: { id: true, password: true, status: true, must_change_password: true },
      })
    : null;

  const ok = await verifyPassword(password, guardian?.password ?? DUMMY_HASH);
  if (!guardian || !ok) {
    await throttleHit('guardian_login', ident);
    return invalid;
  }
  if (guardian.status !== 'active') {
    // The original counts this as a failed attempt (it falls through to
    // throttle_hit) and shows the same "invalid" message, so a caller cannot
    // learn that a number is registered but suspended.
    await throttleHit('guardian_login', ident);
    return invalid;
  }

  await throttleClear('guardian_login', ident);
  if (needsRehash(guardian.password)) {
    await prisma.guardian.update({
      where: { id: guardian.id },
      data: { password: await hashPassword(password) },
    });
  }
  await prisma.guardian.update({ where: { id: guardian.id }, data: { last_login: new Date() } });

  await createSession({
    uid: guardian.id,
    role: 'guardian',
    mustChangePassword: guardian.must_change_password,
  });
  if (opts.remember) await issueRemember('guardian', guardian.id);

  return { ok: true, mustChangePassword: guardian.must_change_password };
}

/* -------------------------------------------------------------------- admin */

export async function loginAdmin(
  email: string,
  password: string,
  opts: LoginOptions = {}
): Promise<LoginResult> {
  const id = email.trim().slice(0, 255);
  if (!id || !password) return invalid;
  if ((await throttleStatus('admin_login', id)).locked) return throttled;

  const admin = await prisma.admin.findFirst({
    where: { email: id },
    select: { id: true, password_hash: true, status: true, role: true, branch_id: true },
  });

  const ok = await verifyPassword(password, admin?.password_hash ?? DUMMY_HASH);
  if (!admin || !ok) {
    await throttleHit('admin_login', id);
    return invalid;
  }

  await throttleClear('admin_login', id);
  // Locking is checked after the password, so the message cannot be used to
  // discover which addresses exist. A branch admin with no branch assigned is
  // treated as locked — otherwise the branch filter matches nothing and they
  // would see every branch, which orbit_admin_account() guards against too.
  if (admin.status !== 'active' || (admin.role === 'branch_admin' && !admin.branch_id)) {
    return { ok: false, error: 'locked' };
  }

  if (needsRehash(admin.password_hash)) {
    await prisma.admin.update({
      where: { id: admin.id },
      data: { password_hash: await hashPassword(password) },
    });
  }
  await prisma.admin.update({ where: { id: admin.id }, data: { last_login: new Date() } });

  await createSession({
    uid: admin.id,
    role: 'admin',
    adminRole: admin.role,
    branchId: admin.branch_id,
  });
  if (opts.remember) await issueRemember('admin', admin.id);

  return { ok: true, mustChangePassword: false };
}
