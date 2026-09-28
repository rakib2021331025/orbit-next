'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/prisma';
import { getLang, translate } from '@/lib/i18n';
import { toLocalDigits } from '@/lib/i18n/format';
import { deleteFile, putFile } from '@/lib/storage/store';
import { IMAGE_EXTENSIONS, uniqueFilename, validateUpload } from '@/lib/storage/validate';
import {
  MAX_IMAGE_MB,
  categoryImageCount,
  moveCategory,
  renumberCategories,
  uniqueSlug,
} from '@/lib/gallery/admin';
import { invalidate, TAGS } from '@/lib/cache';

/**
 * Gallery category actions, from admin/gallery_categories.php.
 *
 * Deleting is refused while the category still holds images — the admin is told
 * how many, and moves or deletes them under Manage images first. Nothing is
 * orphaned silently.
 */

export interface CategoryState {
  errors: string[];
  message: string;
}

function refresh(): void {
  revalidatePath('/admin/gallery-categories');
  invalidate(TAGS.gallery);
  revalidatePath('/admin/gallery');
  revalidatePath('/gallery');
}

/** A long name cut down for a toast. */
function shortName(name: string): string {
  const clean = name.trim();
  return clean.length > 60 ? `${clean.slice(0, 60)}…` : clean;
}

export async function saveCategoryAction(
  _prev: CategoryState,
  formData: FormData
): Promise<CategoryState> {
  await requireAdmin();
  const lang = await getLang();
  const errors: string[] = [];

  const id = Number(formData.get('id') ?? 0);
  const existing =
    id > 0 ? await prisma.galleryCategory.findUnique({ where: { id } }).catch(() => null) : null;
  if (id > 0 && !existing) {
    return { errors: [translate(lang, 'agal.cat.not_found')], message: '' };
  }

  const name = String(formData.get('name') ?? '').trim().slice(0, 150);
  const description = String(formData.get('description') ?? '').trim().slice(0, 2000);
  const sortOrder = Math.max(0, Math.min(99999, Number(formData.get('sort_order') ?? 0) || 0));
  const status = formData.get('status') === 'hidden' ? 'hidden' : 'active';

  if (name === '') {
    errors.push(translate(lang, 'agal.cat.err_name'));
  } else {
    // The name has a unique index; the check is here so the message names it.
    const clash = await prisma.galleryCategory
      .count({ where: { name: { equals: name, mode: 'insensitive' }, NOT: { id } } })
      .catch(() => 0);
    if (clash > 0) errors.push(translate(lang, 'agal.cat.err_duplicate', { name }));
  }

  const upload = formData.get('cover_image');
  let newCover: string | null = null;

  if (errors.length === 0 && upload instanceof File && upload.size > 0) {
    const check = await validateUpload(upload, [...IMAGE_EXTENSIONS], MAX_IMAGE_MB * 1048576);
    if (!check.ok) {
      errors.push(`${translate(lang, 'agal.cat.f_cover')}: ${check.error}`);
    } else {
      newCover = await putFile(
        'uploads/gallery/covers',
        uniqueFilename(check.ext, 'cover'),
        check.bytes ?? Buffer.alloc(0),
        check.mime
      );
      if (newCover === null) errors.push(translate(lang, 'upload.save_failed'));
    }
  }

  if (errors.length > 0) {
    if (newCover !== null) await deleteFile(newCover);
    return { errors, message: '' };
  }

  const oldCover = (existing?.cover_image ?? '').trim();
  const removeCover = formData.get('remove_cover') !== null;
  const cover = newCover ?? (removeCover || oldCover === '' ? null : oldCover);

  try {
    const slug = await uniqueSlug(name, id);

    if (existing) {
      await prisma.$transaction([
        prisma.galleryCategory.update({
          where: { id },
          data: {
            name,
            slug,
            description: description !== '' ? description : null,
            cover_image: cover,
            sort_order: sortOrder,
            status,
          },
        }),
        // Older pages still read the legacy text column.
        prisma.gallery.updateMany({
          where: { category_id: id },
          data: { category: name.slice(0, 100) },
        }),
      ]);
    } else {
      // 0 means "put it at the end" rather than "first".
      const sort =
        sortOrder > 0
          ? sortOrder
          : ((
              await prisma.galleryCategory
                .aggregate({ _max: { sort_order: true } })
                .catch(() => ({ _max: { sort_order: 0 } }))
            )._max.sort_order ?? 0) + 1;

      await prisma.galleryCategory.create({
        data: {
          name,
          slug,
          description: description !== '' ? description : null,
          cover_image: cover,
          sort_order: sort,
          status,
        },
      });
    }
  } catch {
    if (newCover !== null) await deleteFile(newCover);
    return { errors: [translate(lang, 'error.generic')], message: '' };
  }

  if (oldCover !== '' && oldCover !== cover) await deleteFile(oldCover);

  refresh();
  return {
    errors: [],
    message: translate(lang, existing ? 'agal.cat.updated' : 'agal.cat.created', {
      name: shortName(name),
    }),
  };
}

export async function toggleCategoryAction(
  _prev: CategoryState,
  formData: FormData
): Promise<CategoryState> {
  await requireAdmin();
  const lang = await getLang();

  const id = Number(formData.get('id') ?? 0);
  const category = await prisma.galleryCategory.findUnique({ where: { id } }).catch(() => null);
  if (!category) return { errors: [translate(lang, 'agal.cat.not_found')], message: '' };

  const next = category.status === 'active' ? 'hidden' : 'active';
  try {
    await prisma.galleryCategory.update({ where: { id }, data: { status: next } });
  } catch {
    return { errors: [translate(lang, 'error.generic')], message: '' };
  }

  refresh();
  return {
    errors: [],
    message: translate(lang, next === 'active' ? 'agal.cat.shown' : 'agal.cat.hidden_now', {
      name: shortName(category.name),
    }),
  };
}

export async function deleteCategoryAction(
  _prev: CategoryState,
  formData: FormData
): Promise<CategoryState> {
  await requireAdmin();
  const lang = await getLang();

  const id = Number(formData.get('id') ?? 0);
  const category = await prisma.galleryCategory.findUnique({ where: { id } }).catch(() => null);
  if (!category) return { errors: [translate(lang, 'agal.cat.not_found')], message: '' };

  // Counted right now, so an image uploaded a moment ago still blocks it.
  const images = await categoryImageCount(id);
  if (images > 0) {
    return {
      errors: [
        translate(lang, 'agal.cat.delete_blocked', {
          name: shortName(category.name),
          count: toLocalDigits(images, lang),
        }),
      ],
      message: '',
    };
  }

  try {
    await prisma.galleryCategory.delete({ where: { id } });
  } catch {
    return { errors: [translate(lang, 'error.generic')], message: '' };
  }

  if ((category.cover_image ?? '') !== '') await deleteFile(category.cover_image!);

  refresh();
  return {
    errors: [],
    message: translate(lang, 'agal.cat.deleted', { name: shortName(category.name) }),
  };
}

export async function moveCategoryAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = Number(formData.get('id') ?? 0);
  const direction = formData.get('direction') === 'up' ? 'up' : 'down';
  if (await moveCategory(id, direction)) refresh();
}

export async function renumberCategoriesAction(
  _prev: CategoryState,
  _formData: FormData
): Promise<CategoryState> {
  await requireAdmin();
  const lang = await getLang();
  void _formData;

  if (!(await renumberCategories())) {
    return { errors: [translate(lang, 'error.generic')], message: '' };
  }

  refresh();
  return { errors: [], message: translate(lang, 'agal.cat.renumbered') };
}
