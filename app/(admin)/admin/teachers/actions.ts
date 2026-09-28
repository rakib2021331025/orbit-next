'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/guards';
import { getLang, translate, hasTranslation } from '@/lib/i18n';
import { toLocalDigits } from '@/lib/i18n/format';
import {
  saveTeacher,
  setTeacherPassword,
  toggleTeacher,
  deleteTeacher,
  toggleWebsite,
  type TeacherOutcome,
} from '@/lib/teachers/manage';
import { invalidate, TAGS } from '@/lib/cache';

/**
 * Teacher account actions, from admin/teachers_management.php.
 *
 * A generated password comes back in the state and is shown **once**: it is
 * stored only as a hash, so this is the only moment anybody can read it.
 */

export interface TeacherState {
  error: string;
  message: string;
  field: string;
  /** A temporary password to hand over, shown once. */
  password: string;
}

function refresh(): void {
  revalidatePath('/admin/teachers');
  invalidate(TAGS.teachers, TAGS.home);
  // Teachers appear on the public homepage and on branch pages.
  revalidatePath('/');
  revalidatePath('/branches');
}

async function present(outcome: TeacherOutcome): Promise<TeacherState> {
  const lang = await getLang();

  const message =
    outcome.text !== undefined && outcome.text !== ''
      ? outcome.text
      : translate(
          lang,
          outcome.message,
          Object.fromEntries(
            Object.entries(outcome.vars ?? {}).map(([name, value]) => [
              name,
              typeof value === 'number'
                ? toLocalDigits(value, lang)
                : hasTranslation(value)
                  ? translate(lang, value)
                  : value,
            ])
          )
        );

  return outcome.ok
    ? { error: '', message, field: '', password: outcome.password ?? '' }
    : { error: message, message: '', field: outcome.field ?? '', password: '' };
}

function text(formData: FormData, field: string): string {
  return String(formData.get(field) ?? '');
}

export async function saveTeacherAction(
  _prev: TeacherState,
  formData: FormData
): Promise<TeacherState> {
  await requireAdmin();

  const photo = formData.get('photo');
  const branches =
    formData.get('branches_field') !== null
      ? formData
          .getAll('branches')
          .map((value) => Number(value))
          .filter((id) => Number.isInteger(id) && id > 0)
      : null;

  const outcome = await saveTeacher({
    id: Number(formData.get('id') ?? 0),
    name: text(formData, 'name'),
    email: text(formData, 'email'),
    phone: text(formData, 'phone'),
    designation: text(formData, 'designation'),
    qualification: text(formData, 'qualification'),
    bio: text(formData, 'bio'),
    status: text(formData, 'status'),
    subjects: text(formData, 'subjects'),
    batches: text(formData, 'batches'),
    password: text(formData, 'password'),
    name_bn: text(formData, 'name_bn'),
    designation_bn: text(formData, 'designation_bn'),
    qualification_bn: text(formData, 'qualification_bn'),
    experience: text(formData, 'experience'),
    experience_bn: text(formData, 'experience_bn'),
    bio_bn: text(formData, 'bio_bn'),
    sort_order: Number(formData.get('sort_order') ?? 0) || 0,
    show_on_website: formData.get('show_on_website') !== null,
    photo: photo instanceof File ? photo : null,
    branches,
  });

  if (outcome.ok) refresh();
  return present(outcome);
}

export async function setPasswordAction(
  _prev: TeacherState,
  formData: FormData
): Promise<TeacherState> {
  await requireAdmin();

  const outcome = await setTeacherPassword(
    Number(formData.get('id') ?? 0),
    text(formData, 'password')
  );
  if (outcome.ok) refresh();
  return present(outcome);
}

export async function toggleTeacherAction(
  _prev: TeacherState,
  formData: FormData
): Promise<TeacherState> {
  await requireAdmin();

  const outcome = await toggleTeacher(Number(formData.get('id') ?? 0));
  if (outcome.ok) refresh();
  return present(outcome);
}

export async function deleteTeacherAction(
  _prev: TeacherState,
  formData: FormData
): Promise<TeacherState> {
  await requireAdmin();

  const outcome = await deleteTeacher(Number(formData.get('id') ?? 0));
  if (outcome.ok) refresh();
  return present(outcome);
}

export async function toggleWebsiteAction(
  _prev: TeacherState,
  formData: FormData
): Promise<TeacherState> {
  await requireAdmin();

  const outcome = await toggleWebsite(Number(formData.get('id') ?? 0));
  if (outcome.ok) refresh();
  return present(outcome);
}
