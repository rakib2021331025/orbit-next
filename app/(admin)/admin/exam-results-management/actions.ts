'use server';

import { revalidatePath } from 'next/cache';
import { invalidate, TAGS } from '@/lib/cache';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { getLang, translate } from '@/lib/i18n';
import { deleteResult, saveResult } from '@/lib/exams/results';

/**
 * Hand-entered result actions, from the POST half of
 * admin/exam_results_management.php.
 *
 * Both actions refuse a row that belongs to a monthly exam — the library
 * carries that rule in its own WHERE, so it holds whatever the form sends.
 */

export interface ResultState {
  error: string;
  message: string;
}

function refresh(studentId: number): void {
  revalidatePath('/admin/exam-results-management');
  invalidate(TAGS.exams);
  if (studentId > 0) revalidatePath(`/admin/students/${studentId}`);
  revalidatePath('/student/results');
}

export async function saveResultAction(
  _prev: ResultState,
  formData: FormData
): Promise<ResultState> {
  await requireSuperAdmin();
  const lang = await getLang();

  const studentId = Number(formData.get('student_id') ?? 0);
  const outcome = await saveResult({
    id: Number(formData.get('id') ?? 0),
    studentId,
    examName: String(formData.get('exam_name') ?? ''),
    subject: String(formData.get('subject') ?? ''),
    marks: String(formData.get('marks_obtained') ?? ''),
    total: String(formData.get('total_marks') ?? ''),
    grade: String(formData.get('grade') ?? ''),
    feedback: String(formData.get('feedback') ?? ''),
    examDate: String(formData.get('exam_date') ?? ''),
  });

  const text = translate(lang, outcome.message, outcome.vars);
  if (!outcome.ok) return { error: text, message: '' };

  refresh(studentId);
  return { error: '', message: text };
}

export async function deleteResultAction(
  _prev: ResultState,
  formData: FormData
): Promise<ResultState> {
  await requireSuperAdmin();
  const lang = await getLang();

  const outcome = await deleteResult(Number(formData.get('id') ?? 0));
  const text = translate(lang, outcome.message);
  if (!outcome.ok) return { error: text, message: '' };

  refresh(Number(formData.get('student_id') ?? 0));
  return { error: '', message: text };
}
