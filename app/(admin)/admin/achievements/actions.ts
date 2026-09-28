'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/prisma';
import { getLang, translate } from '@/lib/i18n';
import { deleteFile, putFile } from '@/lib/storage/store';
import { IMAGE_EXTENSIONS, uniqueFilename, validateUpload } from '@/lib/storage/validate';
import { invalidate, TAGS } from '@/lib/cache';

/**
 * Achievement actions, from admin/achievements.php.
 *
 * Every row here is on the public homepage slider — the table has no status
 * column, so there is nothing to switch off. Adding one publishes it.
 *
 * The old image is deleted **only after** the row points at the new one, and a
 * newly written file is removed when the save then fails. Either order the
 * other way round loses a picture that is still on the homepage.
 */

const MAX_MB = 10;

export interface AchievementState {
  error: string;
  message: string;
}

function refresh(): void {
  revalidatePath('/admin/achievements');
  invalidate(TAGS.home);
  revalidatePath('/');
}

/** A long title cut down for a toast. */
function shortTitle(title: string): string {
  const clean = title.trim();
  return clean.length > 60 ? `${clean.slice(0, 60)}…` : clean;
}

export async function saveAchievementAction(
  _prev: AchievementState,
  formData: FormData
): Promise<AchievementState> {
  await requireAdmin();
  const lang = await getLang();

  const id = Number(formData.get('id') ?? 0);
  const existing =
    id > 0 ? await prisma.achievement.findUnique({ where: { id } }).catch(() => null) : null;
  if (id > 0 && !existing) return { error: translate(lang, 'aach.not_found'), message: '' };

  const title = String(formData.get('title') ?? '').trim().slice(0, 255);
  const description = String(formData.get('description') ?? '').trim().slice(0, 20000);
  if (title === '') return { error: translate(lang, 'aach.err_title'), message: '' };

  const upload = formData.get('image');
  let newImage: string | null = null;

  if (upload instanceof File && upload.size > 0) {
    const check = await validateUpload(upload, [...IMAGE_EXTENSIONS], MAX_MB * 1048576);
    if (!check.ok) {
      return { error: `${translate(lang, 'aach.f_image')}: ${check.error}`, message: '' };
    }

    newImage = await putFile(
      'uploads/achievements',
      uniqueFilename(check.ext, 'achievement'),
      check.bytes ?? Buffer.alloc(0),
      check.mime
    );
    if (newImage === null) return { error: translate(lang, 'upload.save_failed'), message: '' };
  } else if (!existing) {
    // An achievement with no image is an empty card in the slider.
    return { error: translate(lang, 'aach.err_image'), message: '' };
  }

  const image = newImage ?? existing?.image ?? '';

  try {
    if (existing) {
      await prisma.achievement.update({
        where: { id },
        data: { title, description: description !== '' ? description : null, image },
      });
    } else {
      await prisma.achievement.create({
        data: { title, description: description !== '' ? description : null, image },
      });
    }
  } catch {
    if (newImage !== null) await deleteFile(newImage);
    return { error: translate(lang, 'error.generic'), message: '' };
  }

  if (newImage !== null && existing && existing.image !== '' && existing.image !== newImage) {
    await deleteFile(existing.image);
  }

  refresh();
  return {
    error: '',
    message: translate(lang, existing ? 'aach.updated' : 'aach.created', {
      title: shortTitle(title),
    }),
  };
}

export async function deleteAchievementAction(
  _prev: AchievementState,
  formData: FormData
): Promise<AchievementState> {
  await requireAdmin();
  const lang = await getLang();

  const id = Number(formData.get('id') ?? 0);
  const existing = await prisma.achievement.findUnique({ where: { id } }).catch(() => null);
  if (!existing) return { error: translate(lang, 'aach.not_found'), message: '' };

  try {
    await prisma.achievement.delete({ where: { id } });
  } catch {
    return { error: translate(lang, 'error.generic'), message: '' };
  }

  await deleteFile(existing.image);
  refresh();
  return {
    error: '',
    message: translate(lang, 'aach.deleted', { title: shortTitle(existing.title) }),
  };
}
