import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { readSession } from '@/lib/auth/session';
import { signedUrl } from '@/lib/storage/store';
import { storedPathFor } from '@/lib/storage/buckets';
import { normaliseStoredPath } from '@/lib/storage/url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A private file referenced by PATH — study material, notes, exam and assignment
 * briefs, exam answer and submission files.
 *
 *   /api/files/<bucket>/<key>   → 302 to a short-lived signed Storage URL
 *
 * The bytes never pass through here: this checks who is asking and hands the
 * browser a signed link, and the file comes from the Storage CDN. The redirect
 * itself is cached privately for ten minutes, so opening the same PDF again does
 * not repeat the check.
 *
 * Who may open what:
 *   documents                 anyone signed in (the PHP app served these publicly;
 *                             a session is strictly more than it asked)
 *   student-files/submissions staff, or the student the file belongs to
 *   anything else             not here — photos and payment slips are addressed
 *                             by record id through /api/media, which knows whose
 *                             they are.
 *
 * Every refusal is a 404, never a 403, so a path's existence is not confirmed.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bucket: string; key: string[] }> }
) {
  const { bucket, key: parts } = await params;
  const notFound = () => new NextResponse('Not found.', { status: 404 });

  const session = await readSession();
  if (!session) return notFound();

  const key = parts.map((part) => decodeURIComponent(part)).join('/');
  if (bucket !== 'documents' && bucket !== 'student-files') return notFound();

  const path = normaliseStoredPath(storedPathFor(bucket, key));
  if (path === '') return notFound();

  if (bucket === 'student-files') {
    if (!key.startsWith('submissions/')) return notFound();
    if (session.role === 'guardian') return notFound();
    if (session.role === 'student' && !(await studentOwns(session.uid, path))) return notFound();
  }

  const download = request.nextUrl.searchParams.get('download') === '1';
  const url = await signedUrl(path, download ? key.split('/').pop() : undefined);
  if (!url) return notFound();

  return NextResponse.redirect(url, {
    status: 302,
    headers: { 'Cache-Control': 'private, max-age=600', 'Referrer-Policy': 'no-referrer' },
  });
}

/** An exam answer file or assignment submission that is this student's own. */
async function studentOwns(studentId: number, path: string): Promise<boolean> {
  try {
    const [answer, submission] = await Promise.all([
      prisma.examAnswerFile.findFirst({
        where: { file_path: path, attempt: { student_id: studentId } },
        select: { id: true },
      }),
      prisma.assignmentSubmission.findFirst({
        where: { file_path: path, student_id: studentId },
        select: { id: true },
      }),
    ]);
    return answer !== null || submission !== null;
  } catch {
    return false;
  }
}
