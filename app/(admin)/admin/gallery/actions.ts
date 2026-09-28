'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/prisma';
import { getLang, translate } from '@/lib/i18n';
import { toLocalDigits } from '@/lib/i18n/format';
import { deleteFile, putFile } from '@/lib/storage/store';
import { IMAGE_EXTENSIONS, uniqueFilename, validateUpload } from '@/lib/storage/validate';
import { MAX_IMAGE_MB } from '@/lib/gallery/admin';
import { invalidate, TAGS } from '@/lib/cache';

/**
 * Gallery image actions, from admin/gallery_add.php and
 * admin/gallery_manage.php.
 *
 * An upload carries **many files for one category** and reports on each file
 * separately: one rejected picture must not throw away the nine that were fine.
 * A file whose row cannot be written is deleted from disk again, so nothing is
 * left behind that no row points at.
 */

export interface UploadItem {
  name: string;
  ok: boolean;
  /** Already translated. */
  message: string;
  title: string;
}

export interface GalleryState {
  errors: string[];
  message: string;
  /** One entry per uploaded file, in the order they were sent. */
  items: UploadItem[];
}

const EMPTY_ITEMS: UploadItem[] = [];

function refresh(): void {
  revalidatePath('/admin/gallery');
  invalidate(TAGS.gallery, TAGS.home);
  revalidatePath('/admin/gallery-categories');
  revalidatePath('/gallery');
}

/** A long title cut down for a toast. */
function shortTitle(title: string): string {
  const clean = title.trim();
  return clean.length > 60 ? `${clean.slice(0, 60)}…` : clean;
}

/** True for a real calendar date written YYYY-MM-DD. */
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    date.getUTCFullYear() >= 1900
  );
}

export async function uploadImagesAction(
  _prev: GalleryState,
  formData: FormData
): Promise<GalleryState> {
  await requireAdmin();
  const lang = await getLang();
  const errors: string[] = [];

  const categoryId = Math.max(0, Number(formData.get('category_id') ?? 0) || 0);
  const title = String(formData.get('title') ?? '').trim().slice(0, 255);
  const description = String(formData.get('description') ?? '').trim().slice(0, 5000);
  const eventDate = String(formData.get('event_date') ?? '').trim().slice(0, 10);
  const featured = formData.get('featured') !== null;
  const status = formData.get('status') === 'inactive' ? 'inactive' : 'active';

  const category =
    categoryId > 0
      ? await prisma.galleryCategory.findUnique({ where: { id: categoryId } }).catch(() => null)
      : null;
  if (!category) {
    errors.push(translate(lang, categoryId > 0 ? 'agal.err_category' : 'agal.add.err_category'));
  }
  if (eventDate !== '' && !validDate(eventDate)) errors.push(translate(lang, 'agal.err_date'));

  const files = formData
    .getAll('images')
    .filter((value): value is File => value instanceof File && value.size > 0);
  if (files.length === 0) errors.push(translate(lang, 'agal.add.err_images'));

  if (errors.length > 0 || !category) return { errors, message: '', items: EMPTY_ITEMS };

  // The next sort_order in this category, so new pictures land at the end.
  let nextOrder =
    (
      await prisma.gallery
        .aggregate({ where: { category_id: category.id }, _max: { sort_order: true } })
        .catch(() => ({ _max: { sort_order: 0 } }))
    )._max.sort_order ?? 0;

  const items: UploadItem[] = [];
  let saved = 0;
  const numbered = files.length > 1;

  for (const file of files) {
    const name = file.name.split(/[\\/]/).pop()?.slice(0, 255) ?? '';
    const check = await validateUpload(file, [...IMAGE_EXTENSIONS], MAX_IMAGE_MB * 1048576);
    if (!check.ok) {
      items.push({ name, ok: false, message: check.error, title: '' });
      continue;
    }

    const stored = await putFile(
      'uploads/gallery',
      uniqueFilename(check.ext, 'g'),
      check.bytes ?? Buffer.alloc(0),
      check.mime
    );
    if (stored === null) {
      items.push({ name, ok: false, message: translate(lang, 'upload.save_failed'), title: '' });
      continue;
    }

    // With one title for many files each gets a number; with no title the file's
    // own name is used, which is what somebody uploading a folder expects.
    let imageTitle: string;
    if (title !== '') {
      const suffix = numbered ? ` #${saved + 1}` : '';
      imageTitle = title.slice(0, 255 - suffix.length) + suffix;
    } else {
      const base = name.replace(/\.[^.]*$/, '').trim();
      imageTitle = (base !== '' ? base : name).slice(0, 255);
    }

    try {
      await prisma.gallery.create({
        data: {
          title: imageTitle,
          description: description !== '' ? description : null,
          category: category.name.slice(0, 100),
          category_id: category.id,
          image: stored,
          event_date: eventDate !== '' ? new Date(`${eventDate}T00:00:00.000Z`) : null,
          featured,
          status,
          sort_order: ++nextOrder,
        },
      });
      saved += 1;
      items.push({ name, ok: true, message: '', title: imageTitle });
    } catch {
      await deleteFile(stored);
      items.push({ name, ok: false, message: translate(lang, 'error.generic'), title: '' });
    }
  }

  const rejected = items.length - saved;
  if (saved > 0) refresh();

  return {
    errors:
      rejected > 0
        ? [translate(lang, 'agal.add.rejected', { count: toLocalDigits(rejected, lang) })]
        : [],
    message:
      saved > 0
        ? translate(lang, 'agal.add.saved', {
            count: toLocalDigits(saved, lang),
            name: shortTitle(category.name),
          })
        : '',
    items,
  };
}

