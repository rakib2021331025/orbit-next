'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/guards';
import { getLang, translate } from '@/lib/i18n';
import { saveEvaluation, reopenEvaluation } from '@/lib/exams/evaluation';

/**
 * Marking one submission as an administrator, from admin/exam_evaluate.php.
 *
 * **No ownership lock**: an admin marks on behalf of any teacher. The evaluator
 * recorded on the attempt is still the person who did the marking — the admin's
 * own id — so who awarded the marks stays traceable.
 */

export interface EvaluateState {
  error: string;
  message: string;
}


async function present(outcome: { ok: boolean; message: string }): Promise<EvaluateState> {
  const message = translate(await getLang(), outcome.message);
  return outcome.ok ? { error: '', message } : { error: message, message: '' };
}

export async function saveEvaluationAction(
  _prev: EvaluateState,
  formData: FormData
): Promise<EvaluateState> {
  const admin = await requireAdmin();

  const attemptId = Number(formData.get('attempt_id') ?? 0);
  if (!Number.isInteger(attemptId) || attemptId <= 0) {
    return present({ ok: false, message: 'oex.err_invalid_submission' });
  }

  const finalise = String(formData.get('action') ?? '') === 'finalise';
  const overall = String(formData.get('teacher_comment') ?? '').trim();

  // The marks arrive as `marks[<question id>]`, so the form can grow a question
  // without this needing to know how many there are.
  const marks: Record<number, string> = {};
  const comments: Record<number, string> = {};
  for (const [key, value] of formData.entries()) {
    const markMatch = /^marks\[(\d+)\]$/.exec(key);
    if (markMatch) marks[Number(markMatch[1])] = String(value);

    const commentMatch = /^comments\[(\d+)\]$/.exec(key);
    if (commentMatch) comments[Number(commentMatch[1])] = String(value);
  }

  const result = await saveEvaluation(attemptId, admin.id, marks, comments, overall, finalise);

  revalidatePath(`/admin/evaluate/${attemptId}`);
  revalidatePath('/admin/exam-evaluation');
  revalidatePath('/student/exams');

  return present(result);
}

/** Puts a finished evaluation back in the queue. */
export async function reopenAction(
  _prev: EvaluateState,
  formData: FormData
): Promise<EvaluateState> {
  await requireAdmin();

  const attemptId = Number(formData.get('attempt_id') ?? 0);
  const result = await reopenEvaluation(attemptId);

  revalidatePath(`/admin/evaluate/${attemptId}`);
  revalidatePath('/admin/exam-evaluation');

  return present(result);
}
