/**
 * Supabase Storage setup: `npx tsx tools/storage-setup.ts [--upload <dir>] [--dry-run]`
 *
 *   1. Creates the five buckets from lib/storage/buckets.ts, or updates their
 *      public flag, size limit and allowed MIME types to match. Idempotent.
 *   2. With `--upload D:/xampp/htdocs/Orbit/uploads`, copies every file under it
 *      into the bucket its folder maps to, keeping the key the app will look for
 *      (uploads/materials/x.pdf → documents/materials/x.pdf). The source folder is
 *      only READ. Objects that already exist are skipped, so it can be re-run.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep, extname } from 'node:path';
import { loadEnv } from '../prisma/seed/env';
import { BUCKETS, locate, type BucketName } from '../lib/storage/buckets';

loadEnv();
const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const uploadDir = args.includes('--upload') ? args[args.indexOf('--upload') + 1] : '';

if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env first.');
  process.exit(1);
}

const headers = { apikey: key, Authorization: `Bearer ${key}` };

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
  '.pdf': 'application/pdf', '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip',
};

async function ensureBuckets() {
  const res = await fetch(`${url}/storage/v1/bucket`, { headers });
  if (!res.ok) throw new Error(`Cannot list buckets: ${res.status} ${await res.text()}`);
  const existing = new Set(((await res.json()) as { id: string }[]).map((b) => b.id));

  for (const [id, spec] of Object.entries(BUCKETS)) {
    const body = {
      id,
      name: id,
      public: spec.public,
      file_size_limit: spec.maxBytes,
      allowed_mime_types: spec.mimeTypes,
    };
    const verb = existing.has(id) ? 'PUT' : 'POST';
    if (dryRun) {
      console.log(`[dry-run] ${verb === 'POST' ? 'create' : 'update'} bucket ${id} (${spec.public ? 'public' : 'private'})`);
      continue;
    }
    const r = await fetch(`${url}/storage/v1/bucket${verb === 'PUT' ? `/${id}` : ''}`, {
      method: verb,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${verb === 'POST' ? 'created' : 'updated'} ${id} (${spec.public ? 'public' : 'private'})${r.ok ? '' : ` — ${await r.text()}`}`);
  }
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

async function uploadLegacy(root: string) {
  let copied = 0, skipped = 0, failed = 0;
  for (const file of walk(root)) {
    const stored = `uploads/${relative(root, file).split(sep).join('/')}`;
    const where = locate(stored);
    const type = MIME[extname(file).toLowerCase()];
    if (!where || !type || /\.(php|html?|svg|js)$/i.test(file)) {
      console.log(`skip ${stored} (not an upload the app serves)`);
      skipped++;
      continue;
    }
    if (dryRun) {
      console.log(`[dry-run] ${stored} → ${where.bucket}/${where.key}`);
      continue;
    }
    const r = await fetch(`${url}/storage/v1/object/${where.bucket}/${where.key.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': type, 'cache-control': BUCKETS[where.bucket as BucketName].cacheControl, 'x-upsert': 'false' },
      body: readFileSync(file),
    });
    if (r.ok) copied++;
    else if (r.status === 409 || (await r.text()).includes('Duplicate')) skipped++;
    else { failed++; console.log(`FAIL ${stored}: ${r.status}`); }
  }
  console.log(`\nfiles: ${copied} copied, ${skipped} skipped, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

(async () => {
  await ensureBuckets();
  if (uploadDir) await uploadLegacy(uploadDir);
})().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
