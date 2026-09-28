import 'server-only';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

/**
 * Sessions.
 *
 * The PHP app keeps a server-side session and puts the user's id in it. Vercel
 * functions have nowhere to keep that, so the session travels as a signed JWT in
 * an httpOnly cookie instead. The contents are only an id, a role and a branch —
 * nothing secret — but it is signed, so the browser cannot promote itself to
 * admin by editing the cookie, and httpOnly keeps JavaScript (and therefore XSS)
 * away from it.
 *
 * Roles are checked against the DATABASE on every protected request
 * (lib/auth/guards.ts), never from the cookie alone. That is what makes locking
 * an account take effect on the account's next click, exactly as
 * orbit_admin_account() does in the original.
 */

export type Role = 'student' | 'teacher' | 'guardian' | 'admin';

export interface SessionUser extends JWTPayload {
  /** Row id in students / teachers / guardians / admins. */
  uid: number;
  role: Role;
  /** admins.role — only meaningful when role === 'admin'. */
  adminRole?: 'super_admin' | 'branch_admin';
  /** The branch this account is pinned to, if any. */
  branchId?: number | null;
  /** Mirrors must_change_password: the portal redirects to settings until cleared. */
  mustChangePassword?: boolean;
}

const COOKIE = 'orbit_session';
const MAX_AGE_SECONDS = 60 * 60 * 8; // eight hours, as a coaching day plus slack

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    // Failing loudly beats signing every session with a guessable key.
    throw new Error('AUTH_SECRET is missing or shorter than 32 characters');
  }
  return new TextEncoder().encode(value);
}

export async function createSession(user: SessionUser): Promise<void> {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // 'strict' would drop the cookie when arriving from an email link
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

/** The signed-in user, or null. Never throws on a bad or expired cookie. */
export async function readSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.uid !== 'number' || typeof payload.role !== 'string') return null;
    return payload as SessionUser;
  } catch {
    return null; // expired, tampered with, or signed by an older secret
  }
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

export const SESSION_COOKIE = COOKIE;
