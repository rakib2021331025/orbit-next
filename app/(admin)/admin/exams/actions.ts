'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/guards';
import { getLang, translate } from '@/lib/i18n';
import {
  saveExam,
  setExamStatus,
  setResultsPublished,
  deleteExam,
  saveQuestion,
  deleteQuestion,
  type ExamStatus,
} from '@/lib/exams/manage';

/**
 * The admin's exam actions, from admin/exams_management.php.
 *
 * These are the teacher's actions **without the ownership lock**: an
 * administrator may edit and mark any teacher's paper. That is the only
 * difference, and it is expressed by simply not passing a lock — the library
 * takes `lockTeacherId` as optional for exactly this reason.
 */

export interface ExamFormState {
  error: string;
  message: string;
}


function text(formData: FormData, field: string): string {
  return String(formData.get(field) ?? '');
}

async function present(outcome: { ok: boolean; message: string }): Promise<ExamFormState> {
  const message = translate(await getLang(), outcome.message);
  return outcome.ok ? { error: '', message } : { error: message, message: '' };
}

function refresh(examId?: number): void {
  revalidatePath('/admin/exams');
  revalidatePath('/admin/exam-evaluation');
  if (examId) revalidatePath(`/admin/exams/${examId}/questions`);
  // Published exams and results are what students see.
  revalidatePath('/student/exams');
}

export async function saveExamAction(
  _prev: ExamFormState,
  formData: FormData
): Promise<ExamFormState> {
  await requireAdmin();

  const result = await saveExam({
    id: Number(formData.get('id') ?? 0),
    title: text(formData, 'title'),
    exam_type: text(formData, 'exam_type'),
    subject: text(formData, 'subject'),
    course: text(formData, 'course'),
    batch: text(formData, 'batch'),
    instructions: text(formData, 'instructions'),
    pass_marks: text(formData, 'pass_marks'),
    duration_minutes: text(formData, 'duration_minutes'),
    start_datetime: text(formData, 'start_datetime'),
    end_datetime: text(formData, 'end_datetime'),
    negative_marking: text(formData, 'negative_marking'),
    allow_file_upload: formData.get('allow_file_upload') !== null,
    status: text(formData, 'status'),
    // An admin assigns the exam to a teacher explicitly.
    teacher_id: Number(formData.get('teacher_id') ?? 0),
    branch_id: null,
  });

  if (!result.ok) return present(result);

  refresh(result.examId);

  // A new exam has no questions yet, so the question editor is the useful
  // next screen.
  if (result.examId !== undefined && Number(formData.get('id') ?? 0) === 0) {
    redirect(`/admin/exams/${result.examId}/questions`);
  }

  return present(result);
}

export async function setExamStatusAction(
  _prev: ExamFormState,
  formData: FormData
): Promise<ExamFormState> {
  await requireAdmin();

  const result = await setExamStatus(
    Number(formData.get('exam_id') ?? 0),
    text(formData, 'status') as ExamStatus
  );
  refresh();
  return present(result);
}

export async function setResultsPublishedAction(
  _prev: ExamFormState,
  formData: FormData
): Promise<ExamFormState> {
  await requireAdmin();

  const result = await setResultsPublished(
    Number(formData.get('exam_id') ?? 0),
    text(formData, 'published') === '1'
  );
  refresh();
  return present(result);
}

export async function deleteExamAction(
  _prev: ExamFormState,
  formData: FormData
): Promise<ExamFormState> {
  await requireAdmin();

  const result = await deleteExam(Number(formData.get('exam_id') ?? 0));
  refresh();
  return present(result);
}

/* ---------------------------------------------------------------- questions */

export async function saveQuestionAction(
  _prev: ExamFormState,
  formData: FormData
): Promise<ExamFormState> {
  await requireAdmin();
  const examId = Number(formData.get('exam_id') ?? 0);

  const result = await saveQuestion({
    id: Number(formData.get('id') ?? 0),
    exam_id: examId,
    question_type: text(formData, 'question_type'),
    question_text: text(formData, 'question_text'),
    marks: text(formData, 'marks'),
    sort_order: text(formData, 'sort_order'),
    option_a: text(formData, 'option_a'),
    option_b: text(formData, 'option_b'),
    option_c: text(formData, 'option_c'),
    option_d: text(formData, 'option_d'),
    correct_option: text(formData, 'correct_option'),
  });

  refresh(examId);
  return present(result);
}

export async function deleteQuestionAction(
  _prev: ExamFormState,
  formData: FormData
): Promise<ExamFormState> {
  await requireAdmin();

  const examId = Number(formData.get('exam_id') ?? 0);
  const result = await deleteQuestion(Number(formData.get('question_id') ?? 0), examId);

  refresh(examId);
  return present(result);
}
