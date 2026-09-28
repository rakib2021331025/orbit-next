'use server';

import { prisma } from '@/lib/db/prisma';
import { requireStudentUnlocked } from '@/lib/auth/guards';
import { studentScope, scopeOpenWhere } from '@/lib/student/scope';
import { examAttempt, submitAttempt, secondsLeft } from '@/lib/exams/engine';
import { validateUpload, uniqueFilename } from '@/lib/storage/validate';
import { putFile, deleteFile } from '@/lib/storage/store';
import { readSession } from '@/lib/auth/session';
import { memoryLimit } from '@/lib/security/rate-limit';

/**
 * Taking an exam: start, save an answer, upload an answer sheet, submit.
 *
 * **Every one of these re-derives the exam from the student's own scope.** The
 * exam id arrives from the URL, so it is never trusted: a student who edits it to
 * another batch's exam is refused. The attempt is likewise found by
 * (exam, student) rather than by an attempt id, so there is no id to tamper with.
 *
 * Time is checked on the server on every save and on submit. The countdown in the
 * browser is a courtesy; the deadline is here.
 *
 * **Rate limits** are in-memory (lib/security/rate-limit.ts), not the DB-backed
 * throttle: autosave fires on every change, a DB throttle would add a COUNT and
 * an INSERT to each save, and the PHP original throttled none of this. The
 * ceilings sit far above a real student (saves are debounced to one per 800 ms
 * per question in ExamRunner) and exist only to blunt a script. They are keyed
 * by the session's student id, read from the signed cookie before any query.
 */

/** Abuse-level ceilings. A student typing flat out makes well under 100 saves a minute. */
const SAVES_PER_MINUTE = 300;
const UPLOADS_PER_TEN_MINUTES = 40;
/** exam_upload_answer.php's ORBIT_MAX_ANSWER_FILES. */
const MAX_ANSWER_FILES = 25;

/** False when this student has exceeded `max` calls of `action` in the window. */
async function withinLimit(action: string, max: number, windowMs: number): Promise<boolean> {
  const session = await readSession();
  // No session: the guard in openExamForStudent() redirects, so let it.
  if (!session) return true;
  return memoryLimit(`exam:${action}:${session.uid}`, max, windowMs);
}

/** The exam, only if it is published, open, and addressed to this student. */
async function openExamForStudent(examId: number) {
  const student = await requireStudentUnlocked();
  if (!Number.isInteger(examId) || examId <= 0) return null;

  const scope = await studentScope(student);
  const audience = scopeOpenWhere(scope, 'batch', 'course');

  try {
    const exam = await prisma.exam.findFirst({
      where: { AND: [{ id: examId }, { status: 'published' }, audience] },
    });
    return exam ? { student, exam } : null;
  } catch {
    return null;
  }
}

export interface TakeResult {
  ok: boolean;
  /** A translation key, so the page can render it in the reader's language. */
  message: string;
}

/** Starts the attempt, or returns the existing one. */
export async function startExamAction(examId: number): Promise<TakeResult> {
  const found = await openExamForStudent(examId);
  if (!found) return { ok: false, message: 'oex.take_flash_not_yours' };

  const { student, exam } = found;
  const now = Date.now();
  if (now < exam.start_datetime.getTime() || now > exam.end_datetime.getTime()) {
    return { ok: false, message: 'oex.take_flash_closed' };
  }

  const questions = await prisma.examQuestion.count({ where: { exam_id: exam.id } });
  if (questions === 0) return { ok: false, message: 'oex.take_flash_no_questions' };

  const attempt = await examAttempt(exam.id, student.id, true);
  if (!attempt) return { ok: false, message: 'oex.take_flash_could_not_start' };
  if (attempt.status !== 'in_progress') {
    return { ok: false, message: 'oex.take_flash_already' };
  }

  return { ok: true, message: '' };
}

/**
 * Saves one answer.
 *
 * Called on every change, so it must be idempotent and cheap: it upserts the one
 * answer row and nothing else. A save after the deadline is refused rather than
 * accepted quietly — otherwise the timer would be decorative.
 */
