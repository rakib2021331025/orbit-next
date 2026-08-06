import "server-only";

import { redirect } from "next/navigation";
import type { Session } from "next-auth";

import { auth } from "@/lib/auth";
import { AuthorizationError } from "@/lib/errors";
import type { Role } from "@/generated/prisma/enums";

export { AuthorizationError };

/**
 * Server-side authorisation helpers.
 *
 * Middleware already blocks whole route prefixes, but middleware cannot protect
 * Server Actions — those are POST endpoints callable directly, bypassing any
 * page render. Every action and every data-loading page must therefore call one
 * of these guards itself. Defence in depth, not belt-and-braces.
 */

/** Returns the session, or redirects to the login page. For use in pages. */
export async function requireSession(): Promise<Session> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session;
}

/** Returns the session if the user holds one of `roles`, else redirects. */
export async function requireRole(...roles: Role[]): Promise<Session> {
  const session = await requireSession();
  if (!roles.includes(session.user.role)) redirect("/login");
  return session;
}

export const requireAdmin = () => requireRole("ADMIN");
export const requireTeacher = () => requireRole("TEACHER");
export const requireStudent = () => requireRole("STUDENT");
export const requireStaff = () => requireRole("ADMIN", "TEACHER");

/**
 * Throwing variants for Server Actions, where `redirect()` would mask the
 * failure as a navigation instead of surfacing an error to the caller.
 */
export async function assertRole(...roles: Role[]): Promise<Session> {
  const session = await auth();
  if (!session?.user) throw new AuthorizationError("You must be signed in.");
  if (!roles.includes(session.user.role)) throw new AuthorizationError();
  return session;
}

/**
 * Resolves the Student.id for the signed-in student. Actions that read or write
 * student-owned data must scope their queries by this rather than trusting a
 * studentId supplied by the client.
 */
export async function requireStudentProfileId(): Promise<string> {
  const session = await assertRole("STUDENT");
  if (!session.user.profileId) {
    throw new AuthorizationError("No student profile is linked to this account.");
  }
  return session.user.profileId;
}

/** Same, for teachers. */
export async function requireTeacherProfileId(): Promise<string> {
  const session = await assertRole("TEACHER");
  if (!session.user.profileId) {
    throw new AuthorizationError("No teacher profile is linked to this account.");
  }
  return session.user.profileId;
}
