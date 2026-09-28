import 'server-only';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { normaliseStoredPath } from './url';
import { locate } from './buckets';

/**
 * Where uploaded files live.
 *
 * The PHP app writes into `uploads/` next to the code. That works on shared
 * hosting and not on Vercel, whose filesystem is read-only apart from `/tmp` and
 * does not survive an invocation — so this is an adapter with two backends:
 *
 *   `local` (default)  a directory on disk, for development and any VPS.
 *   `supabase`         Supabase Storage, five buckets by access rule (buckets.ts) —
 *                      the production setup on Vercel.
 *   `s3`               one S3-compatible bucket, kept for any other host.
 *
 * Both are addressed by the same relative path the database already stores
 * (`uploads/students/abc.jpg`), so the column does not change and existing rows
 * keep working.
 *
 * **Requires configuration before a serverless deploy**: `ORBIT_STORAGE=supabase`
 * with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Until then the
 * local driver is used and a serverless deployment will not persist uploads.
 */

export type StorageDriver = 'local' | 's3' | 'supabase';

export function storageDriver(): StorageDriver {
  const driver = (process.env.ORBIT_STORAGE ?? '').trim().toLowerCase();
  return driver === 's3' || driver === 'supabase' ? driver : 'local';
}

/** The directory the local driver writes into. */
function localRoot(): string {
  return process.env.ORBIT_UPLOAD_DIR ?? path.join(process.cwd(), 'public');
}

/**
 * Resolves a stored path to an absolute one, refusing anything that escapes the
 * upload root. `normaliseStoredPath` already rejects `..`, and this is the
 * second check — path traversal is the one bug in a file store that hands over
 * the whole disk.
 */
function localPath(storedPath: string): string | null {
  const clean = normaliseStoredPath(storedPath);
  if (clean === '' || !clean.startsWith('uploads/')) return null;

  const root = localRoot();
  const full = path.resolve(root, clean);
  if (!full.startsWith(path.resolve(root) + path.sep)) return null;
  return full;
}

/**
 * Writes a file and returns the path to store in the database.
 *
 * `directory` is relative to the upload root, e.g. `uploads/payments`.
 */
export async function putFile(
  directory: string,
  filename: string,
  bytes: Buffer,
  contentType?: string
): Promise<string | null> {
  const storedPath = `${directory.replace(/\/+$/, '')}/${filename}`;

  if (storageDriver() === 'supabase') {
    const where = locate(normaliseStoredPath(storedPath));
    if (!where) return null;
    const { supabasePut } = await import('./supabase');
    return (await supabasePut(where.bucket, where.key, bytes, contentType)) ? storedPath : null;
  }
  if (storageDriver() === 's3') {
    return putToS3(storedPath, bytes, contentType);
  }

  const full = localPath(storedPath);
  if (!full) return null;
  try {
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, bytes);
    return storedPath;
  } catch {
    return null;
  }
}

/** Reads a stored file, or null when it is gone. */
export async function getFile(storedPath: string): Promise<Buffer | null> {
  if (storageDriver() === 'supabase') {
    const where = locate(normaliseStoredPath(storedPath));
    if (!where) return null;
    const { supabaseGet } = await import('./supabase');
    return supabaseGet(where.bucket, where.key);
  }
  if (storageDriver() === 's3') {
    return getFromS3(storedPath);
  }
  const full = localPath(storedPath);
  if (!full) return null;
  try {
    return await readFile(full);
  } catch {
    return null;
  }
}

/** Removes a stored file. A missing file is not an error. */
export async function deleteFile(storedPath: string): Promise<void> {
  if (storageDriver() === 'supabase') {
    const where = locate(normaliseStoredPath(storedPath));
    if (!where) return;
    for (const key of signed.keys()) if (key.startsWith(normaliseStoredPath(storedPath) + "|")) signed.delete(key);
    const { supabaseDelete } = await import('./supabase');
    await supabaseDelete(where.bucket, where.key);
    return;
  }
  if (storageDriver() === 's3') {
    await deleteFromS3(storedPath);
    return;
  }
  const full = localPath(storedPath);
  if (!full) return;
  try {
    await unlink(full);
  } catch {
    // Already gone.
  }
}

/* ------------------------------------------------------- signed URLs ---- */

/** How long a signed URL lives, and how much life it must have left to be reused. */
const SIGN_SECONDS = 60 * 60;
const REUSE_MARGIN_MS = 15 * 60 * 1000;

/**
 * Signed URLs already issued by this server instance, per path.
 *
 * Signing is a network call to Storage; a page listing thirty materials would
 * make thirty of them on every view. A URL with a quarter of an hour left is
 * handed out again instead — which also keeps the URL stable, so the browser's
 * own cache of the file is reused. Per instance and in memory: a cold start
 * simply signs again.
 */
const signed = new Map<string, { url: string; expires: number }>();

/**
 * A short-lived URL for a PRIVATE file, or null when the file store cannot sign
 * (local/s3 drivers — callers then stream the bytes themselves).
 *
 * The CALLER authorises. This only mints the link, and it must never be stored:
 * the database keeps the path, never the URL.
 */
export async function signedUrl(storedPath: string, downloadAs?: string): Promise<string | null> {
  if (storageDriver() !== 'supabase') return null;
  const path = normaliseStoredPath(storedPath);
  const where = locate(path);
  if (!where) return null;

  const cacheKey = `${path}|${downloadAs ?? ''}`;
  const hit = signed.get(cacheKey);
  if (hit && hit.expires - Date.now() > REUSE_MARGIN_MS) return hit.url;

  const { supabaseSign } = await import('./supabase');
  const url = await supabaseSign(where.bucket, where.key, SIGN_SECONDS);
  if (!url) return null;

  const final = downloadAs ? `${url}&download=${encodeURIComponent(downloadAs)}` : url;
  if (signed.size > 5000) signed.clear(); // a bound, not an LRU: good enough for a cache of links
  signed.set(cacheKey, { url: final, expires: Date.now() + SIGN_SECONDS * 1000 });
  return final;
}

/* ----------------------------------------------------------------- S3 ---- */

/**
 * The S3 calls are made with `fetch` and a SigV4 signature rather than the AWS
 * SDK: the SDK is ~10 MB in a function bundle, and three operations do not
 * justify it.
 *
 * Signing is deferred to `lib/storage/s3.ts` so this module stays readable and
 * the local driver pulls in nothing.
 */
async function putToS3(storedPath: string, bytes: Buffer, contentType?: string): Promise<string | null> {
  const { s3Request } = await import('./s3');
  const ok = await s3Request('PUT', storedPath, bytes, contentType);
  return ok ? storedPath : null;
}

async function getFromS3(storedPath: string): Promise<Buffer | null> {
  const { s3Fetch } = await import('./s3');
  return s3Fetch(storedPath);
}

async function deleteFromS3(storedPath: string): Promise<void> {
  const { s3Request } = await import('./s3');
  await s3Request('DELETE', storedPath);
}
