'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { PromotionDisplayPosition, PromotionStyle } from '@prisma/client';
import { requireAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/prisma';
import { getLang, translate } from '@/lib/i18n';
import { safeUrl } from '@/lib/site/url';
import { deleteFile, putFile } from '@/lib/storage/store';
import { IMAGE_EXTENSIONS, uniqueFilename, validateUpload } from '@/lib/storage/validate';
import { PROMOTION_POSITIONS, PROMOTION_STYLES } from '@/lib/promotions/options';
import { invalidate, TAGS } from '@/lib/cache';

/**
 * Promotion actions, from admin/promotions.php.
 *
 * A promotion is public the moment it is active **and** inside its optional
 * start/end window, so scheduling is how a campaign is prepared in advance.
 *
 * The button link goes through `safeUrl()`: only http(s), a page of this site,
 * `tel:` or `mailto:` are allowed. A promotion is the most clicked thing on the
 * homepage, and a `javascript:` link there would be handed to every visitor.
 */

const MAX_MB = 4;

export interface PromotionState {
  errors: string[];
  message: string;
}

function refresh(): void {
  revalidatePath('/admin/promotions');
  invalidate(TAGS.home);
  // The top bar is on every public page.
  revalidatePath('/', 'layout');
}

/**
 * A `datetime-local` value as a Date, `null` when empty, `false` when it is not
 * a date at all.
 */
function localDateTime(raw: string): Date | null | false {
  const value = raw.trim();
  if (value === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return false;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? false : date;
}

export async function savePromotionAction(
  _prev: PromotionState,
  formData: FormData
): Promise<PromotionState> {
  const admin = await requireAdmin();
  const lang = await getLang();
  const errors: string[] = [];

  const id = Number(formData.get('id') ?? 0);
  const existing =
    id > 0 ? await prisma.promotion.findUnique({ where: { id } }).catch(() => null) : null;
  if (id > 0 && !existing) {
    return { errors: [translate(lang, 'error.not_found_body')], message: '' };
  }

  const text = (key: string, max: number) =>
    String(formData.get(key) ?? '').trim().slice(0, max);

  const title = text('title', 255);
  const buttonUrl = text('button_url', 500);
  const percentRaw = String(formData.get('discount_percent') ?? '').trim();

  const position = PROMOTION_POSITIONS.includes(
    String(formData.get('display_position')) as (typeof PROMOTION_POSITIONS)[number]
  )
    ? (String(formData.get('display_position')) as PromotionDisplayPosition)
    : ('home_section' as PromotionDisplayPosition);

  const style = PROMOTION_STYLES.includes(
    String(formData.get('style')) as (typeof PROMOTION_STYLES)[number]
  )
    ? (String(formData.get('style')) as PromotionStyle)
    : ('green' as PromotionStyle);

  const startAt = localDateTime(String(formData.get('start_at') ?? ''));
  const endAt = localDateTime(String(formData.get('end_at') ?? ''));

  if (title === '') errors.push(translate(lang, 'pa.err_title'));
  if (buttonUrl !== '' && safeUrl(buttonUrl) === '') errors.push(translate(lang, 'pa.err_url'));
  if (
    percentRaw !== '' &&
    (!Number.isFinite(Number(percentRaw)) || Number(percentRaw) < 0 || Number(percentRaw) > 100)
  ) {
    errors.push(translate(lang, 'pa.err_percent'));
  }
  if (startAt === false || endAt === false) errors.push(translate(lang, 'pa.err_date_format'));
  if (startAt instanceof Date && endAt instanceof Date && endAt <= startAt) {
    errors.push(translate(lang, 'pa.err_dates'));
  }

  const upload = formData.get('image');
  let newImage: string | null = null;

  if (errors.length === 0 && upload instanceof File && upload.size > 0) {
    const check = await validateUpload(upload, [...IMAGE_EXTENSIONS], MAX_MB * 1048576);
    if (!check.ok) {
      errors.push(`${translate(lang, 'pa.image')}: ${check.error}`);
    } else {
      newImage = await putFile(
        'uploads/promotions',
        uniqueFilename(check.ext, 'promo'),
        check.bytes ?? Buffer.alloc(0),
        check.mime
      );
      if (newImage === null) errors.push(translate(lang, 'upload.save_failed'));
    }
  }

  if (errors.length > 0) {
    if (newImage !== null) await deleteFile(newImage);
    return { errors, message: '' };
  }

  // Past the error gate both dates are real; this only tells the compiler so.
  const start = startAt === false ? null : startAt;
  const end = endAt === false ? null : endAt;

  const removeImage = formData.get('remove_image') !== null;
  const image = newImage ?? (removeImage ? null : (existing?.image ?? null));

  try {
    const data = {
      title,
      title_bn: text('title_bn', 255) || null,
      description: text('description', 2000) || null,
      description_bn: text('description_bn', 2000) || null,
      image,
      offer_text: text('offer_text', 60) || null,
      offer_text_bn: text('offer_text_bn', 60) || null,
      discount_percent: percentRaw !== '' ? Math.round(Number(percentRaw) * 100) / 100 : null,
      button_text: text('button_text', 80) || null,
      button_text_bn: text('button_text_bn', 80) || null,
      button_url: buttonUrl !== '' ? buttonUrl : null,
      display_position: position,
      style,
      sort_order: Number(formData.get('sort_order') ?? 0) || 0,
      is_active: formData.get('is_active') !== null,
      start_at: start,
      end_at: end,
    };

    if (id > 0) {
      await prisma.promotion.update({ where: { id }, data });
    } else {
      await prisma.promotion.create({
        data: { ...data, created_by: admin.id > 0 ? admin.id : null },
      });
    }
  } catch {
    if (newImage !== null) await deleteFile(newImage);
    return { errors: [translate(lang, 'error.generic')], message: '' };
  }

  const oldImage = existing?.image ?? null;
  if (oldImage !== null && oldImage !== '' && oldImage !== image) await deleteFile(oldImage);

  refresh();
  redirect('/admin/promotions');
}

export async function togglePromotionAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = Number(formData.get('id') ?? 0);
  const promotion = await prisma.promotion
    .findUnique({ where: { id }, select: { is_active: true } })
    .catch(() => null);
  if (!promotion) return;

  try {
    await prisma.promotion.update({ where: { id }, data: { is_active: !promotion.is_active } });
    refresh();
  } catch {
    // The list shows the real state on the next load.
  }
}

export async function deletePromotionAction(
  _prev: PromotionState,
  formData: FormData
): Promise<PromotionState> {
  await requireAdmin();
  const lang = await getLang();

  const id = Number(formData.get('id') ?? 0);
  const promotion = await prisma.promotion.findUnique({ where: { id } }).catch(() => null);
  if (!promotion) return { errors: [translate(lang, 'error.not_found_body')], message: '' };

  try {
    await prisma.promotion.delete({ where: { id } });
  } catch {
    return { errors: [translate(lang, 'error.generic')], message: '' };
  }

  if (promotion.image !== null && promotion.image !== '') await deleteFile(promotion.image);
  refresh();
  return { errors: [], message: translate(lang, 'pa.deleted') };
}
