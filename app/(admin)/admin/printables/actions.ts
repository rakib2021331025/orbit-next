'use server';

import { revalidatePath } from 'next/cache';
import { randomBytes } from 'node:crypto';
import { requireAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/prisma';
import { getLang, translate } from '@/lib/i18n';
import { deleteFile, putFile } from '@/lib/storage/store';
import { IMAGE_EXTENSIONS, imageSize, validateUpload } from '@/lib/storage/validate';
import { PRINTABLE_CATEGORIES, PRINTABLE_MAX_MB } from '@/lib/printables/options';

/**
 * Printable document actions, from admin/printable_documents.php.
 *
 * The replacement order is the careful part, and it is kept: the new image is
 * stored first, the row is pointed at it second, and **only then** is the old
 * file deleted. A failure at any step leaves a document whose image still opens.
 *
 * The stored dimensions come from the file's own header, which is also what
 * proves it is a real image. No thumbnail is generated — the list falls back to
 * the full image, exactly as the original allows when resampling is unavailable.
 */

export interface PrintableState {
  errors: string[];
  message: string;
}

function refresh(): void {
  revalidatePath('/admin/printables');
}

export async function savePrintableAction(
  _prev: PrintableState,
  formData: FormData
): Promise<PrintableState> {
  const admin = await requireAdmin();
  const lang = await getLang();
  const errors: string[] = [];

  const id = Number(formData.get('id') ?? 0);
  const existing =
    id > 0
      ? await prisma.printableDocument.findUnique({ where: { id } }).catch(() => null)
      : null;
  if (id > 0 && !existing) {
    return { errors: [translate(lang, 'error.not_found_body')], message: '' };
  }

  const text = (key: string, max: number) =>
    String(formData.get(key) ?? '').trim().slice(0, max);

  const title = text('title', 200);
  const description = text('description', 2000);

  const chosen = text('category', 20);
  const custom = text('custom_category', 80);
  const preset = (PRINTABLE_CATEGORIES as readonly string[]).includes(chosen) ? chosen : 'general';
  // "Other" with a name typed means that name; "Other" alone stays "other".
  const category = preset === 'other' && custom !== '' ? custom : preset;

  if (title === '') errors.push(translate(lang, 'pdoc.err_title'));

  const upload = formData.get('image');
  const hasFile = upload instanceof File && upload.size > 0;
  if (!hasFile && !existing) errors.push(translate(lang, 'pdoc.err_image'));

  let stored: { path: string; width: number; height: number } | null = null;

  if (errors.length === 0 && hasFile) {
    const check = await validateUpload(upload, [...IMAGE_EXTENSIONS], PRINTABLE_MAX_MB * 1048576);
    if (!check.ok) {
      errors.push(`${translate(lang, 'pdoc.f_image')}: ${check.error}`);
    } else {
      const bytes = check.bytes ?? Buffer.alloc(0);
      const size = imageSize(bytes, check.ext);
      if (size === null) {
        errors.push(`${translate(lang, 'pdoc.f_image')}: ${translate(lang, 'upload.corrupt')}`);
      } else {
        // The name never comes from the uploaded file, and the extension follows
        // the real content rather than what was claimed.
        const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
        const path = await putFile(
          'uploads/printables',
          `printable_${stamp}_${randomBytes(6).toString('hex')}.${check.ext}`,
          bytes,
          check.mime
        );
        if (path === null) errors.push(translate(lang, 'upload.save_failed'));
        else stored = { path, width: size.width, height: size.height };
      }
    }
  }

  if (errors.length > 0) {
    if (stored !== null) await deleteFile(stored.path);
    return { errors, message: '' };
  }

  const data = {
    title,
    category,
    description: description !== '' ? description : null,
    image_path: stored?.path ?? existing?.image_path ?? '',
    // No thumbnail is written, so the list uses the full image.
    thumb_path: stored !== null ? null : (existing?.thumb_path ?? null),
    image_width: stored?.width ?? existing?.image_width ?? 0,
    image_height: stored?.height ?? existing?.image_height ?? 0,
  };

  try {
    if (id > 0) {
      await prisma.printableDocument.update({ where: { id }, data });
    } else {
      await prisma.printableDocument.create({
        data: {
          ...data,
          // Visible to students only when somebody says so, elsewhere.
          student_visible: false,
          created_by: admin.id > 0 ? admin.id : null,
        },
      });
    }
  } catch {
    if (stored !== null) await deleteFile(stored.path);
    return { errors: [translate(lang, 'error.generic')], message: '' };
  }

  // Only now are the replaced files removed.
  if (stored !== null && existing) {
    if (existing.image_path !== '' && existing.image_path !== stored.path) {
      await deleteFile(existing.image_path);
    }
    if ((existing.thumb_path ?? '') !== '') await deleteFile(existing.thumb_path!);
  }

  refresh();
  return { errors: [], message: translate(lang, id > 0 ? 'pdoc.updated' : 'pdoc.added') };
}

export async function deletePrintableAction(
  _prev: PrintableState,
  formData: FormData
): Promise<PrintableState> {
  await requireAdmin();
  const lang = await getLang();

  const id = Number(formData.get('id') ?? 0);
  const document = await prisma.printableDocument.findUnique({ where: { id } }).catch(() => null);
  if (!document) return { errors: [translate(lang, 'error.not_found_body')], message: '' };

  try {
    await prisma.printableDocument.delete({ where: { id } });
  } catch {
    return { errors: [translate(lang, 'error.generic')], message: '' };
  }

  if (document.image_path !== '') await deleteFile(document.image_path);
  if ((document.thumb_path ?? '') !== '') await deleteFile(document.thumb_path!);

  refresh();
  return { errors: [], message: translate(lang, 'pdoc.deleted') };
}
