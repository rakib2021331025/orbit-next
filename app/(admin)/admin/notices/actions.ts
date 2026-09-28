'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin, requireRecordBranch } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/prisma';
import { getLang, translate } from '@/lib/i18n';
import { contentBranchId } from '@/lib/branch/assign';
import { invalidate, TAGS } from '@/lib/cache';

/**
 * Notice actions, from admin/notice_management.php.
 *
 * A notice is content, so its branch may be **null — every branch** — and
 * `contentBranchId()` is what decides: a branch-locked admin always writes to
 * their own branch, an all-branch admin chooses.
 *
 * Only `status = 'active'` notices reach the public board and the student
 * portal, so deactivating is the reversible way to take one down; deleting is
 * for a notice posted by mistake.
 */

export interface NoticeState {
  error: string;
  message: string;
}

/** A long title cut down for a toast. */
function shortTitle(title: string): string {
  const clean = title.trim();
  return clean.length > 60 ? `${clean.slice(0, 60)}…` : clean;
}

function refresh(): void {
  revalidatePath('/admin/notices');
  invalidate(TAGS.notices);
  // The public board and the student portal both read active notices.
  revalidatePath('/notices');
  revalidatePath('/student/notices');
  revalidatePath('/');
}

export async function saveNoticeAction(
  _prev: NoticeState,
  formData: FormData
): Promise<NoticeState> {
  await requireAdmin();
  const lang = await getLang();

  const id = Number(formData.get('id') ?? 0);
  if (id > 0) {
    const existing = await prisma.notice
      .findUnique({ where: { id }, select: { id: true } })
      .catch(() => null);
    if (!existing) return { error: translate(lang, 'anotice.not_found'), message: '' };
    await requireRecordBranch('notice', id, false);
  }

  const title = String(formData.get('title') ?? '').trim().slice(0, 255);
  const description = String(formData.get('description') ?? '').trim().slice(0, 20000);
  const status = formData.get('status') === 'inactive' ? 'inactive' : 'active';

  if (title === '') return { error: translate(lang, 'anotice.err_title'), message: '' };
  if (description === '') return { error: translate(lang, 'anotice.err_desc'), message: '' };

  const data = {
    title,
    description,
    status: status as 'active' | 'inactive',
    branch_id: await contentBranchId(formData.get('branch_id')),
  };

  try {
    if (id > 0) await prisma.notice.update({ where: { id }, data });
    else await prisma.notice.create({ data });
  } catch {
    return { error: translate(lang, 'error.generic'), message: '' };
  }

  refresh();
  return {
    error: '',
    message: translate(lang, id > 0 ? 'anotice.updated' : 'anotice.created', {
      title: shortTitle(title),
    }),
  };
}

export async function toggleNoticeAction(
  _prev: NoticeState,
  formData: FormData
): Promise<NoticeState> {
  await requireAdmin();
  const lang = await getLang();

  const id = Number(formData.get('id') ?? 0);
  const notice = await prisma.notice
    .findUnique({ where: { id }, select: { id: true, title: true, status: true } })
    .catch(() => null);
  if (!notice) return { error: translate(lang, 'anotice.not_found'), message: '' };

  await requireRecordBranch('notice', id, false);

  const next = notice.status === 'active' ? 'inactive' : 'active';
  try {
    await prisma.notice.update({ where: { id }, data: { status: next } });
  } catch {
    return { error: translate(lang, 'error.generic'), message: '' };
  }

  refresh();
  return {
    error: '',
    message: translate(lang, next === 'active' ? 'anotice.activated' : 'anotice.deactivated', {
      title: shortTitle(notice.title),
    }),
  };
}

export async function deleteNoticeAction(
  _prev: NoticeState,
  formData: FormData
): Promise<NoticeState> {
  await requireAdmin();
  const lang = await getLang();

  const id = Number(formData.get('id') ?? 0);
  const notice = await prisma.notice
    .findUnique({ where: { id }, select: { id: true, title: true } })
    .catch(() => null);
  if (!notice) return { error: translate(lang, 'anotice.not_found'), message: '' };

  await requireRecordBranch('notice', id, false);

  try {
    await prisma.notice.delete({ where: { id } });
  } catch {
    return { error: translate(lang, 'error.generic'), message: '' };
  }

  refresh();
  return {
    error: '',
    message: translate(lang, 'anotice.deleted', { title: shortTitle(notice.title) }),
  };
}
