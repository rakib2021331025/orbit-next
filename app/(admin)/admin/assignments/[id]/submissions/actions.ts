'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin, requireRecordBranch } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/prisma';
import { getLang, translate } from '@/lib/i18n';

/**
 * Marking one submission, from admin/assignment_submissions.php.
 *
 * Marks go in the real `marks` column (0–999.99); **an empty field clears them**
 * rather than storing zero, because "not marked yet" and "scored nothing" are
 * different things and the student's page shows them differently.
 *
 * Bangla digits are accepted, because an admin typing marks on a Bangla keyboard
 * should not have to switch.
 */

export interface GradeState {
  error: string;
  message: string;
}

const BANGLA_DIGITS: Record<string, string> = {
  '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
  '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9',
};

export async function gradeSubmissionAction(
  _prev: GradeState,
  formData: FormData
): Promise<GradeState> {
  await requireAdmin();
  const lang = await getLang();

  const submissionId = Number(formData.get('submission_id') ?? 0);
  const assignmentId = Number(formData.get('assignment_id') ?? 0);

  const submission = await prisma.assignmentSubmission
    .findFirst({
      where: { id: submissionId, assignment_id: assignmentId },
      select: { id: true, student: { select: { name: true, name_bn: true } } },
    })
    .catch(() => null);
  if (!submission) return { error: translate(lang, 'asub.not_found'), message: '' };

  // The submission belongs to a student, and the branch rule follows them.
  await requireRecordBranch('assignment_submissions', submissionId, false);

  const raw = String(formData.get('marks') ?? '')
    .replace(/[০-৯]/g, (digit) => BANGLA_DIGITS[digit] ?? digit)
    .trim();

  let marks: number | null = null;
  if (raw !== '') {
    const value = Number(raw);
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(raw) || Number.isNaN(value) || value < 0 || value > 999.99) {
      return { error: translate(lang, 'asub.err_marks'), message: '' };
    }
    marks = Math.round(value * 100) / 100;
  }

  const feedback = String(formData.get('feedback') ?? '').trim().slice(0, 5000);

  try {
    await prisma.assignmentSubmission.update({
      where: { id: submissionId },
      data: { marks, feedback: feedback !== '' ? feedback : null },
    });
  } catch {
    return { error: translate(lang, 'error.generic'), message: '' };
  }

  revalidatePath(`/admin/assignments/${assignmentId}/submissions`);
  revalidatePath('/student/assignments');

  return {
    error: '',
    message: translate(lang, 'asub.saved', { name: submission.student.name }),
  };
}
