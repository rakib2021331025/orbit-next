import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { readSession } from '@/lib/auth/session';
import { getFile, signedUrl } from '@/lib/storage/store';
import { normaliseStoredPath } from '@/lib/storage/url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Authorised access to private uploads — the port of media.php.
 *
 * Two rules make this file the security boundary it is:
 *
 *   1. **The path is never taken from the request.** Only a record id; the path
 *      is read from that record. A caller who can name the file cannot fetch it,
 *      which is what stops `?path=../../config.php` and stops one student
 *      guessing another's photo URL.
 *   2. **Everything unauthorised is a 404, never a 403.** A 403 confirms that
 *      the record exists, which for a payment screenshot or an applicant photo
 *      is itself a disclosure.
 *
 *   /api/media/student-photo/<students.id>
 *   /api/media/applicant-photo/<admissions.id>
 *   /api/media/payment/<admissions.id>[?download=1]
 *   /api/media/submission/<assignment_submissions.id>[?download=1]
 *   /api/media/ai-image/<ai_messages.id>
 *   /api/media/printable/<printable_documents.id>[?size=thumb]
 */

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function notFound(): NextResponse {
  return new NextResponse('Not found.', { status: 404 });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  const { type, id: rawId } = await params;
  const id = /^\d+$/.test(rawId) ? Number(rawId) : 0;
  if (id <= 0) return notFound();

  const session = await readSession();
  const studentId = session?.role === 'student' ? session.uid : 0;
  const isTeacher = session?.role === 'teacher';
  let isAdmin = session?.role === 'admin';
  const download = request.nextUrl.searchParams.get('download') === '1';

  try {
    switch (type) {
      case 'student-photo': {
        // A branch-locked admin only for their own branch's students.
        if (isAdmin && !(await adminMaySeeStudent(id))) isAdmin = false;

        const allowed =
          isAdmin || isTeacher || studentId === id || (await guardianMaySeeStudent(id));
        if (!allowed) return notFound();

        const student = await prisma.student.findUnique({
          where: { id },
          select: { image: true },
        });
        return stream(student?.image, ['uploads', 'images'], `student-${id}`, IMAGE_TYPES, download);
      }

      case 'applicant-photo':
      case 'payment': {
        const admission = await prisma.admission.findUnique({
          where: { id },
          select: {
            photo: true,
            payment_screenshot: true,
            student_id: true,
            applicant_student_id: true,
            branch_id: true,
          },
        });
        if (!admission) return notFound();

        const owner =
          studentId > 0 &&
          (studentId === admission.student_id || studentId === admission.applicant_student_id);

        if (isAdmin && !(await adminMaySeeBranch(admission.branch_id))) isAdmin = false;
        if (!isAdmin && !owner) return notFound();

        return type === 'applicant-photo'
          ? stream(
              admission.photo,
              ['uploads/applicants', 'uploads/students'],
              `applicant-${id}`,
              ['image/jpeg', 'image/png', 'image/webp'],
              download
            )
          : stream(
              admission.payment_screenshot,
              ['uploads/payments'],
              `payment-${id}`,
              ['image/jpeg', 'image/png', 'image/webp'],
              download
            );
      }

      case 'ai-image': {
        // A photo a student attached to an Academic AI question. Only that
        // student — it is their own schoolwork, and no admin page shows these.
        const message = await prisma.aiMessage.findUnique({
          where: { id },
          select: { image_path: true, student_id: true },
        });
        if (!message || studentId <= 0 || studentId !== message.student_id) return notFound();
        return stream(message.image_path, ['uploads/ai'], `question-${id}`, IMAGE_TYPES, false);
      }

      case 'submission': {
        const submission = await prisma.assignmentSubmission.findUnique({
          where: { id },
          select: { file_path: true, student_id: true, student: { select: { branch_id: true } } },
        });
        if (!submission) return notFound();

        if (isAdmin && !(await adminMaySeeBranch(submission.student.branch_id))) isAdmin = false;
        if (!isAdmin && studentId !== submission.student_id) return notFound();

        return stream(
          submission.file_path,
          ['uploads/submissions', 'uploads/assignments'],
          `submission-${id}`,
          [
            'application/pdf',
            'image/jpeg',
            'image/png',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/zip',
            'application/octet-stream',
          ],
          download
        );
      }

      case 'printable': {
        // Admins only, as orbit_printable_can_view() decides today.
        if (!isAdmin) return notFound();
        const doc = await prisma.printableDocument.findUnique({
          where: { id },
          select: { image_path: true, thumb_path: true },
        });
        if (!doc) return notFound();

        const wantThumb = request.nextUrl.searchParams.get('size') === 'thumb';
        const path = wantThumb && doc.thumb_path ? doc.thumb_path : doc.image_path;
        return stream(path, ['uploads/printables'], `printable-${id}`, ['image/jpeg', 'image/png', 'image/webp'], download);
      }

      default:
        return notFound();
    }
  } catch {
    // A database that is not configured yet must not leak a stack trace.
    return notFound();
  }
}

