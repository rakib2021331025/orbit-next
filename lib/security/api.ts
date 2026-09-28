import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { ForbiddenError } from '@/lib/auth/guards';

/**
 * Small helpers for route handlers under app/api.
 *
 * Server actions get an Origin check from Next.js for free; route handlers do
 * not. The session cookie is SameSite=Lax, which already keeps it off a
 * cross-site POST, and `sameOrigin()` is the second lock — the equivalent of the
 * csrf_verify() the PHP endpoints (admin/delete.php, admin/fees_ajax.php) call.
 */

/**
 * True when a state-changing request came from this site.
 *
 * A browser always sends Origin on a cross-origin POST, and Sec-Fetch-Site on
 * every request, so a request with neither is not a browser acting on a
 * visitor's behalf — there is no cookie being ridden, and it is let through to
 * the normal authentication.
 */
export function sameOrigin(request: NextRequest): boolean {
  const site = request.headers.get('sec-fetch-site');
  if (site === 'cross-site') return false;

  const origin = request.headers.get('origin');
  if (!origin) return site === null || site === 'same-origin' || site === 'none';

  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '';
  try {
    return new URL(origin).host === host.split(',')[0].trim();
  } catch {
    return false;
  }
}

/** A JSON 403 for a refused origin or a branch admin outside their allow-list. */
export function forbidden(): NextResponse {
  return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
}

/**
 * Runs a guard and turns a ForbiddenError into a 403 response.
 *
 * requireSuperAdmin() throws ForbiddenError, which a route handler would
 * otherwise surface as a 500. Every other throw — notably the redirect() the
 * guards use for a signed-out visitor — is re-thrown untouched, because Next.js
 * implements redirect() as an exception and swallowing it would let the request
 * through.
 */
export async function guardOr403<T>(
  guard: () => Promise<T>
): Promise<{ ok: true; value: T } | { ok: false; response: NextResponse }> {
  try {
    return { ok: true, value: await guard() };
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, response: forbidden() };
    throw error;
  }
}
