import { NextResponse, type NextRequest } from 'next/server';
import { notFound } from 'next/navigation';
import { currentUser, guardianChildren, requireAdmin, requireRecordBranch } from '@/lib/auth/guards';
import { getLang, isLang, type Lang } from '@/lib/i18n';
import { duesFilters, duesRows } from '@/lib/fees/dues';
import { feeSlipPdf, slipStudent, studentFeeSummary } from '@/lib/fees/slip';
import { pdfHeaders } from '@/lib/pdf/doc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** At most this many slips in one PDF, as fee_slip.php pages its bulk mode. */
const BULK_PAGE = 50;

/**
 * Due slips as a PDF, from fee_slip.php.
 *
 *   /fee-slip?student=<id>[&mode=download|print][&lang=bn|en]
 *   /fee-slip?bulk=1[&course=&batch=&overdue=1&q=][&page=N]      admin only
 *
 * Who may open a slip: an admin (inside their branch); the signed-in student for
 * themselves; a guardian for an ACTIVE child linked to their account. Everyone
 * else gets a 404, never a 403, so a slip's existence is not confirmed.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const digits = (key: string) => (/^\d+$/.test(params.get(key) ?? '') ? Number(params.get(key)) : 0);

  const user = await currentUser();
  if (!user) notFound();

  const asked = params.get('lang');
  const lang: Lang = isLang(asked) ? asked : await getLang();
  const inline = ['print', 'view', 'inline'].includes(params.get('mode') ?? '');

  let ids: number[] = [];
  let filename = '';

  if (params.get('bulk')) {
    if (user.role !== 'admin') notFound();
    await requireAdmin();
    const page = Math.max(1, digits('page'));
    const query: Record<string, string | undefined> = Object.fromEntries(params.entries());
    // duesRows() applies the admin's branch itself.
    const rows = await duesRows(duesFilters(query));
    ids = rows.slice((page - 1) * BULK_PAGE, page * BULK_PAGE).map((row) => row.studentId);
    filename = `Due-slips-${new Date().toISOString().slice(0, 10)}${page > 1 ? `-${page}` : ''}`;
  } else {
    const sid = digits('student');
    if (sid === 0) notFound();

    if (user.role === 'admin') {
      await requireAdmin();
      try {
        await requireRecordBranch('students', sid);
      } catch {
        notFound();
      }
    } else if (user.role === 'student') {
      if (user.uid !== sid) notFound();
    } else if (user.role === 'guardian') {
      const children = await guardianChildren(user.uid).catch(() => []);
      if (!children.some((child) => child.id === sid)) notFound();
    } else {
      notFound();
    }
    ids = [sid];
  }

  const docs = [];
  for (const id of ids) {
    const student = await slipStudent(id, lang);
    if (student) docs.push({ student, summary: await studentFeeSummary(id, lang) });
  }
  if (docs.length === 0) notFound();

  if (filename === '') filename = `Due-slip-${docs[0].student.displayId}`;

  const bytes = await feeSlipPdf(docs, lang);
  return new NextResponse(new Uint8Array(bytes), {
    headers: pdfHeaders(`${filename}.pdf`, bytes.length, inline ? 'inline' : 'download'),
  });
}
