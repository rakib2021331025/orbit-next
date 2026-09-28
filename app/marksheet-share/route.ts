import { NextResponse, type NextRequest } from 'next/server';
import { getLang, isLang, translate, type Lang } from '@/lib/i18n';
import { monthlyExam } from '@/lib/results/exam';
import { marksheetPdf } from '@/lib/pdf/marksheet';
import { pdfHeaders } from '@/lib/pdf/doc';
import { verifyToken } from '@/lib/security/token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A marksheet shared over WhatsApp, from marksheet_share.php.
 *
 *   /marksheet-share?t=<token>
 *
 * The token — signed by `signToken('marksheet', { e, s, l }, 7 days)` on the
 * student's or guardian's marksheet page — IS the authorisation: whoever holds an
 * unexpired, untampered link may open that one marksheet, and nothing else. The
 * exam and student ids are inside the signature, so they cannot be edited, and
 * the exam must STILL be published — unpublishing it kills every link.
 */
export async function GET(request: NextRequest) {
  const payload = verifyToken('marksheet', request.nextUrl.searchParams.get('t'));
  const examId = Number(payload?.e ?? 0);
  const studentId = Number(payload?.s ?? 0);

  const exam = payload ? await monthlyExam(examId) : null;
  const lang: Lang = isLang(payload?.l) ? (payload!.l as Lang) : await getLang();

  const sheet =
    exam && exam.status === 'published' && Number.isInteger(studentId) && studentId > 0
      ? await marksheetPdf(exam, studentId, lang)
      : null;

  if (!sheet) {
    return new NextResponse(translate(lang, 'ms.link_expired'), {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Robots-Tag': 'noindex, nofollow',
        'Referrer-Policy': 'no-referrer',
        'Cache-Control': 'private, no-store',
      },
    });
  }

  return new NextResponse(new Uint8Array(sheet.bytes), {
    headers: {
      ...pdfHeaders(sheet.filename, sheet.bytes.length, 'inline'),
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
