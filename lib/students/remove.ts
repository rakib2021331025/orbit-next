import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { requireRecordBranch } from '@/lib/auth/guards';
import { deleteFile } from '@/lib/storage/store';
import { normaliseStoredPath } from '@/lib/storage/url';

/**
 * Removing a student record, from admin/delete.php.
 *
 * **A student with any history is not deleted.** Deleting the row cascades to
 * attendance, enrolments, results, exam attempts, submissions and the login, and
 * the database refuses it outright while payments exist. So the check comes first
 * and the admin is told exactly what is linked; the answer for a student who has
 * left is Inactive, not deleted.
 *
 * Only a record with no history at all — a duplicate entered by mistake — can be
 * removed. That is the entire purpose of this file.
 */

export interface RemoveOutcome {
  ok: boolean;
  /** A translation key. */
  message: string;
  vars?: Record<string, string | number>;
  /** What still points at the student, by translation key suffix. */
  links?: Record<string, number>;
}

/** Everything that would be lost with the student, or that blocks the delete. */
export async function studentLinks(studentId: number): Promise<Record<string, number>> {
  const [payments, enrollments, attendance, results, attempts, submissions, login, applications] =
    await Promise.all([
      prisma.payment.count({ where: { student_id: studentId } }).catch(() => 0),
      prisma.enrollment.count({ where: { student_id: studentId } }).catch(() => 0),
      prisma.attendance.count({ where: { student_id: studentId } }).catch(() => 0),
      prisma.examResult.count({ where: { student_id: studentId } }).catch(() => 0),
      prisma.examAttempt.count({ where: { student_id: studentId } }).catch(() => 0),
      prisma.assignmentSubmission.count({ where: { student_id: studentId } }).catch(() => 0),
      prisma.studentLogin.count({ where: { student_id: studentId } }).catch(() => 0),
      prisma.admission
        .count({
          where: { OR: [{ student_id: studentId }, { applicant_student_id: studentId }] },
        })
        .catch(() => 0),
    ]);

  const counts: Record<string, number> = {
    payments,
    enrollments,
    attendance,
    results,
    attempts,
    submissions,
    login,
    applications,
  };

  // Only what actually exists, so the message lists real things.
  return Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 0));
}

export async function removeStudent(studentId: number): Promise<RemoveOutcome> {
  if (!Number.isInteger(studentId) || studentId <= 0) {
    return { ok: false, message: 'alg.not_found' };
  }

  const student = await prisma.student
    .findUnique({ where: { id: studentId }, select: { id: true, name: true, image: true } })
    .catch(() => null);
  if (!student) return { ok: false, message: 'alg.not_found' };

  await requireRecordBranch('students', studentId, false);

  const links = await studentLinks(studentId);
  if (Object.keys(links).length > 0) {
    return { ok: false, message: 'alg.delete_blocked', vars: { name: student.name }, links };
  }

  try {
    await prisma.student.delete({ where: { id: studentId } });
  } catch {
    // The database's own foreign keys are the backstop: a payment saved between
    // the check and here makes this fail, and failing is the right outcome.
    return { ok: false, message: 'error.generic' };
  }

  // The row is gone — now the photo, but only an upload that nothing else uses.
  // An approved applicant's student photo IS the application photo, so deleting
  // it here would blank the application too.
  const stored = normaliseStoredPath(student.image);
  if (stored.startsWith('uploads/')) {
    try {
      const [alsoStudents, alsoAdmissions] = await Promise.all([
        prisma.student.count({ where: { image: student.image } }),
        prisma.admission.count({ where: { photo: student.image } }),
      ]);
      if (alsoStudents + alsoAdmissions === 0) await deleteFile(stored);
    } catch {
      // Keep the file rather than risk removing one still in use.
    }
  }

  return { ok: true, message: 'alg.deleted', vars: { name: student.name } };
}
