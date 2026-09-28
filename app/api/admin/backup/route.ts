import { NextResponse, type NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { guardOr403 } from '@/lib/security/api';
import { getLang, translate } from '@/lib/i18n';
import { readBackup, safeBackupName } from '@/lib/backup/dump';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Downloading one backup, from the `?download=` branch of admin/backup.php.
 *
 * Backups have **no public URL**: they are streamed by this admin-only route
 * from a folder outside `public/`. The file name is matched against the exact
 * pattern a backup carries, so nothing else can be asked for.
 *
 * **Super admins only.** admin/backup.php is not on
 * orbit_branch_admin_allowed_scripts(), and a dump holds every branch's
 * students and money — the /admin/backup page is closed to a branch admin by
 * AdminPage, and this download must be too.
 */
export async function GET(request: NextRequest) {
  const gate = await guardOr403(requireSuperAdmin);
  if (!gate.ok) return gate.response;
  const lang = await getLang();

  const name = safeBackupName(request.nextUrl.searchParams.get('file'));
  if (name === '') {
    return NextResponse.json({ error: translate(lang, 'bak.not_found') }, { status: 400 });
  }

  const bytes = await readBackup(name);
  if (bytes === null) {
    return NextResponse.json({ error: translate(lang, 'bak.not_found') }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/sql; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
