import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

/**
 * A cheap first gate on the portal routes.
 *
 * This is NOT the authorisation check. Middleware runs on the edge, where there
 * is no database connection, so all it can do is verify the cookie's signature
 * and read the role out of it. That is enough to bounce an anonymous visitor to
 * the right login page without paying for a render, and it keeps signed-out
 * users out of the portals entirely.
 *
 * Whether the account still exists, is still active, and may see a particular
 * record is decided per request in lib/auth/guards.ts against the live row. If
 * this file were deleted the app would still be secure, only slower; if the
 * guards were deleted it would not be. Any change here must keep that order of
 * responsibility.
 */

const PORTALS = [
  { prefix: '/student', role: 'student', login: '/student/login' },
  { prefix: '/teacher', role: 'teacher', login: '/teacher/login' },
  { prefix: '/guardian', role: 'guardian', login: '/guardian/login' },
  { prefix: '/admin', role: 'admin', login: '/admin/login' },
] as const;

/** Reachable without a session, under any portal prefix. */
const OPEN = ['/login', '/logout', '/forgot-password', '/reset-password'];

const COOKIE = 'orbit_session';

/** The visitor-analytics cookies. Their names and lifetimes live with the tracker. */
const VISITOR_COOKIE = 'orbit_vid';
const VISIT_COOKIE = 'orbit_vs';
const VISITOR_TTL = 31_536_000; // one year
const VISIT_TTL = 1_800; // 30 minutes of inactivity ends a visit
const NEW_VISITOR_HEADER = 'x-orbit-new-visitor';
const PATH_HEADER = 'x-orbit-path';

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET ?? '';
  return new TextEncoder().encode(value);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const portal = PORTALS.find((p) => pathname === p.prefix || pathname.startsWith(`${p.prefix}/`));
  if (!portal) return withVisitorCookies(request, null);

  const rest = pathname.slice(portal.prefix.length) || '/';
  if (OPEN.some((open) => rest === open || rest.startsWith(`${open}/`))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE)?.value;
  let role: string | null = null;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret());
      role = typeof payload.role === 'string' ? payload.role : null;
    } catch {
      role = null; // expired, tampered with, or signed by an older secret
    }
  }

  if (role === portal.role) {
    if (portal.role === 'admin') return adoptBranchParam(request);
    // The student and guardian portals count as website traffic; the teacher
    // portal is a staff tool and is not tracked.
    return withVisitorCookies(request, role);
  }

  // Signed in as somebody else: send them to their own portal rather than to a
  // login form they do not need. A student who follows an /admin link should not
  // be invited to enter admin credentials.
  const other = role ? PORTALS.find((p) => p.role === role) : undefined;
  if (other) {
    return NextResponse.redirect(new URL(other.prefix, request.url));
  }

  const login = new URL(portal.login, request.url);
  // Remember where they were going, so the login can return them there. Only a
  // path within this portal is kept — an absolute URL here would be an open
  // redirect straight out of the site.
  const target = pathname + request.nextUrl.search;
  if (target.startsWith(`${portal.prefix}/`)) {
    login.searchParams.set('next', target);
  }
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except static assets, the image optimiser and the public files.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|assets|uploads|manifest).*)'],
};

/**
 * Issues and refreshes the two visitor-analytics cookies, from
 * includes/visitor_tracker.php.
 *
 * Middleware is the only place that can set them on the way past: a Server
 * Component may read cookies but not write them, and without a cookie every page
 * view would look like a brand-new visitor. The row itself is written in
 * `trackPageView()`, which has a database; this only decides **whether** the
 * request counts and hands the ids over.
 *
 * NOT COUNTED: anything but GET, a prefetch or link preview, a bot, and staff —
 * an admin or teacher browsing the public site would inflate every figure.
 */
function withVisitorCookies(request: NextRequest, role: string | null): NextResponse {
  const method = request.method.toUpperCase();
  const purpose = [
    request.headers.get('sec-purpose') ?? '',
    request.headers.get('purpose') ?? '',
    request.headers.get('x-purpose') ?? '',
    request.headers.get('x-moz') ?? '',
  ]
    .join(' ')
    .toLowerCase();

  const userAgent = request.headers.get('user-agent') ?? '';
  const staff = role === 'admin' || role === 'teacher';

  if (
    method !== 'GET' ||
    staff ||
    userAgent === '' ||
    purpose.includes('prefetch') ||
    purpose.includes('preview')
  ) {
    return NextResponse.next();
  }

  const existing = request.cookies.get(VISITOR_COOKIE)?.value;
  const isNew = existing === undefined || !/^[a-f0-9]{32}$/.test(existing);
  const visitorId = isNew ? randomId() : existing;

  const visit = request.cookies.get(VISIT_COOKIE)?.value;
  const visitId = visit !== undefined && /^[a-f0-9]{32}$/.test(visit) ? visit : randomId();

  // The page reads this to set is_new_visitor, since it cannot tell whether the
  // cookie it sees was just minted.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NEW_VISITOR_HEADER, isNew ? '1' : '0');
  requestHeaders.set(PATH_HEADER, request.nextUrl.pathname);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  const secure = process.env.NODE_ENV === 'production';

  response.cookies.set(VISITOR_COOKIE, visitorId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: VISITOR_TTL,
  });
  // Rolling expiry: the visit cookie lives 30 minutes after the LAST page.
  response.cookies.set(VISIT_COOKIE, visitId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: VISIT_TTL,
  });

  return response;
}

/** 32 lowercase hex characters, from the edge runtime's own crypto. */
function randomId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * `?branch=<id>` is the admin area's reserved parameter: it switches which branch
 * the admin is viewing. The PHP app read it straight into the session, so links
 * and bookmarks carrying it exist.
 *
 * Here it is translated into the branch cookie and stripped from the URL, which
 * keeps those links working and keeps the parameter out of the way of a page's own
 * filters. `0` and `all` mean every branch, as orbit_admin_branch_id() accepts.
 *
 * Whether the admin is ALLOWED to switch is not decided here — a branch-locked
 * admin's lock is applied server-side in activeBranchId(), which ignores the
 * cookie entirely. Middleware cannot reach the database to check.
 */
function adoptBranchParam(request: NextRequest): NextResponse {
  const raw = request.nextUrl.searchParams.get('branch');
  if (raw === null) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.searchParams.delete('branch');
  const response = NextResponse.redirect(url);

  if (raw === '0' || raw === 'all') {
    response.cookies.delete('orbit_admin_branch');
  } else if (/^\d{1,10}$/.test(raw) && Number(raw) > 0) {
    response.cookies.set('orbit_admin_branch', raw, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }
  return response;
}
