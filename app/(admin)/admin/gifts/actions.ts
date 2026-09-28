'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/prisma';
import { getLang, translate } from '@/lib/i18n';
import { deleteFile, putFile } from '@/lib/storage/store';
import { IMAGE_EXTENSIONS, uniqueFilename, validateUpload } from '@/lib/storage/validate';
import { invalidate, TAGS } from '@/lib/cache';

/**
 * Gift actions, from admin/gifts.php.
 *
 * Every **active** gift shows in the "Free gift with admission" section under
 * the homepage banner, and with none active that section is not rendered at all
 * — so deactivating is how the offer is taken down, and deleting is for a gift
 * added by mistake.
 */

const MAX_MB = 4;

export interface GiftState {
  errors: string[];
  message: string;
}

function refresh(): void {
  revalidatePath('/admin/gifts');
  invalidate(TAGS.home);
  revalidatePath('/');
}

export async function saveGiftAction(_prev: GiftState, formData: FormData): Promise<GiftState> {
  const admin = await requireAdmin();
  const lang = await getLang();

  const id = Number(formData.get('id') ?? 0);
  const existing = id > 0 ? await prisma.gift.findUnique({ where: { id } }).catch(() => null) : null;
  if (id > 0 && !existing) {
    return { errors: [translate(lang, 'error.not_found_body')], message: '' };
  }

  const text = (key: string, max: number) =>
    String(formData.get(key) ?? '').trim().slice(0, max);

  const name = text('name', 150);
  const nameBn = text('name_bn', 150);
  const description = text('description', 500);
  const descriptionBn = text('description_bn', 500);
  const sortOrder = Math.max(0, Math.min(9999, Number(formData.get('sort_order') ?? 0) || 0));
  const isActive = formData.get('is_active') !== null;

  if (name === '') return { errors: [translate(lang, 'agift.err_name')], message: '' };

  const upload = formData.get('image');
  let newImage: string | null = null;

  if (upload instanceof File && upload.size > 0) {
    const check = await validateUpload(upload, [...IMAGE_EXTENSIONS], MAX_MB * 1048576);
    if (!check.ok) {
      return { errors: [`${translate(lang, 'agift.image')}: ${check.error}`], message: '' };
    }
    newImage = await putFile(
      'uploads/gifts',
      uniqueFilename(check.ext, 'gift'),
      check.bytes ?? Buffer.alloc(0),
      check.mime
    );
    if (newImage === null) return { errors: [translate(lang, 'upload.save_failed')], message: '' };
  }

  const removeImage = formData.get('remove_image') !== null;
  const image = newImage ?? (removeImage ? null : (existing?.image ?? null));

  try {
    const data = {
      name,
      name_bn: nameBn !== '' ? nameBn : null,
      description: description !== '' ? description : null,
      description_bn: descriptionBn !== '' ? descriptionBn : null,
      image,
      sort_order: sortOrder,
      is_active: isActive,
    };

    if (id > 0) {
      await prisma.gift.update({ where: { id }, data });
    } else {
      await prisma.gift.create({
        data: { ...data, created_by: admin.id > 0 ? admin.id : null },
      });
    }
  } catch {
    if (newImage !== null) await deleteFile(newImage);
    return { errors: [translate(lang, 'error.generic')], message: '' };
  }

  // The old file goes only once the row no longer points at it.
  const oldImage = existing?.image ?? null;
  if (oldImage !== null && oldImage !== '' && oldImage !== image) await deleteFile(oldImage);

  refresh();
  redirect('/admin/gifts');
}

export async function toggleGiftAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = Number(formData.get('id') ?? 0);
  const gift = await prisma.gift
    .findUnique({ where: { id }, select: { is_active: true } })
    .catch(() => null);
  if (!gift) return;

  try {
    await prisma.gift.update({ where: { id }, data: { is_active: !gift.is_active } });
    refresh();
  } catch {
    // The list still shows the real state on the next load.
  }
}

export async function deleteGiftAction(_prev: GiftState, formData: FormData): Promise<GiftState> {
  await requireAdmin();
  const lang = await getLang();

  const id = Number(formData.get('id') ?? 0);
  const gift = await prisma.gift.findUnique({ where: { id } }).catch(() => null);
  if (!gift) return { errors: [translate(lang, 'error.not_found_body')], message: '' };

  try {
    await prisma.gift.delete({ where: { id } });
  } catch {
    return { errors: [translate(lang, 'error.generic')], message: '' };
  }

  if (gift.image !== null && gift.image !== '') await deleteFile(gift.image);
  refresh();
  return { errors: [], message: translate(lang, 'agift.deleted') };
}
