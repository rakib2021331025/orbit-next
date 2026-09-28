'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/prisma';
import { getLang, translate } from '@/lib/i18n';
import { toLocalDigits } from '@/lib/i18n/format';
import { safeUrl } from '@/lib/site/url';
import { deleteFile, putFile } from '@/lib/storage/store';
import { IMAGE_EXTENSIONS, uniqueFilename, validateUpload } from '@/lib/storage/validate';
import {
  branchDependents,
  branchSlugify,
  setBranchCourses,
  setBranchTeachers,
} from '@/lib/branch/manage';
import { invalidate, TAGS } from '@/lib/cache';

/**
 * Branch actions, from admin/branches.php.
 *
 * Super admins only: a branch-locked admin must not be able to rename, hide or
 * delete the branch that limits them — or grant themselves another one.
 */

const MAX_MB = 5;

export interface BranchState {
  errors: string[];
  message: string;
}

function refresh(): void {
  revalidatePath('/admin/branches');
  invalidate(TAGS.branches, TAGS.courses);
  revalidatePath('/admin');
  // Branch names and cards are on the public site.
  revalidatePath('/', 'layout');
  revalidatePath('/branches');
}

/** Ids from a checkbox list, unique and positive. */
function idList(formData: FormData, key: string): number[] {
  return [
    ...new Set(
      formData
        .getAll(key)
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    ),
  ];
}