export async function saveAnswerAction(
  examId: number,
  questionId: number,
  value: { option?: string | null; text?: string | null }
): Promise<TakeResult> {
  if (!(await withinLimit('save', SAVES_PER_MINUTE, 60_000))) {
    return { ok: false, message: 'ai.err.rate' };
  }
  // Server-action arguments arrive from the client, so their shape is a claim.
  if (!Number.isInteger(questionId) || questionId <= 0) {
    return { ok: false, message: 'oex.err_q_not_found' };
  }
  const answer = value !== null && typeof value === 'object' ? value : {};
  const optionIn = typeof answer.option === 'string' ? answer.option : '';
  const textIn = typeof answer.text === 'string' ? answer.text : '';

  const found = await openExamForStudent(examId);
  if (!found) return { ok: false, message: 'oex.take_flash_not_yours' };

  const { student, exam } = found;
  const attempt = await examAttempt(exam.id, student.id);
  if (!attempt || attempt.status !== 'in_progress') {
    return { ok: false, message: 'oex.take_already_msg' };
  }
  if (secondsLeft(exam, attempt) <= 0) {
    // Out of time: close the attempt rather than accept the answer.
    await submitAttempt(attempt.id, 'auto');
    return { ok: false, message: 'oex.take_expired_msg' };
  }

  try {
    // The question must belong to THIS exam, or a student could write answers
    // into another exam's questions.
    const question = await prisma.examQuestion.findFirst({
      where: { id: questionId, exam_id: exam.id },
      select: { id: true, question_type: true },
    });
    if (!question) return { ok: false, message: 'oex.err_q_not_found' };

    const option =
      question.question_type === 'mcq' && ['a', 'b', 'c', 'd'].includes(optionIn)
        ? (optionIn as 'a' | 'b' | 'c' | 'd')
        : null;
    const text = question.question_type === 'cq' ? textIn.slice(0, 20000) : null;

    await prisma.examAnswer.upsert({
      where: { attempt_id_question_id: { attempt_id: attempt.id, question_id: question.id } },
      update: { selected_option: option, answer_text: text },
      create: {
        attempt_id: attempt.id,
        question_id: question.id,
        selected_option: option,
        answer_text: text,
        awarded_marks: 0,
      },
    });
    return { ok: true, message: 'oex.take_saved' };
  } catch {
    return { ok: false, message: 'oex.take_not_saved' };
  }
}

/** Uploads an answer-sheet file for a CQ question. */
export async function uploadAnswerFileAction(
  examId: number,
  formData: FormData
): Promise<TakeResult> {
  if (!(await withinLimit('upload', UPLOADS_PER_TEN_MINUTES, 600_000))) {
    return { ok: false, message: 'ai.err.rate' };
  }
  const found = await openExamForStudent(examId);
  if (!found) return { ok: false, message: 'oex.take_flash_not_yours' };

  const { student, exam } = found;
  const attempt = await examAttempt(exam.id, student.id);
  if (!attempt || attempt.status !== 'in_progress') {
    return { ok: false, message: 'oex.take_already_msg' };
  }
  if (secondsLeft(exam, attempt) <= 0) {
    await submitAttempt(attempt.id, 'auto');
    return { ok: false, message: 'oex.take_expired_msg' };
  }

  // The original's per-exam cap: without it one attempt could fill the bucket.
  const already = await prisma.examAnswerFile
    .count({ where: { attempt_id: attempt.id } })
    .catch(() => 0);
  if (already >= MAX_ANSWER_FILES) return { ok: false, message: 'oex.take_upload_failed' };

  const file = formData instanceof FormData ? formData.get('file') : null;
  const check = await validateUpload(
    file instanceof File ? file : null,
    ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
    10 * 1024 * 1024
  );
  if (!check.ok || !check.bytes) return { ok: false, message: check.error };

  const stored = await putFile(
    'uploads/submissions',
    uniqueFilename(check.ext, `ans${attempt.id}`),
    check.bytes,
    check.mime || undefined
  );
  if (!stored) return { ok: false, message: 'upload.save_failed' };

  try {
    await prisma.examAnswerFile.create({
      data: {
        attempt_id: attempt.id,
        file_path: stored,
        file_type: check.ext === 'pdf' ? 'pdf' : 'image',
        file_size: check.bytes.length,
      },
    });
    return { ok: true, message: 'oex.take_uploaded' };
  } catch {
    return { ok: false, message: 'oex.take_upload_failed' };
  }
}

/** Removes one of the student's own uploaded files. */
export async function removeAnswerFileAction(examId: number, fileId: number): Promise<TakeResult> {
  if (!Number.isInteger(fileId) || fileId <= 0) return { ok: false, message: 'oex.take_remove_failed' };
  const found = await openExamForStudent(examId);
  if (!found) return { ok: false, message: 'oex.take_flash_not_yours' };

  const { student, exam } = found;
  const attempt = await examAttempt(exam.id, student.id);
  if (!attempt || attempt.status !== 'in_progress') {
    return { ok: false, message: 'oex.take_already_msg' };
  }

  try {
    // Keyed to this attempt, so one student cannot delete another's file.
    const file = await prisma.examAnswerFile.findFirst({
      where: { id: fileId, attempt_id: attempt.id },
      select: { id: true, file_path: true },
    });
    if (!file) return { ok: false, message: 'oex.take_remove_failed' };

    await prisma.examAnswerFile.delete({ where: { id: file.id } });
    await deleteFile(file.file_path);
    return { ok: true, message: 'oex.take_removed' };
  } catch {
    return { ok: false, message: 'oex.take_remove_failed' };
  }
}

/** Final submit. */
export async function submitExamAction(examId: number): Promise<TakeResult> {
  const found = await openExamForStudent(examId);
  if (!found) return { ok: false, message: 'oex.take_flash_not_yours' };

  const { student, exam } = found;
  const attempt = await examAttempt(exam.id, student.id);
  if (!attempt) return { ok: false, message: 'oex.take_flash_not_found' };

  const done = await submitAttempt(attempt.id, 'manual');
  // A second submit is not an error: the button, the timer and sendBeacon can all
  // fire, and the student should be told it is already in.
  return done
    ? { ok: true, message: 'oex.take_flash_submitted' }
    : { ok: true, message: 'oex.take_flash_already' };
}
