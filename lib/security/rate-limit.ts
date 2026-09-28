import 'server-only';

/**
 * A cheap, per-instance rate limiter for high-frequency authenticated actions.
 *
 * The DB-backed throttle in ./throttle.ts is the right tool for sign-in and the
 * public forms: it survives restarts and is shared by every instance. But each
 * check is two COUNT queries and each hit an INSERT, and that is the wrong price
 * for an exam's answer autosave, which a student legitimately fires hundreds of
 * times per sitting. The PHP app never throttled exam saves at all.
 *
 * So this sits in memory, with fixed windows, and is meant ONLY to stop
 * abuse-level rates (a script hammering the action), never normal use.
 *
 * The tradeoff, stated plainly: on a serverless platform every warm instance has
 * its own map and a cold start empties it, so the effective limit is "max per
 * instance". That is acceptable because every action guarded by this still does
 * its own authorisation and bounded work — the limiter only caps how fast one
 * account can make an instance do it.
 */

interface Bucket {
  start: number;
  count: number;
}

const buckets = new Map<string, Bucket>();

/** Beyond this many live keys, expired ones are swept before adding another. */
const MAX_KEYS = 10_000;

function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    // A bucket whose window has passed is dead; the longest window used is an
    // hour, so anything older than that is certainly expired.
    if (now - bucket.start > 3_600_000) buckets.delete(key);
  }
  // Still full (a flood of distinct keys): drop the oldest half rather than grow.
  if (buckets.size >= MAX_KEYS) {
    let drop = Math.floor(buckets.size / 2);
    for (const key of buckets.keys()) {
      if (drop-- <= 0) break;
      buckets.delete(key);
    }
  }
}

/**
 * Counts one call against `key` and says whether it is allowed.
 *
 * Returns false once `max` calls have been made inside the current window of
 * `windowMs`. A refused call is not counted, so a client that backs off
 * recovers as soon as the window turns over.
 */
export function memoryLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket || now - bucket.start >= windowMs) {
    if (!bucket && buckets.size >= MAX_KEYS) sweep(now);
    bucket = { start: now, count: 0 };
    buckets.set(key, bucket);
  }

  if (bucket.count >= max) return false;
  bucket.count += 1;
  return true;
}
