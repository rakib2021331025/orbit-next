import { NextResponse, type NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { guardOr403 } from '@/lib/security/api';
import { prisma } from '@/lib/db/prisma';
import { getLang, translate } from '@/lib/i18n';
import { getFile } from '@/lib/storage/store';
import { normaliseStoredPath } from '@/lib/storage/url';
import { makeZip, type ZipEntry } from '@/lib/export/zip';
import { studentCode } from '@/lib/reports/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Every student photo in one ZIP, from admin/export_photos.php.
 *
 * Photos live in the private upload area, so this admin-only route is the only
 * way they leave it, and three rules from the original keep it that way:
 *
 *   - the path is normalised first, so a tampered `image` value cannot reach a
 *     file outside the upload area;
 *   - only real images go in — the bytes are checked, not just the extension;
 *   - a file **shared by several students** is skipped, because that is a
 *     placeholder rather than anybody's photograph.
 */

const ALLOWED = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);

/** The file's real type from its first bytes — never from its name. */
function imageKind(bytes: Buffer): string | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }
  if (bytes.subarray(0, 6).toString('latin1').startsWith('GIF8')) return 'gif';
  if (
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

export async function GET(request: NextRequest) {
  // Super admins only: admin/export_photos.php is not on orbit_branch_admin_allowed_scripts(),
  // and this export is not narrowed by branch.
  const gate = await guardOr403(requireSuperAdmin);
  if (!gate.ok) return gate.response;
  const lang = await getLang();
  const back = '/admin/reports?report=students';

  const students = await prisma.student
    .findMany({
      where: { NOT: { image: '' } },
      orderBy: { id: 'asc' },
      select: { id: true, student_id_no: true, name: true, image: true },
    })
    .catch(() => null);

  if (students === null) {
    return NextResponse.json({ error: translate(lang, 'arep.photos_failed') }, { status: 500 });
  }

  // Count how many students point at each file before reading anything: a
  // shared placeholder is not a photo of any of them.
  const uses = new Map<string, number>();
  const paths = new Map<number, string>();
  for (const student of students) {
    const path = normaliseStoredPath(student.image);
    if (path === '') continue;
    const extension = path.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED.has(extension)) continue;
    paths.set(student.id, path);
    uses.set(path, (uses.get(path) ?? 0) + 1);
  }

  const entries: ZipEntry[] = [];
  const taken = new Set<string>();

  for (const student of students) {
    const path = paths.get(student.id);
    if (path === undefined || uses.get(path) !== 1) continue;

    const bytes = await getFile(path);
    if (!bytes) continue;

    const kind = imageKind(bytes);
    if (kind === null) continue;

    const code = studentCode(student.student_id_no, student.id).replace(/[^A-Za-z0-9_-]+/g, '_');
    const slug = student.name.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
    const base = slug !== '' ? `${code}_${slug}` : code;

    let name = `${base}.${kind}`;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base}_${n}.${kind}`;
    taken.add(name.toLowerCase());

    entries.push({ name, content: bytes });
  }

  if (entries.length === 0) {
    const url = new URL(back, request.nextUrl.origin);
    url.searchParams.set('error', translate(lang, 'arep.photos_none'));
    return NextResponse.redirect(url, 303);
  }

  const zip = makeZip(entries);
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);

  return new NextResponse(new Uint8Array(zip), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="student_photos_${stamp}.zip"`,
      'Content-Length': String(zip.length),
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