/* ------------------------------------------------------------- streaming */

async function stream(
  storedPath: string | null | undefined,
  allowedDirs: string[],
  filename: string,
  allowedTypes: string[],
  asAttachment: boolean
): Promise<NextResponse> {
  const path = normaliseStoredPath(storedPath);
  // Containment check: the stored path must sit inside one of the folders this
  // media type is allowed to serve from, so a bad row cannot redirect the read.
  if (path === '' || !allowedDirs.some((dir) => path.startsWith(`${dir}/`))) return notFound();

  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const contentType = mimeFor(ext);
  if (!allowedTypes.includes(contentType)) return notFound();

  // Supabase Storage: the reader is authorised above, so hand the browser a
  // short signed link and let the file come from the Storage CDN — the bytes do
  // not pass through this function. The redirect is cached privately so a page
  // showing the same photo twice checks once.
  const signed = await signedUrl(path, asAttachment ? `${filename}.${ext}` : undefined);
  if (signed) {
    return NextResponse.redirect(signed, {
      status: 302,
      headers: { 'Cache-Control': 'private, max-age=600', 'Referrer-Policy': 'no-referrer' },
    });
  }

  const bytes = await getFile(path);
  if (!bytes) return notFound();

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(bytes.length),
      'Content-Disposition': `${asAttachment ? 'attachment' : 'inline'}; filename="${filename}.${ext}"`,
      // Private: a shared proxy must not cache one student's photo and serve it
      // to the next person who asks for the same URL.
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function mimeFor(ext: string): string {
  const types: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    zip: 'application/zip',
  };
  return types[ext] ?? 'application/octet-stream';
}

/* --------------------------------------------------------- authorisation */

/** A guardian may see an ACTIVE child linked to their active, unlocked account. */
async function guardianMaySeeStudent(studentId: number): Promise<boolean> {
  const session = await readSession();
  if (session?.role !== 'guardian' || studentId <= 0) return false;

  try {
    const link = await prisma.guardianStudent.findFirst({
      where: {
        guardian_id: session.uid,
        student_id: studentId,
        // A guardian still on their temporary password has not proved they are
        // the account holder, so they see nothing private yet.
        guardian: { status: 'active', must_change_password: false },
        student: { student_status: 'Active' },
      },
      select: { id: true },
    });
    return link !== null;
  } catch {
    return false;
  }
}

/** A branch-locked admin only sees their own branch's records. */
async function adminMaySeeBranch(branchId: number | null): Promise<boolean> {
  const session = await readSession();
  if (session?.role !== 'admin') return false;

  try {
    const admin = await prisma.admin.findFirst({
      where: { id: session.uid, status: 'active' },
      select: { role: true, branch_id: true },
    });
    if (!admin) return false;
    if (admin.role !== 'branch_admin') return true;
    if (!admin.branch_id) return false;
    // A record with no branch is shared by all branches.
    return branchId === null || branchId === admin.branch_id;
  } catch {
    return false;
  }
}

async function adminMaySeeStudent(studentId: number): Promise<boolean> {
  try {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { branch_id: true },
    });
    return student ? adminMaySeeBranch(student.branch_id) : false;
  } catch {
    return false;
  }
}
