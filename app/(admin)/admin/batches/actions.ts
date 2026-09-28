'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin, adminBranchLock, ForbiddenError } from '@/lib/auth/guards';
import { getLang, translate, hasTranslation } from '@/lib/i18n';
import { toLocalDigits } from '@/lib/i18n/format';
import {
  saveBatch,
  toggleBatch,
  deleteBatch,
  saveCourseQuick,
  type BatchOutcome,
} from '@/lib/courses/batches';
import { invalidate, TAGS } from '@/lib/cache';

/**
 * The batch actions, from admin/batches_management.php.
 *
 * A branch-locked admin may manage their own branch's batches — that is why this
 * page is on their allow-list — but **not** the shared course fields, which is
 * why `saveCourseQuickAction` refuses them outright. A course's fee and status
 * are the same at every branch.
 */

export interface BatchState {
  error: string;
  message: string;
  /** Which field the error belongs to, so the form can point at it. */
  field: string;
}


function text(formData: FormData, field: string): string {
  return String(formData.get(field) ?? '');
}

async function present(
  outcome: BatchOutcome & { usage?: Record<string, number> }
): Promise<BatchState> {
  const lang = await getLang();

  const vars: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(outcome.vars ?? {})) {
    vars[name] =
      typeof value === 'number'
        ? toLocalDigits(value, lang)
        : hasTranslation(value)
          ? translate(lang, value)
          : value;
  }

  // "…because records still use it: 3 enrollments, 12 attendance records".
  if (outcome.usage) {
    vars.details = Object.entries(outcome.usage)
      .map(([table, count]) =>
        translate(lang, `abat.use_${table}`, { count: toLocalDigits(count, lang) })
      )
      .join(', ');
  }

  const message = translate(lang, outcome.message, vars);
  return outcome.ok
    ? { error: '', message, field: '' }
    : { error: message, message: '', field: outcome.field ?? '' };
}

function refresh(): void {
  revalidatePath('/admin/batches');
  invalidate(TAGS.courses, TAGS.branches);
  revalidatePath('/admin/courses');
  // Batches are what the public enroll flow offers.
  revalidatePath('/');
  revalidatePath('/courses');
  revalidatePath('/apply');
}

export async function saveBatchAction(_prev: BatchState, formData: FormData): Promise<BatchState> {
  await requireAdmin();

  const outcome = await saveBatch({
    id: Number(formData.get('batch_id') ?? 0),
    course_id: Number(formData.get('course_id') ?? 0),
    batch_type: text(formData, 'batch_type'),
    name: text(formData, 'name'),
    name_bn: text(formData, 'name_bn'),
    schedule_info: text(formData, 'schedule_info'),
    schedule_info_bn: text(formData, 'schedule_info_bn'),
    start_date: text(formData, 'start_date'),
    capacity: text(formData, 'capacity'),
    fee: text(formData, 'fee'),
    status: text(formData, 'status'),
    sort_order: text(formData, 'sort_order'),
    branch_id: text(formData, 'branch_id'),
  });

  if (outcome.ok) refresh();
  return present(outcome);
}

export async function toggleBatchAction(_prev: BatchState, formData: FormData): Promise<BatchState> {
  await requireAdmin();

  const outcome = await toggleBatch(Number(formData.get('batch_id') ?? 0));
  if (outcome.ok) refresh();
  return present(outcome);
}

export async function deleteBatchAction(_prev: BatchState, formData: FormData): Promise<BatchState> {
  await requireAdmin();

  const outcome = await deleteBatch(Number(formData.get('batch_id') ?? 0));
  if (outcome.ok) refresh();
  return present(outcome);
}

export async function saveCourseQuickAction(
  _prev: BatchState,
  formData: FormData
): Promise<BatchState> {
  await requireAdmin();

  // A course is shared by every branch, so a branch-locked admin does not edit
  // it even from this page.
  if ((await adminBranchLock()) > 0) throw new ForbiddenError('Courses are institute-wide');

  const outcome = await saveCourseQuick(
    Number(formData.get('course_id') ?? 0),
    text(formData, 'fee'),
    text(formData, 'duration'),
    text(formData, 'status')
  );

  if (outcome.ok) refresh();
  return present(outcome);
}
