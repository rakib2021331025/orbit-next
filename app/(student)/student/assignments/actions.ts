'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db/prisma';
import { requireStudentUnlocked } from '@/lib/auth/guards';
import { getTranslator } from '@/lib/i18n';
import { studentScope, scopeWhere } from '@/lib/student/scope';
import { validateUpload, uniqueFilename } from '@/lib/storage/validate';
import { putFile, deleteFile } from '@/lib/storage/store';
import { throttleStatus, throttleHit } from '@/lib/security/throttle';

export interface SubmitState {
  error: string;
  done: '' | 'submitted' | 'replaced';
}


/** What a student may upload as an answer. */
const ANSWER_EXTENSIONS = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'zip'] as const;
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Uploads per student per hour. Not in assignments.php; added because every
 * accepted upload is a storage write of up to 10 MB. A replace is a normal thing
 * to do a few times, so the ceiling is far above that. Uploads are rare enough
 * that the DB-backed throttle's two queries are no burden.
 */
const UPLOADS_PER_HOUR = 30;

/**
 * A student submits or replaces an assignment answer.
 *
 * Three checks, in this order, and the order matters:
 *
 *   1. **The assignment must be inside the student's own scope.** Checked by
 *      re-running the audience filter with the id, not by trusting the id. A
 *      student who edits the hidden field to another batch's assignment is told
 *      it is not theirs.
 *   2. **A marked submission is frozen.** Once a teacher has entered marks the
 *      file cannot be swapped — otherwise a student could replace the work after
 *      seeing the grade.
 *   3. **Late is allowed but recorded.** The original lets a student submit after
 *      the due date and shows it as late rather than refusing: a late answer is
 *      still worth having, and the teacher decides what it is worth.
 */
export async function submitAssignmentAction(
  _prev: SubmitState,
  formData: FormData
): Promise<SubmitState> {
  const student = await requireStudentUnlocked();
  const { t } = await getTranslator();

  const rawId = String(formData.get('assignment_id') ?? '');
  const assignmentId = /^\d{1,10}$/.test(rawId) ? Number(rawId) : 0;
  if (assignmentId <= 0) {
    return { done: '', error: t('student.assign.sub_not_found') };
  }

  // 1. Is this assignment addressed to this student?
  const scope = await studentScope(student);
  const audience = scopeWhere(scope);
  if (audience === null) {
    return { done: '', error: t('student.assign.sub_not_found') };
  }

  let assignment: { id: number } | null = null;
  try {
    assignment = await prisma.assignment.findFirst({
      where: { AND: [{ id: assignmentId }, audience] },
      select: { id: true },
    });
  } catch {
    return { done: '', error: t('error.generic') };
  }
  if (!assignment) {
    return { done: '', error: t('student.assign.sub_not_found') };
  }

  // 2. An already-marked submission cannot be changed.
  let existing: { id: number; marks: unknown; file_path: string } | null = null;
  try {
    existing = await prisma.assignmentSubmission.findFirst({
      where: { assignment_id: assignmentId, student_id: student.id },
      select: { id: true, marks: true, file_path: true },
    });
  } catch {
    existing = null;
  }
  if (existing && existing.marks !== null) {
    return { done: '', error: t('student.assign.sub_marked') };
  }

  // Keyed to the account, in its own scope with no IP ceiling: a whole class
  // uploading from the centre's Wi-Fi shares one address.
  const limit = await throttleStatus('assignment_upload', student.id, UPLOADS_PER_HOUR, Number.MAX_SAFE_INTEGER, 60);
  if (limit.locked) return { done: '', error: t('ai.err.rate') };

  const file = formData.get('answer');
  const check = await validateUpload(file instanceof File ? file : null, ANSWER_EXTENSIONS, MAX_BYTES);
  if (!check.ok || !check.bytes) {
    return { done: '', error: check.error };
  }

  const stored = await putFile(
    'uploads/submissions',
    uniqueFilename(check.ext, `asg${assignmentId}`),
    check.bytes,
    check.mime || undefined
  );
  if (!stored) {
    return { done: '', error: t('upload.save_failed') };
  }
  await throttleHit('assignment_upload', student.id);

  try {
    if (existing) {
      await prisma.assignmentSubmission.update({
        where: { id: existing.id },
        data: { file_path: stored, submitted_at: new Date() },
      });
      // The replaced file is removed only after the row points at the new one,
      // so a failure here never leaves a submission with no file.
      if (existing.file_path !== stored) await deleteFile(existing.file_path);
    } else {
      await prisma.assignmentSubmission.create({
        data: {
          assignment_id: assignmentId,
          student_id: student.id,
          file_path: stored,
          submitted_at: new Date(),
        },
      });
    }
  } catch {
    return { done: '', error: t('error.generic') };
  }

  revalidatePath('/student/assignments');
  return { done: existing ? 'replaced' : 'submitted', error: '' };
}
