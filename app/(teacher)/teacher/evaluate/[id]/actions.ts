'use server';

import { revalidatePath } from 'next/cache';
import { requireTeacher } from '@/lib/auth/guards';
import { getLang, translate } from '@/lib/i18n';
import { saveEvaluation, reopenEvaluation } from '@/lib/exams/evaluation';

export interface EvaluateState {
  error: string;
  message: string;
}


/**
 * The library returns translation KEYS so that it stays usable from any
 * language. This is where they become words, in the reader's own.
 */
async function present(outcome: { ok: boolean; message: string }): Promise<EvaluateState> {
  const message = translate(await getLang(), outcome.message);
  return outcome.ok ? { error: '', message } : { error: message, message: '' };
}

/**
 * Saves or finalises an evaluation.
 *
 * **`lockTeacherId` is always the signed-in teacher.** It is passed on every
 * call, so a teacher can only ever mark a submission on their own exam — the
 * attempt id in the form is re-checked against it rather than trusted.
 *
 * The marks arrive as `marks[<question id>]`, so the form can grow a question
 * without this needing to know how many there are.
 */
export async function saveEvaluationAction(
  _prev: EvaluateState,
  formData: FormData
): Promise<EvaluateState> {
  const teacher = await requireTeacher();

  const attemptId = Number(formData.get('attempt_id') ?? 0);
  if (!Number.isInteger(attemptId) || attemptId <= 0) {
    return present({ ok: false, message: 'oex.err_invalid_submission' });
  }

  const finalise = String(formData.get('action') ?? '') === 'finalise';
  const overall = String(formData.get('teacher_comment') ?? '').trim();

  const marks: Record<number, string> = {};
  const comments: Record<number, string> = {};
  for (const [key, value] of formData.entries()) {
    const markMatch = key.match(/^marks\[(\d+)\]$/);
    if (markMatch) marks[Number(markMatch[1])] = String(value);

    const commentMatch = key.match(/^comments\[(\d+)\]$/);
    if (commentMatch) comments[Number(commentMatch[1])] = String(value);
  }

  const result = await saveEvaluation(
    attemptId,
    teacher.id,
    marks,
    comments,
    overall,
    finalise,
    // The ownership lock.
    teacher.id
  );

  revalidatePath(`/teacher/evaluate/${attemptId}`);
  revalidatePath('/teacher/evaluations');

  return present(result);
}

/** Puts a finished evaluation back in the queue. */
export async function reopenAction(
  _prev: EvaluateState,
  formData: FormData
): Promise<EvaluateState> {
  const teacher = await requireTeacher();
  const attemptId = Number(formData.get('attempt_id') ?? 0);

  const result = await reopenEvaluation(attemptId, teacher.id);

  revalidatePath(`/teacher/evaluate/${attemptId}`);
  revalidatePath('/teacher/evaluations');

  return present(result);
}
