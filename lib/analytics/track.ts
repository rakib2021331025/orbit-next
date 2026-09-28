import 'server-only';
import { createHash } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { after } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * The write side of visitor analytics, from includes/visitor_tracker.php.
 *
 * ONE insert per page view. No SELECT, no JavaScript beacon — a beacon would
 * double the requests a page costs, and on a free host that is the daily quota.
 *
 * HOW A VISITOR IS RECOGNISED
 *   `orbit_vid`  a random 32-hex id kept for a year → unique visitors
 *   `orbit_vs`   a random 32-hex id that expires after 30 minutes without a page
 *                view, renewed on every page → visits
 *
 * The cookies are issued and refreshed in `middleware.ts`, which is the only
 * place able to set them on the way past; this reads them. Only **SHA-256
 * digests** of the values are stored, so the table cannot be turned back into a
 * list of who visited.
 *
 * NEVER BREAKS A PAGE: every failure is swallowed. A page view is worth less
 * than the page.
 */

export const VISITOR_COOKIE = 'orbit_vid';
export const VISIT_COOKIE = 'orbit_vs';
export const VISITOR_TTL = 31_536_000; // one year
export const VISIT_TTL = 1_800; // 30 minutes of inactivity ends a visit

/** The header middleware sets when it has just minted a visitor id. */
export const NEW_VISITOR_HEADER = 'x-orbit-new-visitor';

/** The path middleware passes through, so the chrome need not be told it. */
export const PATH_HEADER = 'x-orbit-path';

/** What is stored instead of the cookie value: a 32-character SHA-256 prefix. */
export function visitorDigest(kind: 'visitor' | 'visit', value: string): string {
  return createHash('sha256').update(`orbit-${kind}|${value}`).digest('hex').slice(0, 32);
}

/** Crawlers, uptime monitors, link-preview fetchers and scripts. */
export function isBot(userAgent: string): boolean {
  return /bot\b|bot\/|crawl|spider|slurp|mediapartners|facebookexternalhit|facebookcatalog|whatsapp|telegrambot|linkedinbot|embedly|skypeuripreview|bingpreview|curl|wget|python|java\/|okhttp|go-http|httpclient|libwww|axios|node-fetch|postman|headless|phantomjs|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitoring|scanner|archiver/i.test(
    userAgent
  );
}

/** 'desktop' | 'mobile' | 'tablet' from the User-Agent, best effort. */
export function deviceType(userAgent: string): 'desktop' | 'mobile' | 'tablet' {
  if (/iPad|Tablet|PlayBook|Silk\/|Kindle|Nexus (7|9|10)\b/i.test(userAgent)) return 'tablet';
  // Android phones say "Mobile"; Android tablets do not.
  if (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent)) return 'tablet';
  if (/Mobi|iPhone|iPod|Android|BlackBerry|IEMobile|Opera Mini|Windows Phone/i.test(userAgent)) {
    return 'mobile';
  }
  return 'desktop';
}

/**
 * A short browser name from a fixed list — the raw User-Agent is never stored.
 *
 * The order matters: Edge, Opera, Samsung Internet and the in-app browsers all
 * say "Chrome" too, so Chrome has to be tested last but one.
 */
export function browserName(userAgent: string): string {
  const browsers: [string, RegExp][] = [
    ['Edge', /Edg(e|A|iOS)?\//],
    ['Opera', /OPR\/|Opera|OPT\//],
    ['Samsung Internet', /SamsungBrowser/],
    ['UC Browser', /UCBrowser|UCWEB/i],
    ['Facebook App', /FBAN|FBAV|FB_IAB/],
    ['Firefox', /Firefox|FxiOS/],
    ['Chrome', /Chrome|CriOS/],
    ['Safari', /Safari/],
    ['Internet Explorer', /MSIE|Trident\//],
  ];

  for (const [name, pattern] of browsers) {
    if (pattern.test(userAgent)) return name;
  }
  return 'Other';
}

/**
 * The page as a stored path.
 *
 * The query string is dropped — it can hold a reset token or a search term —
 * except the numeric course id, so the report can say which course was opened.
 */
export function pagePath(pathname: string, search?: URLSearchParams): string {
  const clean = pathname.toLowerCase().replace(/[^a-z0-9_./-]/g, '');
  let path = clean !== '' ? clean : 'unknown';

  if (path.startsWith('/courses/') && search) {
    const id = search.get('id') ?? '';
    if (/^\d{1,9}$/.test(id) && Number(id) > 0) path += `?id=${Number(id)}`;
  }

  return path.slice(0, 191);
}

/** A tracking cookie's value when it is exactly 32 lowercase hex characters. */
function validId(value: string | undefined): string | null {
  return value !== undefined && /^[a-f0-9]{32}$/.test(value) ? value : null;
}

/**
 * Records the current request as a page view.
 *
 * Called from the layouts of the areas that count as website traffic — the
 * public site and the student and guardian portals. Admin and teacher pages are
 * staff tools, and staff checking the site would inflate every figure.
 */
export async function trackPageView(): Promise<void> {
  try {
    const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);

    // Middleware passes the path; a layout or shell does not know it, and a
    // client navigation re-runs middleware, so this stays correct either way.
    const pathname = headerStore.get(PATH_HEADER) ?? '';
    if (pathname === '') return;

    const visitorId = validId(cookieStore.get(VISITOR_COOKIE)?.value);
    const visitId = validId(cookieStore.get(VISIT_COOKIE)?.value);
    // No cookies means middleware decided not to track this request (a bot, a
    // prefetch, a signed-in staff member) — or could not set them.
    if (visitorId === null || visitId === null) return;

    const userAgent = headerStore.get('user-agent') ?? '';
    if (userAgent === '' || isBot(userAgent)) return;

    const now = new Date();
    const dateOnly = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
    const timeOnly = new Date(`1970-01-01T${now.toISOString().slice(11, 19)}.000Z`);

    // Written after the response has been sent (next/server after()): a visitor
    // never waits for their own page view to be logged, and a slow insert under
    // load does not slow every public page down with it.
    const data = {
        visitor_identifier: visitorDigest('visitor', visitorId),
        session_id: visitorDigest('visit', visitId),
        page_url: pagePath(pathname),
        visit_date: dateOnly,
        visit_time: timeOnly,
        device_type: deviceType(userAgent),
        browser: browserName(userAgent),
        is_new_visitor: headerStore.get(NEW_VISITOR_HEADER) === '1',
        created_at: now,
    };
    after(async () => {
      try {
        await prisma.visitorLog.create({ data });
      } catch {
        // Analytics must never break a page.
      }
    });
  } catch {
    // Analytics must never break a page.
  }
}
