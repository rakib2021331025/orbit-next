'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { getLang, translate } from '@/lib/i18n';
import { toLatinDigits } from '@/lib/results/grades';
import { saveSettings } from '@/lib/settings/save';
import {
  MERIT_SIZE_MAX,
  MERIT_SIZE_MIN,
  deleteExam,
  saveExam,
  toggleExamStatus,
  type SubjectRowInput,
} from '@/lib/exams/monthly';
import { invalidate, TAGS } from '@/lib/cache';

/**
 * Monthly exam actions, from the POST half of admin/monthly_exams.php.
 *
 * Creating an exam lands on its marks page — the exam was created in order to
 * enter marks, and making somebody find it again in the list is a step nobody
 * wants. Editing an existing one goes back to the list.
 */

export interface ExamFormState {
  /** Several errors at once: one bad subject row should not hide the others. */
  errors: string[];
  message: string;
}

export interface MeritState {
  error: string;
  message: string;
}

function refresh(examId = 0): void {
  revalidatePath('/admin/monthly-exams');
  invalidate(TAGS.exams, TAGS.home, TAGS.stats);
  if (examId > 0) {
    revalidatePath(`/admin/monthly-exams/${examId}/edit`);
    revalidatePath(`/admin/monthly-exams/${examId}/marks`);
  }
  // Published results reach the student portal and the public results page.
  revalidatePath('/admin/reports');
  revalidatePath('/student/results');
  revalidatePath('/results');
}

/** The subject rows arrive as `subjects[<key>][field]`, as the original posts them. */
function readSubjects(formData: FormData): SubjectRowInput[] {
  const byKey = new Map<string, Partial<Record<string, string>>>();
  const order: string[] = [];

  for (const [name, value] of formData.entries()) {
    const match = /^subjects\[([^\]]+)\]\[([a-z_]+)\]$/.exec(name);
    if (!match) continue;
    const [, key, field] = match;
    if (!byKey.has(key)) {
      byKey.set(key, {});
      order.push(key);
    }
    byKey.get(key)![field] = String(value);
  }

  return order.map((key) => {
    const row = byKey.get(key)!;
    return {
      id: Number(row.id ?? 0),
      subjectId: Number(row.subject_id ?? 0),
      name: row.name ?? '',
      nameBn: row.name_bn ?? '',
      full: row.full ?? '',
      pass: row.pass ?? '',
    };
  });
}

export async function saveExamAction(
  _prev: ExamFormState,
  formData: FormData
): Promise<ExamFormState> {
  const admin = await requireSuperAdmin();
  const lang = await getLang();

  const id = Number(formData.get('id') ?? 0);
  const result = await saveExam(
    {
      id,
      title: String(formData.get('title') ?? ''),
      titleBn: String(formData.get('title_bn') ?? ''),
      month: String(formData.get('exam_month') ?? ''),
      examDate: String(formData.get('exam_date') ?? ''),
      courseId: Number(formData.get('course_id') ?? 0),
      batchId: Number(formData.get('batch_id') ?? 0),
      showPosition: formData.get('show_position') !== null,
      remarks: String(formData.get('remarks') ?? ''),
      subjects: readSubjects(formData),
    },
    admin.id
  );

  if (!result.ok) {
    // Duplicate messages would repeat for every offending row.
    const seen = new Set<string>();
    const errors: string[] = [];
    for (const error of result.errors) {
      const text = translate(lang, error.key, error.vars);
      if (seen.has(text)) continue;
      seen.add(text);
      errors.push(text);
    }
    return { errors, message: '' };
  }

  refresh(result.examId);
  redirect(
    result.updated
      ? '/admin/monthly-exams'
      : `/admin/monthly-exams/${result.examId}/marks?created=1`
  );
}

export async function toggleExamAction(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const id = Number(formData.get('id') ?? 0);
  const result = await toggleExamStatus(id);
  if (result.ok) refresh(id);
}

export async function deleteExamAction(
  _prev: ExamFormState,
  formData: FormData
): Promise<ExamFormState> {
  await requireSuperAdmin();
  const lang = await getLang();

  const id = Number(formData.get('id') ?? 0);
  const result = await deleteExam(id);
  if (!result.ok) return { errors: [translate(lang, result.message)], message: '' };

  refresh();
  return { errors: [], message: translate(lang, result.message) };
}

/**
 * The public-results options: merit lists, how many places they show, and
 * whether anybody may look a result up.
 */
export async function saveMeritOptionsAction(
  _prev: MeritState,
  formData: FormData
): Promise<MeritState> {
  await requireSuperAdmin();
  const lang = await getLang();

  // Bangla digits are what somebody typing on a Bangla keyboard produces.
  const sizeRaw = toLatinDigits(formData.get('merit_list_size') ?? '').trim();
  const size = Number(sizeRaw);
  if (!/^\d{1,3}$/.test(sizeRaw) || size < MERIT_SIZE_MIN || size > MERIT_SIZE_MAX) {
    return { error: translate(lang, 'merit.admin_err_size'), message: '' };
  }

  const saved = await saveSettings({
    merit_list_public: formData.get('merit_list_public') !== null ? '1' : '0',
    merit_list_size: String(size),
    result_search_public: formData.get('result_search_public') !== null ? '1' : '0',
  });
  if (!saved) return { error: translate(lang, 'error.generic'), message: '' };

  refresh();
  return { error: '', message: translate(lang, 'merit.admin_saved') };
}
