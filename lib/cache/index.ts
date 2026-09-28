import 'server-only';
import { unstable_cache, revalidateTag } from 'next/cache';
import { Prisma } from '@prisma/client';

/**
 * Shared server-side data cache for PUBLIC data — the one lever that takes the
 * database out of most page views.
 *
 * Every page renders dynamically (the language and theme come from cookies), so
 * whole-page caching is not available. What is cached instead is the DATA those
 * pages read: settings, courses, branches, notices, gallery, teachers… — the same
 * for every visitor. Personal data (a student's marks, a guardian's payments,
 * anything behind a login) must NEVER go through here: the cache is shared by
 * every user of the deployment.
 *
 * Each entry is tagged, and admin actions call `invalidate(tag)` after a change,
 * so an edit shows at once; the `revalidate` time is only the backstop for
 * changes made outside the app (a SQL fix, an import).
 *
 * unstable_cache stores JSON, which would turn Dates into strings and Prisma
 * Decimals into strings — and code that calls `.getTime()` or `Number(decimal)`
 * on them would break in ways only visible after a cache hit. Values are
 * therefore encoded with type markers going in and revived coming out.
 */

export const TAGS = {
  settings: 'site-settings',
  courses: 'courses',
  branches: 'branches',
  notices: 'notices',
  gallery: 'gallery',
  teachers: 'teachers',
  home: 'home-content',
  exams: 'published-exams',
  classes: 'public-classes',
  stats: 'admin-stats',
} as const;

export type CacheTag = (typeof TAGS)[keyof typeof TAGS];

type Encoded = { __d: string } | { __n: string } | { __b: string };

function encode(value: unknown): unknown {
  if (value instanceof Date) return { __d: value.toISOString() } satisfies Encoded;
  if (Prisma.Decimal.isDecimal(value)) return { __n: (value as Prisma.Decimal).toString() } satisfies Encoded;
  if (typeof value === 'bigint') return { __b: value.toString() } satisfies Encoded;
  if (Array.isArray(value)) return value.map(encode);
  if (value instanceof Map) return { __m: [...value.entries()].map(([k, v]) => [encode(k), encode(v)]) };
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = encode(v);
    return out;
  }
  return value;
}

function decode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.__d === 'string' && Object.keys(o).length === 1) return new Date(o.__d);
    if (typeof o.__n === 'string' && Object.keys(o).length === 1) return new Prisma.Decimal(o.__n);
    if (typeof o.__b === 'string' && Object.keys(o).length === 1) return BigInt(o.__b);
    if (Array.isArray(o.__m) && Object.keys(o).length === 1) {
      return new Map((o.__m as [unknown, unknown][]).map(([k, v]) => [decode(k), decode(v)]));
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) out[k] = decode(v);
    return out;
  }
  return value;
}

/**
 * Wraps a PUBLIC read in the shared cache.
 *
 *   export const publicCourses = cached(loadCourses, ['courses:list'], { tags: [TAGS.courses], revalidate: 600 });
 *
 * Arguments become part of the cache key, so a function of `lang` or `page` gets
 * one entry per value. Keep them small and serialisable.
 */
export function cached<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R>,
  key: string[],
  options: { tags: CacheTag[]; revalidate: number }
): (...args: Args) => Promise<R> {
  const stored = unstable_cache(async (...args: Args) => encode(await fn(...args)), key, options);
  return async (...args: Args) => {
    // Single flight: when an entry is missing — first visit, or just after an
    // admin change dropped it — every concurrent request would otherwise run the
    // same query at once (a cache stampede; 50 users → 50 identical queries).
    // Requests on this instance that arrive while one fill is in flight share it.
    const flightKey = `${key.join('|')}|${JSON.stringify(args)}`;
    let pending = inFlight.get(flightKey);
    if (!pending) {
      pending = stored(...args).finally(() => inFlight.delete(flightKey));
      inFlight.set(flightKey, pending);
    }
    return decode(await pending) as R;
  };
}

const inFlight = new Map<string, Promise<unknown>>();

/** A one-off cached public query, for a page's own read. The key must name the data completely. */
export function cachedQuery<R>(
  key: string[],
  options: { tags: CacheTag[]; revalidate: number },
  fn: () => Promise<R>
): Promise<R> {
  return cached(fn, key, options)();
}

/**
 * Drops cached public data after an admin change. Call it from the server action
 * that made the change, after the write succeeded.
 */
export function invalidate(...tags: CacheTag[]): void {
  for (const tag of tags) revalidateTag(tag);
}
