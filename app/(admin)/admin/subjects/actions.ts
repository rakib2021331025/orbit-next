'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/prisma';
import { getLang, translate } from '@/lib/i18n';
import { toLocalDigits } from '@/lib/i18n/format';
import { emptySubjectState } from './state';

/**
 * The subject list's actions, from admin/subjects.php.
 *
 * **A subject used by an exam is never deleted**, only made inactive. Each exam
 * also keeps its own copy of the subject names, so deleting the master row would
 * not corrupt old marksheets — but it would remove the subject from the list of
 * things you can build a new exam from while old exams still show it, which is
 * confusing in exactly the wrong place.
 */

export interface SubjectState {
  error: string;
  message: string;
}


export async function saveSubjectAction(
  _prev: SubjectState,
  formData: FormData
): Promise<SubjectState> {
  await requireAdmin();
  const lang = await getLang();

  const id = Number(formData.get('id') ?? 0);
  const name = String(formData.get('name') ?? '').trim().slice(0, 150);
  const nameBn = String(formData.get('name_bn') ?? '').trim().slice(0, 150);
  const code = String(formData.get('code') ?? '').trim().slice(0, 30);
  const sortOrder = Number(formData.get('sort_order') ?? 0) || 0;
  const status = formData.get('status') === 'inactive' ? 'inactive' : 'active';

  if (name === '') return { error: translate(lang, 'subj.name_required'), message: '' };

  // Case-insensitive, because "Physics" and "physics" are the same subject and
  // two of them in the exam builder is a support call.
  const clash = await prisma.subject
    .findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, NOT: { id: id > 0 ? id : -1 } },
      select: { id: true },
    })
    .catch(() => null);
  if (clash) return { error: translate(lang, 'subj.duplicate'), message: '' };

  const data = {
    name,
    name_bn: nameBn !== '' ? nameBn : null,
    code: code !== '' ? code : null,
    sort_order: sortOrder,
    status: status as 'active' | 'inactive',
  };

  try {
    if (id > 0) await prisma.subject.update({ where: { id }, data });
    else await prisma.subject.create({ data });
  } catch {
    return { error: translate(lang, 'error.generic'), message: '' };
  }

  revalidatePath('/admin/subjects');
  return { error: '', message: translate(lang, 'subj.saved') };
}

export async function toggleSubjectAction(
  _prev: SubjectState,
  formData: FormData
): Promise<SubjectState> {
  await requireAdmin();
  const lang = await getLang();

  const id = Number(formData.get('id') ?? 0);
  if (!Number.isInteger(id) || id <= 0) return emptySubjectState;

  try {
    const subject = await prisma.subject.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!subject) return emptySubjectState;

    await prisma.subject.update({
      where: { id },
      data: { status: subject.status === 'active' ? 'inactive' : 'active' },
    });
  } catch {
    return { error: translate(lang, 'error.generic'), message: '' };
  }

  revalidatePath('/admin/subjects');
  return { error: '', message: translate(lang, 'subj.status_changed') };
}

export async function deleteSubjectAction(
  _prev: SubjectState,
  formData: FormData
): Promise<SubjectState> {
  await requireAdmin();
  const lang = await getLang();

  const id = Number(formData.get('id') ?? 0);
  if (!Number.isInteger(id) || id <= 0) return emptySubjectState;

  // How many exams use it — the count is in the refusal, so the admin knows
  // whether it is one old exam or forty.
  const used = await prisma.monthlyExamSubject
    .findMany({ where: { subject_id: id }, distinct: ['exam_id'], select: { exam_id: true } })
    .catch(() => []);

  if (used.length > 0) {
    return {
      error: translate(lang, 'subj.in_use', { count: toLocalDigits(used.length, lang) }),
      message: '',
    };
  }

  try {
    await prisma.subject.delete({ where: { id } });
  } catch {
    return { error: translate(lang, 'error.generic'), message: '' };
  }

  revalidatePath('/admin/subjects');
  return { error: '', message: translate(lang, 'subj.deleted') };
}