export async function saveBranchAction(
  _prev: BranchState,
  formData: FormData
): Promise<BranchState> {
  await requireSuperAdmin();
  const lang = await getLang();
  const errors: string[] = [];

  const id = Number(formData.get('id') ?? 0);
  const existing = id > 0 ? await prisma.branch.findUnique({ where: { id } }).catch(() => null) : null;
  if (id > 0 && !existing) {
    return { errors: [translate(lang, 'error.not_found_body')], message: '' };
  }

  // Names and addresses are collapsed to single spaces: these are printed on
  // cards where a stray double space shows.
  const text = (key: string, max: number) =>
    String(formData.get(key) ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
  const longText = (key: string, max: number) =>
    String(formData.get(key) ?? '').trim().slice(0, max);

  const nameBn = text('name_bn', 191);
  const nameEn = text('name_en', 191);
  let slug = branchSlugify(text('slug', 80));
  const phone = text('phone', 30);
  const email = text('email', 191);
  const mapUrl = longText('map_url', 1000);
  const status = formData.get('status') === 'inactive' ? 'inactive' : 'active';
  const sortOrder = Math.max(0, Math.min(9999, Number(formData.get('sort_order') ?? 0) || 0));

  // An empty slug is derived from the English name, without the word "branch".
  if (slug === '' && nameEn !== '') {
    slug = branchSlugify(nameEn.replace(/\b(branch|main)\b/gi, ''));
  }

  if (nameBn === '' || nameEn === '') errors.push(translate(lang, 'abr.err_name'));

  if (slug === '' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    errors.push(translate(lang, 'abr.err_slug'));
  } else {
    const taken = await prisma.branch
      .findFirst({ where: { slug, NOT: { id } }, select: { id: true } })
      .catch(() => null);
    if (taken) errors.push(translate(lang, 'abr.err_slug_taken'));
  }

  if (email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    errors.push(translate(lang, 'abr.err_email'));
  }
  if (phone !== '' && !/^[0-9+\-\s()]{3,30}$/.test(phone)) {
    errors.push(translate(lang, 'validation.phone_bd'));
  }
  // A map link is rendered as an iframe or a button, so it goes through the same
  // filter as every other stored URL.
  if (mapUrl !== '' && safeUrl(mapUrl) === '') errors.push(translate(lang, 'abr.err_map'));

  const isMain = existing?.is_main ?? false;
  if (isMain && status !== 'active') errors.push(translate(lang, 'abr.err_main_inactive'));

  const upload = formData.get('image');
  let newImage: string | null = null;

  if (errors.length === 0 && upload instanceof File && upload.size > 0) {
    const check = await validateUpload(upload, [...IMAGE_EXTENSIONS], MAX_MB * 1048576);
    if (!check.ok) {
      errors.push(`${translate(lang, 'abr.image')}: ${check.error}`);
    } else {
      newImage = await putFile(
        'uploads/branches',
        uniqueFilename(check.ext, 'branch'),
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

  const oldImage = existing?.image ?? null;
  const removeImage = formData.get('remove_image') !== null;
  const image = newImage ?? (removeImage ? null : oldImage);

  const data = {
    name_bn: nameBn,
    name_en: nameEn,
    slug,
    address_bn: text('address_bn', 500) || null,
    address_en: text('address_en', 500) || null,
    description_bn: longText('description_bn', 4000) || null,
    description_en: longText('description_en', 4000) || null,
    phone: phone !== '' ? phone : null,
    email: email !== '' ? email : null,
    image,
    map_url: mapUrl !== '' ? mapUrl : null,
    status: status as 'active' | 'inactive',
    sort_order: sortOrder,
  };

  let savedId = id;
  try {
    if (id > 0) {
      await prisma.branch.update({ where: { id }, data });
    } else {
      // A new branch is never the main one; that is a separate decision.
      const created = await prisma.branch.create({ data: { ...data, is_main: false } });
      savedId = created.id;
    }

    await setBranchCourses(savedId, idList(formData, 'courses'));
    await setBranchTeachers(savedId, idList(formData, 'teachers'));
  } catch {
    if (newImage !== null) await deleteFile(newImage);
    return { errors: [translate(lang, 'error.generic')], message: '' };
  }

  if (oldImage !== null && oldImage !== '' && oldImage !== image) await deleteFile(oldImage);

  refresh();
  redirect('/admin/branches');
}

export async function toggleBranchAction(
  _prev: BranchState,
  formData: FormData
): Promise<BranchState> {
  await requireSuperAdmin();
  const lang = await getLang();

  const id = Number(formData.get('id') ?? 0);
  const branch = await prisma.branch.findUnique({ where: { id } }).catch(() => null);
  if (!branch) return { errors: [translate(lang, 'error.not_found_body')], message: '' };

  // Everything from before branches existed belongs to the main branch, so it
  // can never be switched off.
  if (branch.is_main && branch.status === 'active') {
    return { errors: [translate(lang, 'abr.err_main_inactive')], message: '' };
  }

  const next = branch.status === 'active' ? 'inactive' : 'active';
  try {
    await prisma.branch.update({ where: { id }, data: { status: next } });
  } catch {
    return { errors: [translate(lang, 'error.generic')], message: '' };
  }

  refresh();
  return {
    errors: [],
    message: translate(lang, next === 'active' ? 'abr.activated' : 'abr.deactivated'),
  };
}

export async function makeMainBranchAction(
  _prev: BranchState,
  formData: FormData
): Promise<BranchState> {
  await requireSuperAdmin();
  const lang = await getLang();

  const id = Number(formData.get('id') ?? 0);
  const branch = await prisma.branch.findUnique({ where: { id } }).catch(() => null);
  if (!branch) return { errors: [translate(lang, 'error.not_found_body')], message: '' };
  if (branch.status !== 'active') {
    return { errors: [translate(lang, 'abr.err_main_inactive')], message: '' };
  }

  try {
    // Exactly one branch is main, so both statements run together.
    await prisma.$transaction([
      prisma.branch.updateMany({ where: { is_main: true }, data: { is_main: false } }),
      prisma.branch.update({ where: { id }, data: { is_main: true } }),
    ]);
  } catch {
    return { errors: [translate(lang, 'error.generic')], message: '' };
  }

  refresh();
  return { errors: [], message: translate(lang, 'abr.main_set') };
}

export async function deleteBranchAction(
  _prev: BranchState,
  formData: FormData
): Promise<BranchState> {
  await requireSuperAdmin();
  const lang = await getLang();

  const id = Number(formData.get('id') ?? 0);
  const branch = await prisma.branch.findUnique({ where: { id } }).catch(() => null);
  if (!branch) return { errors: [translate(lang, 'error.not_found_body')], message: '' };
  if (branch.is_main) return { errors: [translate(lang, 'abr.err_main_delete')], message: '' };

  const dependents = await branchDependents(id);
  const tables = Object.entries(dependents);
  if (tables.length > 0) {
    const list = tables
      .map(([table, count]) => `${toLocalDigits(count, lang)} ${translate(lang, `abr.dep_${table}`)}`)
      .join(', ');
    return { errors: [translate(lang, 'abr.err_in_use', { list })], message: '' };
  }

  try {
    // branch_courses and branch_teachers cascade with it.
    await prisma.branch.delete({ where: { id } });
  } catch {
    return { errors: [translate(lang, 'abr.err_in_use', { list: '…' })], message: '' };
  }

  if (branch.image !== null && branch.image !== '') await deleteFile(branch.image);

  refresh();
  return { errors: [], message: translate(lang, 'abr.deleted') };
}
