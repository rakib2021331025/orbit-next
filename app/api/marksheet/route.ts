import { NextResponse, type NextRequest } from 'next/server';
import { notFound } from 'next/navigation';
import {
  currentUser,
  guardianChildren,
  requireAdmin,
  requireGuardian,
  requireRecordBranch,
} from '@/lib/auth/guards';
import { getLang, isLang, type Lang } from '@/lib/i18n';
import { monthlyExam } from '@/lib/results/exam';
import { legacyMarksheet } from '@/lib/pdf/legacy-marksheet';
import { marksheetPdf } from '@/lib/pdf/marksheet';
import { pdfHeaders } from '@/lib/pdf/doc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A monthly exam marksheet as a PDF, from admin/marksheet.php and
 * includes/marksheet_lib.php.
 *
 *   /api/marksheet?exam=<id>&student=<id>
 *
 * A student may open only their own, a guardian only an active child's, and an
 * admin any — and a **draft** exam is refused for everybody but staff, because
 * an unpublished result is not a result yet.
 *
 * A student with no marks has no marksheet: the original returns nothing rather
 * than a sheet of dashes.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const examId = /^\d+$/.test(params.get('exam') ?? '') ? Number(params.get('exam')) : 0;
  const askedStudent = /^\d+$/.test(params.get('student') ?? '')
    ? Number(params.get('student'))
    : 0;

  const user = await currentUser();
  if (!user) notFound();

  // A student's own id always wins over whatever the URL asks for.
  const studentId =
    user.role === 'student' ? user.uid : askedStudent > 0 ? askedStudent : 0;
  if (studentId === 0) notFound();

  if (user.role === 'guardian') {
    // The cookie outlives a deactivation; the live row decides.
    await requireGuardian();
    const children = await guardianChildren(user.uid).catch(() => []);
    if (!children.some((child) => child.id === studentId)) notFound();
  }
  if (user.role === 'teacher') notFound();
  if (user.role === 'admin') {
    // A branch admin prints only their own branch's students.
    await requireAdmin();
    try {
      await requireRecordBranch('students', studentId);
    } catch {
      notFound();
    }
  }

  // Results entered before monthly exams existed are grouped by exam NAME, and
  // admin/marksheet.php prints them from the same address.
  if (examId === 0) {
    if (user.role !== 'admin') notFound();
    return legacyMarksheet(request, studentId);
  }

  const exam = await monthlyExam(examId);
  if (!exam) notFound();

  // Only staff see a draft.
  if (exam.status !== 'published' && user.role !== 'admin') notFound();

  const asked = params.get('lang');
  const lang: Lang = isLang(asked) ? asked : await getLang();

  const sheet = await marksheetPdf(exam, studentId, lang);
  if (!sheet) notFound();

  return new NextResponse(new Uint8Array(sheet.bytes), {
    headers: pdfHeaders(
      sheet.filename,
      sheet.bytes.length,
      params.get('format') === 'pdf' ? 'download' : 'inline'
    ),
  });
}
