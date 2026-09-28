'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin, requireRecordBranch } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/prisma';
import { getLang, translate } from '@/lib/i18n';
import { contentBranchId } from '@/lib/branch/assign';
import {
  validateUpload,
  uniqueFilename,
  IMAGE_EXTENSIONS,
  DOCUMENT_EXTENSIONS,
} from '@/lib/storage/validate';
import { putFile, deleteFile } from '@/lib/storage/store';
import { normaliseStoredPath } from '@/lib/storage/url';
import { audienceOptions, courseAllowed, batchAllowed } from '@/lib/content/audience';

/**
 * Assignments, from admin/assignments_management.php.
 *
 * Same audience rule as study materials — course **or** batch name, matched
 * against the student's own — plus a due date, which the student portal uses to
 * decide whether a submission is late.
 *
 * Deleting an assignment takes its submissions with it (the foreign key
 * cascades), which is why the confirmation says so.
 */

export interface AssignmentState {
  error: string;
  message: string;
}

const MAX_MB = 20;

function refresh(): void {
  revalidatePath('/admin/assignments');
  revalidatePath('/student/assignments');
}

/** Only ever removes a file inside the assignments folder. */
async function removeBrief(path: string | null | undefined): Promise<void> {
  const clean = normaliseStoredPath(path);
  if (clean.startsWith('uploads/assignments/')) await deleteFile(clean);
}

export async function saveAssignmentAction(
  _prev: AssignmentState,
  formData: FormData
): Promise<AssignmentState> {
  const admin = await requireAdmin();
  const lang = await getLang();

  const id = Number(formData.get('id') ?? 0);
  let existing: { id: number; file_path: string | null } | null = null;

  if (id > 0) {
    existing = await prisma.assignment
      .findUnique({ where: { id }, select: { id: true, file_path: true } })
      .catch(() => null);
    if (!existing) return { error: translate(lang, 'error.not_found_body'), message: '' };
    await requireRecordBranch('assignments', id, false);
  }

  const title = String(formData.get('title') ?? '').trim().slice(0, 255);
  const description = String(formData.get('description') ?? '').trim().slice(0, 20000);
  const course = String(formData.get('course') ?? '').trim();
  const batch = String(formData.get('batch') ?? '').trim();
  const dueDate = String(formData.get('due_date') ?? '').trim();

  if (title === '') return { error: translate(lang, 'aasg.err_title'), message: '' };
  if (description === '') return { error: translate(lang, 'aasg.err_description'), message: '' };

  const options = await audienceOptions([course], [batch]);
  if (!courseAllowed(options, course)) {
    return { error: translate(lang, 'aasg.err_course'), message: '' };
  }
  if (!batchAllowed(options, batch)) {
    return { error: translate(lang, 'aasg.err_batch'), message: '' };
  }

  // A real calendar date: the portal compares it with today to mark work late.
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate);
  const probe = match
    ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
    : null;
  if (
    !match ||
    !probe ||
    probe.getUTCMonth() !== Number(match[2]) - 1 ||
    probe.getUTCDate() !== Number(match[3])
  ) {
    return { error: translate(lang, 'aasg.err_due'), message: '' };
  }

  const upload = formData.get('file');
  let newPath: string | null = null;

  if (upload instanceof File && upload.size > 0) {
    const check = await validateUpload(
      upload,
      [...DOCUMENT_EXTENSIONS, ...IMAGE_EXTENSIONS],
      MAX_MB * 1048576
    );
    if (!check.ok) {
      return { error: `${translate(lang, 'aasg.attachment')}: ${check.error}`, message: '' };
    }

    const stored = await putFile(
      'uploads/assignments',
      uniqueFilename(check.ext, 'assignment'),
      check.bytes ?? Buffer.alloc(0),
      check.mime
    );
    if (stored === null) return { error: translate(lang, 'upload.save_failed'), message: '' };
    newPath = stored;
  }

  const removeExisting = formData.get('remove_file') !== null;
  const filePath = newPath ?? (removeExisting ? null : (existing?.file_path ?? null));

  const data = {
    title,
    description,
    course,
    batch: batch !== '' ? batch : null,
    due_date: probe,
    file_path: filePath,
    branch_id: await contentBranchId(formData.get('branch_id')),
  };

  try {
    if (id > 0) await prisma.assignment.update({ where: { id }, data });
    else await prisma.assignment.create({ data: { ...data, created_by: admin.id } });
  } catch {
    if (newPath) await removeBrief(newPath);
    return { error: translate(lang, 'error.generic'), message: '' };
  }

  // The old brief goes only once the row points somewhere else.
  if (existing?.file_path && existing.file_path !== filePath) {
    await removeBrief(existing.file_path);
  }

  refresh();
  return {
    error: '',
    message: translate(lang, id > 0 ? 'aasg.updated' : 'aasg.created', { title }),
  };
}

export async function deleteAssignmentAction(
  _prev: AssignmentState,
  formData: FormData
): Promise<AssignmentState> {
  await requireAdmin();
  const lang = await getLang();

  const id = Number(formData.get('id') ?? 0);
  const assignment = await prisma.assignment
    .findUnique({ where: { id }, select: { id: true, title: true, file_path: true } })
    .catch(() => null);
  if (!assignment) return { error: translate(lang, 'error.not_found_body'), message: '' };

  await requireRecordBranch('assignments', id, false);

  // The students' own submitted files, gathered before the rows cascade away.
  const submissions = await prisma.assignmentSubmission
    .findMany({ where: { assignment_id: id }, select: { file_path: true } })
    .catch(() => []);

  try {
    await prisma.assignment.delete({ where: { id } });
  } catch {
    return { error: translate(lang, 'error.generic'), message: '' };
  }

  await removeBrief(assignment.file_path);
  for (const submission of submissions) {
    const clean = normaliseStoredPath(submission.file_path);
    if (clean.startsWith('uploads/submissions/')) await deleteFile(clean);
  }

  refresh();
  return { error: '', message: translate(lang, 'aasg.deleted', { title: assignment.title }) };
}
