import type { NextAuthConfig } from "next-auth";
import type { Role } from "@/generated/prisma/enums";

/// Where each role lands after signing in, and which URL prefixes that role owns.
export const ROLE_HOME: Record<Role, string> = {
  ADMIN: "/admin",
  TEACHER: "/teacher",
  STUDENT: "/student",
};

const ROLE_PREFIX: Record<Role, string> = {
  ADMIN: "/admin",
  TEACHER: "/teacher",
  STUDENT: "/student",
};

/// Every prefix that requires a session at all.
const PROTECTED_PREFIXES = Object.values(ROLE_PREFIX);

/**
 * Edge-safe half of the auth config. This file must not import Prisma or any
 * Node-only module — Next.js middleware runs on the edge runtime, and the
 * providers (which do hit the database) live in `auth.ts` instead.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
  providers: [], // populated in auth.ts
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.profileId = user.profileId ?? null;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.role = token.role;
        session.user.profileId = token.profileId ?? null;
      }
      return session;
    },
    authorized({ auth, request: { nextUrl } }) {
      const role = auth?.user?.role;
      const { pathname } = nextUrl;

      const requiredPrefix = PROTECTED_PREFIXES.find(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
      );

      // Public route — always allowed.
      if (!requiredPrefix) {
        // Signed-in users shouldn't sit on the login page.
        if (pathname === "/login" && role) {
          return Response.redirect(new URL(ROLE_HOME[role], nextUrl));
        }
        return true;
      }

      // Protected route, no session → NextAuth redirects to `pages.signIn`.
      if (!role) return false;

      // Protected route, wrong role → bounce to that role's own dashboard
      // rather than leaking the existence of another role's pages.
      if (ROLE_PREFIX[role] !== requiredPrefix) {
        return Response.redirect(new URL(ROLE_HOME[role], nextUrl));
      }

      return true;
    },
  },
} satisfies NextAuthConfig;