export async function saveImageAction(
  _prev: GalleryState,
  formData: FormData
): Promise<GalleryState> {
  await requireAdmin();
  const lang = await getLang();
  const errors: string[] = [];

  const id = Number(formData.get('id') ?? 0);
  const existing = await prisma.gallery.findUnique({ where: { id } }).catch(() => null);
  if (!existing) {
    return { errors: [translate(lang, 'agal.manage.not_found')], message: '', items: EMPTY_ITEMS };
  }

  const title = String(formData.get('title') ?? '').trim().slice(0, 255);
  const description = String(formData.get('description') ?? '').trim().slice(0, 5000);
  const categoryId = Math.max(0, Number(formData.get('category_id') ?? 0) || 0);
  const eventDate = String(formData.get('event_date') ?? '').trim().slice(0, 10);
  const featured = formData.get('featured') !== null;
  const status = formData.get('status') === 'inactive' ? 'inactive' : 'active';
  const sortOrder = Math.max(0, Math.min(99999, Number(formData.get('sort_order') ?? 0) || 0));

  if (title === '') errors.push(translate(lang, 'agal.manage.err_title'));

  const category =
    categoryId > 0
      ? await prisma.galleryCategory.findUnique({ where: { id: categoryId } }).catch(() => null)
      : null;
  if (categoryId > 0 && !category) errors.push(translate(lang, 'agal.err_category'));
  if (eventDate !== '' && !validDate(eventDate)) errors.push(translate(lang, 'agal.err_date'));

  if (errors.length > 0) return { errors, message: '', items: EMPTY_ITEMS };

  try {
    await prisma.gallery.update({
      where: { id },
      data: {
        title,
        description: description !== '' ? description : null,
        // No category means the legacy text column is emptied too, not left
        // pointing at the old one.
        category: category ? category.name.slice(0, 100) : '',
        category_id: category ? category.id : null,
        event_date: eventDate !== '' ? new Date(`${eventDate}T00:00:00.000Z`) : null,
        featured,
        status,
        sort_order: sortOrder,
      },
    });
  } catch {
    return { errors: [translate(lang, 'error.generic')], message: '', items: EMPTY_ITEMS };
  }

  refresh();
  return {
    errors: [],
    message: translate(lang, 'agal.manage.saved', { title: shortTitle(title) }),
    items: EMPTY_ITEMS,
  };
}

