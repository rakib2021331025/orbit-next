'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin, requireRecordBranch } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/prisma';
import { getLang, translate } from '@/lib/i18n';
import { contentBranchId } from '@/lib/branch/assign';
import { isWeekDay, type WeekDay } from '@/lib/routine/days';

/**
 * The weekly timetable, from admin/class_routine_management.php.
 *
 * **Course and batch are stored as NAMES and the day as the English weekday**
 * ("Saturday"), because the student portal matches a routine row against the
 * student's enrolment by name. Only the interface is translated; storing a
 * translated day would make every Bangla-entered row invisible to the matcher.
 */

export interface RoutineState {
  error: string;
  message: string;
}

/** "9:05", "09:05" or "09:05:00" → a TIME value; anything else → null. */
function parseTime(value: unknown): Date | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(String(value ?? '').trim());
  if (!match) return null;

  const hours = String(Number(match[1])).padStart(2, '0');
  const minutes = match[2];
  const seconds = String(Number(match[3] ?? 0)).padStart(2, '0');
  return new Date(`1970-01-01T${hours}:${minutes}:${seconds}.000Z`);
}

function field(formData: FormData, key: string, max: number): string {
  return String(formData.get(key) ?? '').trim().slice(0, max);
}

function refresh(): void {
  revalidatePath('/admin/routine');
  revalidatePath('/student/routine');
}

export async function saveRoutineAction(
  _prev: RoutineState,
  formData: FormData
): Promise<RoutineState> {
  await requireAdmin();
  const lang = await getLang();

  const id = Number(formData.get('id') ?? 0);
  if (id > 0) {
    const exists = await prisma.classRoutine
      .findUnique({ where: { id }, select: { id: true } })
      .catch(() => null);
    if (!exists) return { error: translate(lang, 'aroutine.not_found'), message: '' };
    await requireRecordBranch('class_routine', id, false);
  }

  const course = field(formData, 'course', 255);
  const batch = field(formData, 'batch', 100);
  const day = field(formData, 'day_of_week', 20);
  const subject = field(formData, 'subject', 255);
  const teacher = field(formData, 'teacher_name', 255);
  const room = field(formData, 'room_number', 50);
  const start = parseTime(formData.get('start_time'));
  const end = parseTime(formData.get('end_time'));

  if (
    course === '' ||
    subject === '' ||
    teacher === '' ||
    !isWeekDay(day) ||
    start === null ||
    end === null
  ) {
    return { error: translate(lang, 'aroutine.required'), message: '' };
  }
  // A class that ends before it starts is a typo, and it would render as a
  // negative-length block on the student's timetable.
  if (end.getTime() <= start.getTime()) {
    return { error: translate(lang, 'aroutine.end_after_start'), message: '' };
  }

  const data = {
    course,
    batch: batch !== '' ? batch : null,
    day_of_week: day as WeekDay,
    start_time: start,
    end_time: end,
    subject,
    teacher_name: teacher,
    room_number: room !== '' ? room : null,
    branch_id: await contentBranchId(formData.get('branch_id')),
  };

  try {
    if (id > 0) await prisma.classRoutine.update({ where: { id }, data });
    else await prisma.classRoutine.create({ data });
  } catch {
    return { error: translate(lang, 'error.generic'), message: '' };
  }

  refresh();
  return {
    error: '',
    message: translate(lang, id > 0 ? 'aroutine.updated' : 'aroutine.added', { subject }),
  };
}

export async function deleteRoutineAction(
  _prev: RoutineState,
  formData: FormData
): Promise<RoutineState> {
  await requireAdmin();
  const lang = await getLang();

  const id = Number(formData.get('id') ?? 0);
  if (!Number.isInteger(id) || id <= 0) {
    return { error: translate(lang, 'aroutine.not_found'), message: '' };
  }
  await requireRecordBranch('class_routine', id, false);

  try {
    await prisma.classRoutine.delete({ where: { id } });
  } catch {
    return { error: translate(lang, 'aroutine.not_found'), message: '' };
  }

  refresh();
  return { error: '', message: translate(lang, 'aroutine.deleted') };
}
