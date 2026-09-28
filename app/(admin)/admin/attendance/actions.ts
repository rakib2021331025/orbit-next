'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/prisma';
import { getLang, translate } from '@/lib/i18n';
import { toLocalDigits, formatDate } from '@/lib/i18n/format';
import {
  batchRoster,
  unbatchedRoster,
  saveRegister,
  attendanceBatches,
} from '@/lib/attendance/register';
import { notifyAbsent } from '@/lib/attendance/notify';
import { emptyRegisterState } from './state';

/**
 * Saving a class register, from admin/attendance.php.
 *
 * Three refusals, all of them from the original and all of them worth keeping:
 *
 *   - an invalid batch or date
 *   - a **future** date, because attendance is a record of what happened
 *   - an empty roster, because the roster is the allow-list the write is checked
 *     against and without it nothing may be written at all
 *
 * The batch id from the form is looked up in the admin's own batch list, so
 * another branch's batch is not accepted even if its id is correct.
 */

export interface RegisterState {
  error: string;
  message: string;
  notes: string[];
}


export async function saveRegisterAction(
  _prev: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  const admin = await requireAdmin();
  const lang = await getLang();

  const rawBatch = String(formData.get('batch') ?? '');
  const rawDate = String(formData.get('date') ?? '');

  // "0" is a real choice: the register of students who are in no batch.
  const batchId = /^\d+$/.test(rawBatch) ? Number(rawBatch) : -1;
  if (batchId < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    return { ...emptyRegisterState, error: translate(lang, 'att.invalid') };
  }

  const allowedBatches = await attendanceBatches();
  const batchRow = batchId > 0 ? allowedBatches.find((batch) => batch.id === batchId) : null;
  if (batchId > 0 && !batchRow) {
    return { ...emptyRegisterState, error: translate(lang, 'att.invalid') };
  }

  const date = new Date(`${rawDate}T00:00:00.000Z`);
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  if (date.getTime() > todayUtc.getTime()) {
    return { ...emptyRegisterState, error: translate(lang, 'att.future_date') };
  }

  const legacyCourse = batchId === 0 ? String(formData.get('legacy_course') ?? '').trim() : '';
  const roster = batchId > 0 ? await batchRoster(batchId) : await unbatchedRoster(legacyCourse);
  if (roster.length === 0) {
    return { ...emptyRegisterState, error: translate(lang, 'att.no_students') };
  }

  // The course of the register: the batch's, or the one matching the legacy
  // course name, so the record still says which course the class belonged to.
  let courseId: number | null = batchRow?.course_id ?? null;
  if (courseId === null && legacyCourse !== '') {
    const course = await prisma.course
      .findFirst({ where: { name: legacyCourse }, select: { id: true } })
      .catch(() => null);
    courseId = course?.id ?? null;
  }

  const label = String(formData.get('class_label') ?? '').trim();

  const statuses: Record<number, string> = {};
  const notes: Record<number, string> = {};
  for (const [key, value] of formData.entries()) {
    const statusMatch = /^status\[(\d+)\]$/.exec(key);
    if (statusMatch) statuses[Number(statusMatch[1])] = String(value);

    const noteMatch = /^note\[(\d+)\]$/.exec(key);
    if (noteMatch) notes[Number(noteMatch[1])] = String(value);
  }

  let result;
  try {
    result = await saveRegister({
      batchId,
      courseId,
      date,
      classLabel: label,
      statuses,
      notes,
      markedBy: admin.id,
      allowedIds: roster.map((student) => student.id),
    });
  } catch {
    return { ...emptyRegisterState, error: translate(lang, 'error.generic') };
  }

  if (result.saved === 0) {
    return { ...emptyRegisterState, error: translate(lang, 'att.nothing_saved') };
  }

  revalidatePath('/admin/attendance');
  revalidatePath('/admin/attendance-report');
  revalidatePath('/admin');

  const extra: string[] = [];
  if (formData.get('notify_absent') !== null && result.newlyAbsent.length > 0) {
    const className =
      label !== '' ? label : batchRow?.course ? batchRow.course.name : '';
    const notified = await notifyAbsent(result.newlyAbsent, date, className);

    extra.push(
      translate(lang, 'att.notified', { count: toLocalDigits(notified.notified, lang) })
    );
    if (notified.emailFailed > 0) {
      extra.push(
        translate(lang, 'att.email_failed', { count: toLocalDigits(notified.emailFailed, lang) })
      );
    }
  }

  return {
    error: '',
    message: translate(lang, 'att.saved', {
      count: toLocalDigits(result.saved, lang),
      date: formatDate(date, 'd M Y', lang),
    }),
    notes: extra,
  };
}
