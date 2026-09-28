'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireTeacher } from '@/lib/auth/guards';
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
 * The teacher's exam actions.
 *
 * **Every call passes `teacher.id` as the ownership lock.** A teacher can only
 * create exams assigned to themselves and can only touch their own — the exam id
 * in the form is checked against the lock inside the library rather than trusted
 * here.
 */

export interface ExamFormState {
  error: string;
  message: string;
}


function text(formData: FormData, field: string): string {
  return String(formData.get(field) ?? '');
}

/**
 * The library returns translation KEYS so that it stays usable from any
 * language. This is where they become words, in the reader's own.
 */
async function present(outcome: { ok: boolean; message: string }): Promise<ExamFormState> {
  const message = translate(await getLang(), outcome.message);
  return outcome.ok ? { error: '', message } : { error: message, message: '' };
}

export async function saveExamAction(
  _prev: ExamFormState,
  formData: FormData
): Promise<ExamFormState> {
  const teacher = await requireTeacher();

  const result = await saveExam(
    {
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
      // A teacher's exam is always their own.
      teacher_id: teacher.id,
      // A teacher does not choose a branch; the exam inherits the audience.
      branch_id: null,
    },
    teacher.id
  );

  if (!result.ok) return present(result);

  revalidatePath('/teacher/exams');

  // A new exam has no questions yet, so the useful next screen is the question
  // manager rather than the list it was created from.
  if (result.examId !== undefined && Number(formData.get('id') ?? 0) === 0) {
    redirect(`/teacher/exams/${result.examId}/questions`);
  }

  return present(result);
}

export async function setExamStatusAction(
  _prev: ExamFormState,
  formData: FormData
): Promise<ExamFormState> {
  const teacher = await requireTeacher();

  const examId = Number(formData.get('exam_id') ?? 0);
  const status = text(formData, 'status') as ExamStatus;

  const result = await setExamStatus(examId, status, teacher.id);
  revalidatePath('/teacher/exams');

  return present(result);
}

export async function setResultsPublishedAction(
  _prev: ExamFormState,
  formData: FormData
): Promise<ExamFormState> {
  const teacher = await requireTeacher();

  const examId = Number(formData.get('exam_id') ?? 0);
  const published = text(formData, 'published') === '1';

  const result = await setResultsPublished(examId, published, teacher.id);
  revalidatePath('/teacher/exams');

  return present(result);
}

export async function deleteExamAction(
  _prev: ExamFormState,
  formData: FormData
): Promise<ExamFormState> {
  const teacher = await requireTeacher();

  const result = await deleteExam(Number(formData.get('exam_id') ?? 0), teacher.id);
  revalidatePath('/teacher/exams');

  return present(result);
}

/* ---------------------------------------------------------------- questions */

export async function saveQuestionAction(
  _prev: ExamFormState,
  formData: FormData
): Promise<ExamFormState> {
  const teacher = await requireTeacher();
  const examId = Number(formData.get('exam_id') ?? 0);

  const result = await saveQuestion(
    {
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
    },
    teacher.id
  );

  revalidatePath(`/teacher/exams/${examId}/questions`);
  return present(result);
}

export async function deleteQuestionAction(
  _prev: ExamFormState,
  formData: FormData
): Promise<ExamFormState> {
  const teacher = await requireTeacher();

  const examId = Number(formData.get('exam_id') ?? 0);
  const questionId = Number(formData.get('question_id') ?? 0);

  const result = await deleteQuestion(questionId, examId, teacher.id);
  revalidatePath(`/teacher/exams/${examId}/questions`);

  return present(result);
}
