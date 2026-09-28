'use server';

import { revalidatePath } from 'next/cache';
import { invalidate, TAGS } from '@/lib/cache';
import { requireTeacher } from '@/lib/auth/guards';
import { getLang } from '@/lib/i18n';
import {
  saveLiveClass,
  setClassStatus,
  deleteLiveClass,
  addMaterial,
  deleteMaterial,
  outcomeMessage,
  type ClassOutcome,
} from '@/lib/classes/manage';
import { isClassStatus } from '@/lib/classes/data';

/**
 * The teacher's live class actions.
 *
 * **Every call passes `teacher.id` as the ownership lock**, so the class id in
 * the form is checked against the signed-in teacher inside the library rather
 * than trusted here. Changing the id in the page's HTML gets "not yours", not
 * somebody else's class.
 *
 * The library returns translation keys; they become words here, once, using the
 * reader's language — including the "…, N students notified" suffix, which is
 * the only sign a teacher gets that saving reached anybody.
 */

export interface ClassFormState {
  error: string;
  message: string;
}


function text(formData: FormData, field: string): string {
  return String(formData.get(field) ?? '');
}

async function present(outcome: ClassOutcome): Promise<ClassFormState> {
  const message = outcomeMessage(outcome, await getLang());
  return outcome.ok ? { error: '', message } : { error: message, message: '' };
}

export async function saveClassAction(
  _prev: ClassFormState,
  formData: FormData
): Promise<ClassFormState> {
  const teacher = await requireTeacher();

  const outcome = await saveLiveClass(
    {
      id: Number(formData.get('id') ?? 0),
      subject: text(formData, 'subject'),
      topic: text(formData, 'topic'),
      course_id: text(formData, 'course_id'),
      batch_id: text(formData, 'batch_id'),
      class_mode: text(formData, 'class_mode'),
      class_date: text(formData, 'class_date'),
      start_time: text(formData, 'start_time'),
      duration_minutes: text(formData, 'duration_minutes'),
      meet_url: text(formData, 'meet_url'),
      description: text(formData, 'description'),
      status: text(formData, 'status'),
      // A teacher's class is always their own, and they do not choose a branch:
      // the audience the class is tagged with already decides who sees it.
      teacher_id: teacher.id,
      branch_id: null,
    },
    'teacher',
    teacher.id,
    teacher.id
  );

  revalidatePath('/teacher/live-classes');
  invalidate(TAGS.classes);
  return present(outcome);
}

export async function setClassStatusAction(
  _prev: ClassFormState,
  formData: FormData
): Promise<ClassFormState> {
  const teacher = await requireTeacher();

  const status = text(formData, 'status');
  if (!isClassStatus(status)) return { error: '', message: '' };

  const outcome = await setClassStatus(Number(formData.get('id') ?? 0), status, teacher.id);
  revalidatePath('/teacher/live-classes');
  invalidate(TAGS.classes);
  return present(outcome);
}

export async function deleteClassAction(
  _prev: ClassFormState,
  formData: FormData
): Promise<ClassFormState> {
  const teacher = await requireTeacher();

  const outcome = await deleteLiveClass(Number(formData.get('id') ?? 0), teacher.id);
  revalidatePath('/teacher/live-classes');
  invalidate(TAGS.classes);
  return present(outcome);
}

export async function addMaterialAction(
  _prev: ClassFormState,
  formData: FormData
): Promise<ClassFormState> {
  const teacher = await requireTeacher();

  const file = formData.get('material_file');
  const outcome = await addMaterial(
    Number(formData.get('live_class_id') ?? 0),
    text(formData, 'material_title'),
    file instanceof File ? file : null,
    'teacher',
    teacher.id,
    teacher.id
  );

  revalidatePath('/teacher/live-classes');
  invalidate(TAGS.classes);
  return present(outcome);
}

export async function deleteMaterialAction(
  _prev: ClassFormState,
  formData: FormData
): Promise<ClassFormState> {
  const teacher = await requireTeacher();

  const outcome = await deleteMaterial(Number(formData.get('material_id') ?? 0), teacher.id);
  revalidatePath('/teacher/live-classes');
  invalidate(TAGS.classes);
  return present(outcome);
}
