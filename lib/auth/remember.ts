import 'server-only';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db/prisma';
import { createSession, type Role } from './session';

/**
 * "Keep me signed in", ported from includes/remember_me.php.
 *
 * The cookie holds `selector:validator`. Only the selector is stored in the
 * clear; the validator is stored as a SHA-256 hash. So a dump of
 * auth_remember_tokens cannot be replayed as a login — the same reason the
 * original splits it this way.
 *
 * Two rules from the original are load-bearing and kept exactly:
 *
 *   - Comparison is constant-time. A plain === leaks, through timing, how many
 *     leading bytes of a guessed validator were right.
 *   - A known selector with a WRONG validator deletes every token the account
 *     has. The honest reading of that event is that a cookie was stolen and one
 *     of the two parties is now using a stale copy; signing both out is the
 *     safe answer, not letting the attacker keep trying.
 *
 * Each successful restore rotates the token, so a cookie is only ever usable
 * once.
 */

const COOKIE = 'orbit_remember';
const DAYS = 30;
const MAX_AGE = DAYS * 86_400;

type UserType = 'admin' | 'teacher' | 'student' | 'guardian';

/**
 * Issues a token and sets the cookie.
 *
 * `userId` follows the original's convention, which is NOT uniform:
 * admins.id, teachers.id, guardians.id — but for a student it is
 * **student_login.id**, not students.id. Changing that would break every cookie
 * already in the wild, so it is kept.
 */
export async function issueRemember(userType: UserType, userId: number): Promise<boolean> {
  if (!Number.isInteger(userId) || userId <= 0) return false;

  const selector = randomBytes(16).toString('hex'); // 32 hex chars
  const validator = randomBytes(32).toString('hex'); // 64 hex chars

  try {
    await prisma.authRememberToken.create({
      data: {
        user_type: userType,
        user_id: userId,
        selector,
        validator_hash: sha256(validator),
        expires_at: new Date(Date.now() + MAX_AGE * 1000),
      },
    });
  } catch {
    return false; // a failed remember-me must not fail the sign-in itself
  }

  const store = await cookies();
  store.set(COOKIE, `${selector}:${validator}`, {
    httpOnly: true, // an XSS bug must not be able to read it
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // still sent on a top-level navigation back to the site
    path: '/',
    maxAge: MAX_AGE,
  });
  return true;
}

/**
 * Restores a session from the cookie, or returns null.
 *
 * Safe to call on any request: it does nothing when there is no cookie.
 */
export async function restoreFromRemember(): Promise<Role | null> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value ?? '';
  if (!raw) return null;

  const parts = raw.split(':');
  if (parts.length !== 2) return clearCookie();

  const [selector, validator] = parts;
  // Reject anything malformed before touching the database.
  if (!/^[a-f0-9]{32}$/i.test(selector) || !/^[a-f0-9]{64}$/i.test(validator)) {
    return clearCookie();
  }

  const token = await prisma.authRememberToken.findUnique({ where: { selector } });
  if (!token) return clearCookie();

  if (token.expires_at.getTime() < Date.now()) {
    await forgetTokenId(token.id);
    return clearCookie();
  }

  if (!constantTimeEqual(token.validator_hash, sha256(validator))) {
    // Tampered with, or an old cookie replayed: drop every token this account has.
    await forgetUser(token.user_type as UserType, token.user_id);
    return clearCookie();
  }

  const account = await loadRememberedAccount(token.user_type as UserType, token.user_id);
  if (!account) {
    await forgetTokenId(token.id);
    return clearCookie();
  }

  // Rotate: this token is spent.
  await forgetTokenId(token.id);
  await issueRemember(token.user_type as UserType, token.user_id);
  await createSession(account);
  return account.role;
}

/**
 * The account behind a remembered token, or null when it is gone or no longer
 * active. A locked admin, an inactive teacher, a deactivated guardian and a
 * student whose student_status left 'Active' must all fail to be signed back in
 * — the cookie outlives the account state, so this check is the one that
 * matters.
 */
async function loadRememberedAccount(userType: UserType, userId: number) {
  switch (userType) {
    case 'admin': {
      const row = await prisma.admin.findUnique({
        where: { id: userId },
        select: { id: true, status: true, role: true, branch_id: true },
      });
      if (!row || row.status === 'locked') return null;
      // A branch admin with no branch would otherwise see every branch.
      if (row.role === 'branch_admin' && !row.branch_id) return null;
      return { uid: row.id, role: 'admin' as const, adminRole: row.role, branchId: row.branch_id };
    }
    case 'teacher': {
      const row = await prisma.teacher.findUnique({
        where: { id: userId },
        select: { id: true, status: true },
      });
      if (!row || row.status !== 'active') return null;
      return { uid: row.id, role: 'teacher' as const };
    }
    case 'guardian': {
      const row = await prisma.guardian.findUnique({
        where: { id: userId },
        select: { id: true, status: true, must_change_password: true },
      });
      if (!row || row.status !== 'active') return null;
      return {
        uid: row.id,
        role: 'guardian' as const,
        mustChangePassword: row.must_change_password,
      };
    }
    case 'student': {
      // user_id is student_login.id here, not students.id.
      const login = await prisma.studentLogin.findUnique({
        where: { id: userId },
        select: {
          student_id: true,
          must_change_password: true,
          student: { select: { student_status: true, branch_id: true } },
        },
      });
      if (!login || login.student.student_status !== 'Active') return null;
      return {
        uid: login.student_id,
        role: 'student' as const,
        branchId: login.student.branch_id,
        mustChangePassword: login.must_change_password,
      };
    }
    default:
      return null;
  }
}

/** Deletes every token for an account — used on logout and on suspicion. */
export async function forgetUser(userType: UserType, userId: number): Promise<void> {
  try {
    await prisma.authRememberToken.deleteMany({ where: { user_type: userType, user_id: userId } });
  } catch {
    /* not fatal */
  }
}

/** Drops the current browser's token (if any) and expires the cookie. */
export async function forgetCurrentRemember(): Promise<void> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value ?? '';
  const selector = raw.split(':')[0];
  if (/^[a-f0-9]{32}$/i.test(selector)) {
    try {
      await prisma.authRememberToken.deleteMany({ where: { selector } });
    } catch {
      /* not fatal */
    }
  }
  await clearCookie();
}

/** Removes expired rows. The original does this opportunistically; so do we. */
export async function cleanupRemember(): Promise<void> {
  if (Math.random() > 0.02) return;
  try {
    await prisma.authRememberToken.deleteMany({ where: { expires_at: { lt: new Date() } } });
  } catch {
    /* not fatal */
  }
}

async function forgetTokenId(id: number): Promise<void> {
  try {
    await prisma.authRememberToken.delete({ where: { id } });
  } catch {
    /* already gone */
  }
}

async function clearCookie(): Promise<null> {
  const store = await cookies();
  store.delete(COOKIE);
  return null;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // timingSafeEqual throws on a length mismatch, which would itself be a leak.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export const REMEMBER_COOKIE = COOKIE;
