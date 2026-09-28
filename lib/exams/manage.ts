import 'server-only';
import { prisma } from '@/lib/db/prisma';

/**
 * Creating and editing exams and their questions, from includes/exam_lib.php.
 *
 * Shared by the teacher screen and the admin screen. **`lockTeacherId` is the
 * difference**: when it is set, every read and write is restricted to that
 * teacher's own exams and a new exam is assigned to them. The teacher screen
 * always sets it; the admin screen never does.
 *
 * The validation order is the original's, and a failure returns before anything
 * is written — a half-saved exam with no end date would be worse than a refusal.
 */

export type ExamType = 'mcq' | 'cq' | 'mixed';
export type ExamStatus = 'draft' | 'published' | 'cancelled';

export interface ExamInput {
  id: number;
  title: string;
  exam_type: string;
  subject: string;
  course: string;
  batch: string;
  instructions: string;
  pass_marks: string;
  duration_minutes: string;
  start_datetime: string;
  end_datetime: string;
  negative_marking: string;
  allow_file_upload: boolean;
  status: string;
  teacher_id: number;
  branch_id: number | null;
}

export interface SaveOutcome {
  ok: boolean;
  /** A translation key. */
  message: string;
  examId?: number;
}

/** True when this actor may touch this exam. Admins (no lock) pass everything. */
async function canTouch(examId: number, lockTeacherId?: number): Promise<boolean> {
  if (lockTeacherId === undefined) return true;
  try {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      select: { teacher_id: true },
    });
    return exam !== null && exam.teacher_id === lockTeacherId;
  } catch {
    return false;
  }
}

