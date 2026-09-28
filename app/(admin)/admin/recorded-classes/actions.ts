'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin, requireRecordBranch } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/prisma';
import { getLang, translate } from '@/lib/i18n';
import { contentBranchId } from '@/lib/branch/assign';
import { driveFileId } from '@/lib/recordings/drive';
import { cleanDate, dateValue } from '@/lib/classes/data';
import { audienceOptions, courseAllowed, batchAllowed } from '@/lib/content/audience';

/**
 * Recorded classes, from admin/recorded_classes.php.
 *
 * The video itself lives in Google Drive; only its **file id** is stored, and
 * `driveFileId()` accepts either a bare id or any of the share-link shapes,
 * because what an admin has on the clipboard is a link, not an id.
 *
 * Course and batch are stored as names, as everywhere else, so the student
 * portal's audience rule finds them.
 */

export interface RecordingState {
  error: string;
  message: string;
}

function refresh(): void {
  revalidatePath('/admin/recorded-classes');
  revalidatePath('/student/recordings');
}

export async function saveRecordingAction(
  _prev: RecordingState,
  formData: FormData
): Promise<RecordingState> {
  const admin = await requireAdmin();
  const lang = await getLang();

  const id = Number(formData.get('id') ?? 0);
  if (id > 0) {
    const before = await prisma.recordedClass
      .findUnique({ where: { id }, select: { id: true } })
      .catch(() => null);
    if (!before) return { error: translate(lang, 'error.generic'), message: '' };
    await requireRecordBranch('recorded_classes', id, false);
  }

  const title = String(formData.get('title') ?? '').trim().slice(0, 255);
  const driveInput = String(formData.get('drive_file_id') ?? '').trim();
  const driveId = driveFileId(driveInput);

  if (title === '') return { error: translate(lang, 'rec.err.title'), message: '' };
  if (driveInput === '') return { error: translate(lang, 'rec.err.drive_missing'), message: '' };
  if (driveId === '') return { error: translate(lang, 'rec.err.drive_invalid'), message: '' };

  const course = String(formData.get('course') ?? '').trim();
  const batch = String(formData.get('batch') ?? '').trim();

  const options = await audienceOptions([course], [batch]);
  if (!courseAllowed(options, course)) {
    return { error: translate(lang, 'lcl.err.course'), message: '' };
  }
  if (!batchAllowed(options, batch)) {
    return { error: translate(lang, 'lcl.err.batch'), message: '' };
  }

  // A teacher is optional, but a teacher id that names nobody is a mistake
  // rather than "unassigned".
  const teacherId = Number(formData.get('teacher_id') ?? 0);
  let teacherName: string | null = null;
  if (teacherId > 0) {
    const teacher = await prisma.teacher
      .findUnique({ where: { id: teacherId }, select: { name: true } })
      .catch(() => null);
    if (!teacher) return { error: translate(lang, 'rec.err.teacher'), message: '' };
    teacherName = teacher.name;
  }

  const classDate = cleanDate(String(formData.get('class_date') ?? ''));
  const durationRaw = Number(formData.get('duration_minutes') ?? 0) || 0;
  const duration = durationRaw > 0 && durationRaw <= 1000 ? durationRaw : null;

  const data = {
    title,
    description: String(formData.get('description') ?? '').trim().slice(0, 4000) || null,
    subject: String(formData.get('subject') ?? '').trim().slice(0, 150) || null,
    course: course !== '' ? course : null,
    batch: batch !== '' ? batch : null,
    branch_id: await contentBranchId(formData.get('branch_id')),
    teacher_id: teacherId > 0 ? teacherId : null,
    teacher_name: teacherName,
    class_date: classDate !== null ? dateValue(classDate) : null,
    duration_minutes: duration,
    drive_file_id: driveId,
    status: formData.get('status') === 'published' ? ('published' as const) : ('draft' as const),
  };

  try {
    if (id > 0) await prisma.recordedClass.update({ where: { id }, data });
    else await prisma.recordedClass.create({ data: { ...data, created_by: admin.id } });
  } catch {
    return { error: translate(lang, 'error.generic'), message: '' };
  }

  refresh();
  return { error: '', message: translate(lang, id > 0 ? 'rec.saved' : 'rec.added') };
}

export async function toggleRecordingAction(
  _prev: RecordingState,
  formData: FormData
): Promise<RecordingState> {
  await requireAdmin();
  const lang = await getLang();

  const id = Number(formData.get('id') ?? 0);
  const recording = await prisma.recordedClass
    .findUnique({ where: { id }, select: { id: true, status: true } })
    .catch(() => null);
  if (!recording) return { error: translate(lang, 'error.generic'), message: '' };

  await requireRecordBranch('recorded_classes', id, false);

  // Draft is how a recording is kept back until it is ready to be watched.
  const next = recording.status === 'published' ? 'draft' : 'published';
  try {
    await prisma.recordedClass.update({ where: { id }, data: { status: next } });
  } catch {
    return { error: translate(lang, 'error.generic'), message: '' };
  }

  refresh();
  return { error: '', message: translate(lang, 'rec.status_changed') };
}

export async function deleteRecordingAction(
  _prev: RecordingState,
  formData: FormData
): Promise<RecordingState> {
  await requireAdmin();
  const lang = await getLang();

  const id = Number(formData.get('id') ?? 0);
  const recording = await prisma.recordedClass
    .findUnique({ where: { id }, select: { id: true } })
    .catch(() => null);
  if (!recording) return { error: translate(lang, 'error.generic'), message: '' };

  await requireRecordBranch('recorded_classes', id, false);

  try {
    // Only the row: the video itself belongs to the institute's Drive.
    await prisma.recordedClass.delete({ where: { id } });
  } catch {
    return { error: translate(lang, 'error.generic'), message: '' };
  }

  refresh();
  return { error: '', message: translate(lang, 'rec.deleted') };
}
