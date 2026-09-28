'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/guards';
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
import { contentBranchId } from '@/lib/branch/assign';
import { invalidate, TAGS } from '@/lib/cache';

/**
 * The admin's live class actions, from admin/live_classes_management.php.
 *
 * **No ownership lock**: an administrator schedules and changes any teacher's
 * class, and assigns the teacher explicitly. The branch comes from the form for
 * an all-branch admin and from the lock for a branch-restricted one — that is
 * `contentBranchId()`'s job, and it is why a class may also belong to no branch
 * at all and be shared by every one of them.
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
  const admin = await requireAdmin();

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
      // An admin picks the teacher, and the branch the class belongs to.
      teacher_id: Number(formData.get('teacher_id') ?? 0),
      branch_id: await contentBranchId(formData.get('branch_id')),
    },
    'admin',
    admin.id
  );

  revalidatePath('/admin/live-classes');

  invalidate(TAGS.classes);
  revalidatePath('/student/live-classes');
  return present(outcome);
}

export async function setClassStatusAction(
  _prev: ClassFormState,
  formData: FormData
): Promise<ClassFormState> {
  await requireAdmin();

  const status = text(formData, 'status');
  if (!isClassStatus(status)) return { error: '', message: '' };

  const outcome = await setClassStatus(Number(formData.get('id') ?? 0), status);
  revalidatePath('/admin/live-classes');
  invalidate(TAGS.classes);
  revalidatePath('/student/live-classes');
  return present(outcome);
}

export async function deleteClassAction(
  _prev: ClassFormState,
  formData: FormData
): Promise<ClassFormState> {
  await requireAdmin();

  const outcome = await deleteLiveClass(Number(formData.get('id') ?? 0));
  revalidatePath('/admin/live-classes');
  invalidate(TAGS.classes);
  revalidatePath('/student/live-classes');
  return present(outcome);
}

export async function addMaterialAction(
  _prev: ClassFormState,
  formData: FormData
): Promise<ClassFormState> {
  const admin = await requireAdmin();

  const file = formData.get('material_file');
  const outcome = await addMaterial(
    Number(formData.get('live_class_id') ?? 0),
    text(formData, 'material_title'),
    file instanceof File ? file : null,
    'admin',
    admin.id
  );

  revalidatePath('/admin/live-classes');

  invalidate(TAGS.classes);
  revalidatePath('/student/live-classes');
  return present(outcome);
}

export async function deleteMaterialAction(
  _prev: ClassFormState,
  formData: FormData
): Promise<ClassFormState> {
  await requireAdmin();

  const outcome = await deleteMaterial(Number(formData.get('material_id') ?? 0));
  revalidatePath('/admin/live-classes');
  invalidate(TAGS.classes);
  revalidatePath('/student/live-classes');
  return present(outcome);
}