export async function deleteImageAction(
  _prev: GalleryState,
  formData: FormData
): Promise<GalleryState> {
  await requireAdmin();
  const lang = await getLang();

  const id = Number(formData.get('id') ?? 0);
  const image = await prisma.gallery.findUnique({ where: { id } }).catch(() => null);
  if (!image) {
    return { errors: [translate(lang, 'agal.manage.not_found')], message: '', items: EMPTY_ITEMS };
  }

  try {
    await prisma.gallery.delete({ where: { id } });
  } catch {
    return { errors: [translate(lang, 'error.generic')], message: '', items: EMPTY_ITEMS };
  }

  await deleteFile(image.image);
  refresh();
  return {
    errors: [],
    message: translate(lang, 'agal.manage.deleted', { title: shortTitle(image.title) }),
    items: EMPTY_ITEMS,
  };
}

/** Activate, deactivate, move to another category, or delete — up to 500 at once. */
export async function bulkImagesAction(
  _prev: GalleryState,
  formData: FormData
): Promise<GalleryState> {
  await requireAdmin();
  const lang = await getLang();

  const ids = [
    ...new Set(
      formData
        .getAll('ids')
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    ),
  ].slice(0, 500);

  const what = String(formData.get('bulk_action') ?? '');

  if (ids.length === 0) {
    return { errors: [translate(lang, 'agal.manage.bulk_none')], message: '', items: EMPTY_ITEMS };
  }
  if (!['activate', 'deactivate', 'move', 'delete'].includes(what)) {
    return { errors: [translate(lang, 'agal.manage.bulk_pick')], message: '', items: EMPTY_ITEMS };
  }

  const found = await prisma.gallery
    .findMany({ where: { id: { in: ids } }, select: { id: true, image: true } })
    .catch(() => []);
  if (found.length === 0) {
    return { errors: [translate(lang, 'agal.manage.not_found')], message: '', items: EMPTY_ITEMS };
  }

  const realIds = found.map((row) => row.id);
  const count = toLocalDigits(realIds.length, lang);

  try {
    if (what === 'activate' || what === 'deactivate') {
      await prisma.gallery.updateMany({
        where: { id: { in: realIds } },
        data: { status: what === 'activate' ? 'active' : 'inactive' },
      });
      refresh();
      return {
        errors: [],
        message: translate(
          lang,
          what === 'activate' ? 'agal.manage.bulk_activated' : 'agal.manage.bulk_deactivated',
          { count }
        ),
        items: EMPTY_ITEMS,
      };
    }

    if (what === 'move') {
      const targetId = Number(formData.get('target_category') ?? 0);
      const target =
        targetId > 0
          ? await prisma.galleryCategory.findUnique({ where: { id: targetId } }).catch(() => null)
          : null;
      if (!target) {
        return {
          errors: [
            translate(lang, targetId > 0 ? 'agal.err_category' : 'agal.add.err_category'),
          ],
          message: '',
          items: EMPTY_ITEMS,
        };
      }

      await prisma.gallery.updateMany({
        where: { id: { in: realIds } },
        data: { category_id: target.id, category: target.name.slice(0, 100) },
      });
      refresh();
      return {
        errors: [],
        message: translate(lang, 'agal.manage.bulk_moved', {
          count,
          name: shortTitle(target.name),
        }),
        items: EMPTY_ITEMS,
      };
    }

    await prisma.gallery.deleteMany({ where: { id: { in: realIds } } });
    for (const row of found) await deleteFile(row.image);
    refresh();
    return {
      errors: [],
      message: translate(lang, 'agal.manage.bulk_deleted', { count }),
      items: EMPTY_ITEMS,
    };
  } catch {
    return { errors: [translate(lang, 'error.generic')], message: '', items: EMPTY_ITEMS };
  }
}
