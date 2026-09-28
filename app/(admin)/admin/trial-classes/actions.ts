'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/prisma';
import { getLang, translate } from '@/lib/i18n';
import { deleteFile, putFile } from '@/lib/storage/store';
import { IMAGE_EXTENSIONS, uniqueFilename, validateUpload } from '@/lib/storage/validate';
import { trialVideoId } from '@/lib/trials/video';
import { invalidate, TAGS } from '@/lib/cache';

/**
 * Trial class actions, from admin/trial_classes.php.
 *
 * Only the **11-character YouTube id** is stored, never the pasted link: the
 * link is validated and then thrown away, so nothing but an id can reach the
 * iframe on the public page.
 */

const MAX_MB = 5;

export interface TrialState {
  errors: string[];
  message: string;
}

function refresh(): void {
  revalidatePath('/admin/trial-classes');
  invalidate(TAGS.home);
  revalidatePath('/trial-classes');
  revalidatePath('/');
}

/** A long title cut down for a toast. */
function shortTitle(title: string): string {
  const clean = title.trim();
  return clean.length > 60 ? `${clean.slice(0, 60)}…` : clean;
}

export async function saveTrialAction(_prev: TrialState, formData: FormData): Promise<TrialState> {
  await requireAdmin();
  const lang = await getLang();
  const errors: string[] = [];

  const id = Number(formData.get('id') ?? 0);
  const existing =
    id > 0 ? await prisma.trialClass.findUnique({ where: { id } }).catch(() => null) : null;
  if (id > 0 && !existing) return { errors: [translate(lang, 'atrial.not_found')], message: '' };

  const text = (key: string, max: number) =>
    String(formData.get(key) ?? '').trim().slice(0, max);

  const title = text('title', 255);
  const teacher = text('teacher_name', 255);
  const course = text('course_name', 255);
  const description = text('description', 20000);
  const videoLink = text('video_url', 500);
  const status = formData.get('status') === 'inactive' ? 'inactive' : 'active';

  if (title === '') errors.push(translate(lang, 'atrial.err_title'));
  if (teacher === '') errors.push(translate(lang, 'atrial.err_teacher'));
  if (course === '') errors.push(translate(lang, 'atrial.err_course'));
  if (description === '') errors.push(translate(lang, 'atrial.err_desc'));

  const videoId = trialVideoId(videoLink);
  if (videoLink === '') errors.push(translate(lang, 'atrial.err_video'));
  else if (videoId === '') errors.push(translate(lang, 'atrial.err_video_invalid'));

  const upload = formData.get('thumbnail');
  const hasFile = upload instanceof File && upload.size > 0;
  if (!existing && !hasFile) errors.push(translate(lang, 'atrial.err_thumb'));

  let newThumb: string | null = null;
  if (errors.length === 0 && hasFile) {
    const check = await validateUpload(upload, [...IMAGE_EXTENSIONS], MAX_MB * 1048576);
    if (!check.ok) {
      errors.push(`${translate(lang, 'atrial.f_thumb')}: ${check.error}`);
    } else {
      newThumb = await putFile(
        'uploads/trial-classes',
        uniqueFilename(check.ext, 'trial'),
        check.bytes ?? Buffer.alloc(0),
        check.mime
      );
      if (newThumb === null) errors.push(translate(lang, 'upload.save_failed'));
    }
  }

  if (errors.length > 0) {
    if (newThumb !== null) await deleteFile(newThumb);
    return { errors, message: '' };
  }

  const thumbnail = newThumb ?? existing?.thumbnail ?? null;

  try {
    const data = {
      title,
      teacher_name: teacher,
      course_name: course,
      description,
      thumbnail,
      video_url: videoId,
      status: status as 'active' | 'inactive',
    };

    if (existing) await prisma.trialClass.update({ where: { id }, data });
    else await prisma.trialClass.create({ data });
  } catch {
    if (newThumb !== null) await deleteFile(newThumb);
    return { errors: [translate(lang, 'error.generic')], message: '' };
  }

  if (
    newThumb !== null &&
    existing?.thumbnail !== null &&
    (existing?.thumbnail ?? '') !== '' &&
    existing?.thumbnail !== newThumb
  ) {
    await deleteFile(existing!.thumbnail!);
  }

  refresh();
  return {
    errors: [],
    message: translate(lang, existing ? 'atrial.updated' : 'atrial.created', {
      title: shortTitle(title),
    }),
  };
}

export async function toggleTrialAction(
  _prev: TrialState,
  formData: FormData
): Promise<TrialState> {
  await requireAdmin();
  const lang = await getLang();

  const id = Number(formData.get('id') ?? 0);
  const trial = await prisma.trialClass.findUnique({ where: { id } }).catch(() => null);
  if (!trial) return { errors: [translate(lang, 'atrial.not_found')], message: '' };

  const next = trial.status === 'active' ? 'inactive' : 'active';
  try {
    await prisma.trialClass.update({ where: { id }, data: { status: next } });
  } catch {
    return { errors: [translate(lang, 'error.generic')], message: '' };
  }

  refresh();
  return {
    errors: [],
    message: translate(lang, next === 'active' ? 'atrial.activated' : 'atrial.deactivated', {
      title: shortTitle(trial.title),
    }),
  };
}

export async function deleteTrialAction(
  _prev: TrialState,
  formData: FormData
): Promise<TrialState> {
  await requireAdmin();
  const lang = await getLang();

  const id = Number(formData.get('id') ?? 0);
  const trial = await prisma.trialClass.findUnique({ where: { id } }).catch(() => null);
  if (!trial) return { errors: [translate(lang, 'atrial.not_found')], message: '' };

  try {
    await prisma.trialClass.delete({ where: { id } });
  } catch {
    return { errors: [translate(lang, 'error.generic')], message: '' };
  }

  if (trial.thumbnail !== null && trial.thumbnail !== '') await deleteFile(trial.thumbnail);
  refresh();
  return {
    errors: [],
    message: translate(lang, 'atrial.deleted', { title: shortTitle(trial.title) }),
  };
}
