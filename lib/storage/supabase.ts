import 'server-only';
import { BUCKETS, type BucketName } from './buckets';

/**
 * Supabase Storage over its REST API — upload, download, delete, sign.
 *
 * Plain fetch rather than @supabase/supabase-js: four calls do not justify a
 * client library, and nothing here may ever run in the browser anyway.
 *
 * `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security, which is why it is
 * read only here, only on the server, and never given a NEXT_PUBLIC_ name. Every
 * caller has already decided the user may touch the object; Storage is not asked
 * to decide again.
 *
 * **Requires configuration**: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
 */

function config(): { url: string; key: string } | null {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  return url && key ? { url, key } : null;
}

const encodeKey = (key: string) => key.split('/').map(encodeURIComponent).join('/');

async function call(path: string, init: RequestInit): Promise<Response | null> {
  const cfg = config();
  if (!cfg) return null;
  try {
    return await fetch(`${cfg.url}/storage/v1/${path}`, {
      ...init,
      headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, ...(init.headers ?? {}) },
      cache: 'no-store',
    });
  } catch {
    return null;
  }
}

export async function supabasePut(
  bucket: BucketName,
  key: string,
  bytes: Buffer,
  contentType = 'application/octet-stream'
): Promise<boolean> {
  const res = await call(`object/${bucket}/${encodeKey(key)}`, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'cache-control': BUCKETS[bucket].cacheControl,
      // Never overwrite: names are unique, so an existing object means a clash,
      // and silently replacing it would change bytes under a cached URL.
      'x-upsert': 'false',
    },
    body: bytes as BodyInit,
  });
  return res?.ok ?? false;
}

export async function supabaseGet(bucket: BucketName, key: string): Promise<Buffer | null> {
  const res = await call(`object/authenticated/${bucket}/${encodeKey(key)}`, { method: 'GET' });
  if (!res || !res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

export async function supabaseDelete(bucket: BucketName, key: string): Promise<void> {
  await call(`object/${bucket}/${encodeKey(key)}`, { method: 'DELETE' });
}

/** A time-limited URL for a private object, or null. */
export async function supabaseSign(bucket: BucketName, key: string, seconds: number): Promise<string | null> {
  const res = await call(`object/sign/${bucket}/${encodeKey(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: seconds }),
  });
  if (!res || !res.ok) return null;
  const data = (await res.json().catch(() => null)) as { signedURL?: string } | null;
  const cfg = config();
  return data?.signedURL && cfg ? `${cfg.url}/storage/v1${data.signedURL}` : null;
}

/**
 * The stable CDN URL of a PUBLIC object. Not a secret and never expires, so it is
 * what pages embed directly — the browser fetches it from the CDN without a round
 * trip through Next.js or the database.
 */
export function supabasePublicUrl(bucket: BucketName, key: string): string {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
  return `${url}/storage/v1/object/public/${bucket}/${encodeKey(key)}`;
}