function parseDateTime(value: string): Date | null {
  if (value.trim() === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function saveExam(input: ExamInput, lockTeacherId?: number): Promise<SaveOutcome> {
  const id = Number(input.id) || 0;

  if (id > 0 && !(await canTouch(id, lockTeacherId))) {
    return { ok: false, message: 'oex.err_own_edit' };
  }

  const examType: ExamType = (['mcq', 'cq', 'mixed'] as const).includes(input.exam_type as ExamType)
    ? (input.exam_type as ExamType)
    : 'mcq';
  const status: ExamStatus = (['draft', 'published', 'cancelled'] as const).includes(
    input.status as ExamStatus
  )
    ? (input.status as ExamStatus)
    : 'draft';

  const title = input.title.trim();
  const subject = input.subject.trim();
  const course = input.course.trim();
  const batch = input.batch.trim();
  const instructions = input.instructions.trim();

  const start = parseDateTime(input.start_datetime);
  const end = parseDateTime(input.end_datetime);
  const duration = Number(input.duration_minutes) || 0;
  const passMarks = Number(input.pass_marks) || 0;
  const negative = Number(input.negative_marking) || 0;

  // Validated in the original's order; the first failure returns.
  if (title === '') return { ok: false, message: 'oex.err_title' };
  if (title.length > 255) return { ok: false, message: 'oex.err_too_long' };
  if (subject === '') return { ok: false, message: 'oex.err_subject' };
  if (subject.length > 150 || course.length > 150 || batch.length > 150) {
    return { ok: false, message: 'oex.err_too_long' };
  }
  if (instructions.length > 5000) return { ok: false, message: 'oex.err_too_long' };
  if (start === null) return { ok: false, message: 'oex.err_start' };
  if (end === null) return { ok: false, message: 'oex.err_end' };
  if (end <= start) return { ok: false, message: 'oex.err_end_before' };
  if (duration < 1 || duration > 600) return { ok: false, message: 'oex.err_duration' };
  if (passMarks < 0 || passMarks > 9999) return { ok: false, message: 'oex.err_pass' };
  if (negative < 0 || negative > 10) return { ok: false, message: 'oex.err_negative' };

  // A batch without a course would address a batch NAME across every course —
  // exactly the leak the audience scope exists to prevent.
  if (batch !== '' && course === '') {
    return { ok: false, message: 'oex.err_batch_needs_course' };
  }

  const teacherId = lockTeacherId ?? (Number(input.teacher_id) || 0);
  if (lockTeacherId === undefined && teacherId <= 0) {
    return { ok: false, message: 'oex.err_teacher' };
  }

  const data = {
    title,
    exam_type: examType,
    subject,
    course: course !== '' ? course : null,
    batch: batch !== '' ? batch : null,
    instructions: instructions !== '' ? instructions : null,
    pass_marks: passMarks,
    duration_minutes: duration,
    start_datetime: start,
    end_datetime: end,
    negative_marking: negative,
    allow_file_upload: input.allow_file_upload,
    status,
    teacher_id: teacherId,
    branch_id: input.branch_id,
  };

  try {
    if (id > 0) {
      const previous = await prisma.exam.findUnique({
        where: { id },
        select: { status: true, batch: true, course: true, branch_id: true },
      });
      if (!previous) return { ok: false, message: 'oex.err_not_found' };

      // Publishing needs at least one question, or students open an empty paper.
      if (status === 'published' && previous.status !== 'published') {
        const questions = await prisma.examQuestion.count({ where: { exam_id: id } });
        if (questions === 0) {
          return { ok: false, message: 'oex.err_publish_no_questions' };
        }
      }

      await prisma.exam.update({ where: { id }, data });

      // Students are told only on the transition INTO published, not on every
      // later edit — otherwise a typo fix notifies the whole batch.
      if (status === 'published' && previous.status !== 'published') {
        await notifyPublished(id, course, batch, title, subject, start, input.branch_id);
        return { ok: true, message: 'oex.msg_published', examId: id };
      }
      return { ok: true, message: 'oex.msg_exam_updated', examId: id };
    }

    // A new exam starts as a draft whatever was asked for: it has no questions
    // yet, so publishing it immediately would be publishing an empty paper.
    const created = await prisma.exam.create({
      data: {
        ...data,
        status: 'draft',
        total_marks: 0,
        // No database default on these two, so they are set explicitly.
        result_published: false,
        created_by: teacherId,
        created_by_type: lockTeacherId !== undefined ? 'teacher' : 'admin',
      },
      select: { id: true },
    });
    return { ok: true, message: 'oex.msg_exam_created', examId: created.id };
  } catch {
    return { ok: false, message: 'oex.err_save_exam' };
  }
}

/** Changes an exam's status. */
export async function setExamStatus(
  examId: number,
  status: ExamStatus,
  lockTeacherId?: number
): Promise<SaveOutcome> {
  if (!(await canTouch(examId, lockTeacherId))) {
    return { ok: false, message: 'oex.err_own_manage' };
  }

  try {
    if (status === 'published') {
      const questions = await prisma.examQuestion.count({ where: { exam_id: examId } });
      if (questions === 0) return { ok: false, message: 'oex.err_publish_no_questions' };
    }

    const exam = await prisma.exam.update({
      where: { id: examId },
      data: { status },
      select: {
        id: true,
        title: true,
        subject: true,
        course: true,
        batch: true,
        start_datetime: true,
        branch_id: true,
      },
    });

    if (status === 'published') {
      await notifyPublished(
        exam.id,
        exam.course ?? '',
        exam.batch ?? '',
        exam.title,
        exam.subject,
        exam.start_datetime,
        exam.branch_id
      );
      return { ok: true, message: 'oex.msg_published' };
    }
    return { ok: true, message: 'oex.msg_unpublished' };
  } catch {
    return { ok: false, message: 'oex.err_status' };
  }
}

/** Publishes or hides an exam's results. */
export async function setResultsPublished(
  examId: number,
  published: boolean,
  lockTeacherId?: number
): Promise<SaveOutcome> {
  if (!(await canTouch(examId, lockTeacherId))) {
    return { ok: false, message: 'oex.err_own_manage' };
  }

  try {
    const exam = await prisma.exam.update({
      where: { id: examId },
      data: { result_published: published },
      select: { id: true, title: true, subject: true },
    });

    if (published) {
      // Only students who actually sat it are told.
      const attempts = await prisma.examAttempt.findMany({
        where: { exam_id: examId, status: { in: ['submitted', 'evaluated'] } },
        select: { student_id: true },
      });
      if (attempts.length > 0) {
        await prisma.notification.createMany({
          data: attempts.map((attempt) => ({
            user_type: 'student' as const,
            user_id: attempt.student_id,
            title: `Result published: ${exam.title}`,
            message: exam.subject,
            link: `/student/exams/${exam.id}/result`,
            icon: 'award',
            is_read: false,
          })),
        });
      }
      return { ok: true, message: 'oex.msg_results_published' };
    }
    return { ok: true, message: 'oex.msg_results_hidden' };
  } catch {
    return { ok: false, message: 'oex.err_results' };
  }
}

/** Deletes an exam, with its questions and every submitted answer. */
export async function deleteExam(examId: number, lockTeacherId?: number): Promise<SaveOutcome> {
  if (!(await canTouch(examId, lockTeacherId))) {
    return { ok: false, message: 'oex.err_own_delete' };
  }
  try {
    // Questions, answers and attempts cascade from the foreign keys.
    await prisma.exam.delete({ where: { id: examId } });
    return { ok: true, message: 'oex.msg_exam_deleted' };
  } catch {
    return { ok: false, message: 'oex.err_delete_exam' };
  }
}

/* --------------------------------------------------------------- questions */

export interface QuestionInput {
  id: number;
  exam_id: number;
  question_type: string;
  question_text: string;
  marks: string;
  sort_order: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
}

export async function saveQuestion(
  input: QuestionInput,
  lockTeacherId?: number
): Promise<SaveOutcome> {
  if (!(await canTouch(input.exam_id, lockTeacherId))) {
    return { ok: false, message: 'oex.err_own_manage' };
  }

  const type: 'mcq' | 'cq' = input.question_type === 'cq' ? 'cq' : 'mcq';
  const text = input.question_text.trim();
  const marks = Number(input.marks) || 0;

  if (text === '') return { ok: false, message: 'oex.err_q_text' };
  if (marks <= 0 || marks > 999) return { ok: false, message: 'oex.err_q_marks' };

  const options = {
    option_a: input.option_a.trim(),
    option_b: input.option_b.trim(),
    option_c: input.option_c.trim(),
    option_d: input.option_d.trim(),
  };
  const correct = ['a', 'b', 'c', 'd'].includes(input.correct_option)
    ? (input.correct_option as 'a' | 'b' | 'c' | 'd')
    : null;

  if (type === 'mcq') {
    // A and B are the minimum; C and D are optional.
    if (options.option_a === '' || options.option_b === '') {
      return { ok: false, message: 'oex.err_q_options' };
    }
    if (correct === null) return { ok: false, message: 'oex.err_q_correct' };
    // The option marked correct must actually have text, or the key points at
    // nothing and every answer is wrong.
    if (options[`option_${correct}` as keyof typeof options] === '') {
      return { ok: false, message: 'oex.err_q_correct_empty' };
    }
  }

  try {
    const data = {
      exam_id: input.exam_id,
      question_type: type,
      question_text: text,
      marks,
      sort_order: Number(input.sort_order) || 0,
      ...(type === 'mcq'
        ? { ...options, correct_option: correct }
        : { option_a: null, option_b: null, option_c: null, option_d: null, correct_option: null }),
    };

    if (input.id > 0) {
      await prisma.examQuestion.update({ where: { id: input.id }, data });
    } else {
      await prisma.examQuestion.create({ data });
    }

    await recalcExamTotal(input.exam_id);
    return { ok: true, message: input.id > 0 ? 'oex.msg_q_updated' : 'oex.msg_q_added' };
  } catch {
    return { ok: false, message: 'oex.err_q_save' };
  }
}

export async function deleteQuestion(
  questionId: number,
  examId: number,
  lockTeacherId?: number
): Promise<SaveOutcome> {
  if (!(await canTouch(examId, lockTeacherId))) {
    return { ok: false, message: 'oex.err_own_manage' };
  }
  try {
    // Scoped to the exam, so a forged question id from another exam is refused.
    const question = await prisma.examQuestion.findFirst({
      where: { id: questionId, exam_id: examId },
      select: { id: true },
    });
    if (!question) return { ok: false, message: 'oex.err_q_not_found' };

    await prisma.examQuestion.delete({ where: { id: question.id } });
    await recalcExamTotal(examId);
    return { ok: true, message: 'oex.msg_q_deleted' };
  } catch {
    return { ok: false, message: 'oex.err_q_delete' };
  }
}

/** The exam's total marks are the sum of its questions, never typed in. */
async function recalcExamTotal(examId: number): Promise<void> {
  try {
    const sum = await prisma.examQuestion.aggregate({
      where: { exam_id: examId },
      _sum: { marks: true },
    });
    await prisma.exam.update({
      where: { id: examId },
      data: { total_marks: Number(sum._sum.marks ?? 0) },
    });
  } catch {
    // Requires database configuration.
  }
}

/** Tells the audience an exam has been published. */
async function notifyPublished(
  examId: number,
  course: string,
  batch: string,
  title: string,
  subject: string,
  start: Date,
  branchId: number | null
): Promise<void> {
  try {
    // The audience is matched by NAME, the same way students read content.
    const students = await prisma.student.findMany({
      where: {
        status: 'approved',
        student_status: 'Active',
        ...(course !== '' ? { OR: [{ course }, { batch: course }] } : {}),
        ...(batch !== '' ? { batch } : {}),
        ...(branchId !== null ? { OR: [{ branch_id: branchId }, { branch_id: null }] } : {}),
      },
      select: { id: true },
      take: 2000,
    });
    if (students.length === 0) return;

    await prisma.notification.createMany({
      data: students.map((student) => ({
        user_type: 'student' as const,
        user_id: student.id,
        title: `New exam: ${title}`,
        message: `${subject} — ${start.toISOString().slice(0, 16).replace('T', ' ')}`,
        link: '/student/exams',
        icon: 'journal-check',
        is_read: false,
      })),
    });
  } catch {
    // A missed notification must not fail publishing.
  }
}
