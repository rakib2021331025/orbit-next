import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { recalcAttemptScore, examQuestions } from './engine';

/**
 * Marking submitted answers, from includes/evaluation_lib.php.
 *
 * Used by the teacher's evaluation screen and the admin's. The difference is one
 * argument: `lockTeacherId` restricts every read and write to that teacher's own
 * exams. **The teacher screen always passes it**, which is what stops one teacher
 * marking — or even opening — another's submission.
 *
 * Four rules carried over exactly:
 *
 *   1. **Only CQ questions can be marked here.** MCQs were graded automatically,
 *      and letting a teacher overwrite them would make the auto-grading advisory.
 *   2. **Marks are clamped** to 0…the question's own marks. A typo cannot award
 *      50 for a 5-mark question, and a CQ cannot go negative.
 *   3. **A blank box means "not yet marked" and is stored as 0** rather than left
 *      absent — so the total is always the sum of what is on screen.
 *   4. **Draft and finalise are different.** A draft saves the marks; finalising
 *      also sets `evaluated`, stamps who did it, and notifies the student.
 */

export interface AttemptFilters {
  examId?: number;
  /** Restricts to this teacher's exams. The teacher screen always sets it. */
  teacherId?: number;
  status?: 'submitted' | 'evaluated' | '';
  search?: string;
}

/**
 * The evaluation queue.
 *
 * Ordered with unmarked submissions first, then newest — the queue is a work
 * list, so what still needs doing belongs at the top.
 */
export async function fetchAttempts(filters: AttemptFilters, take = 300) {
  const search = (filters.search ?? '').trim();

  try {
    const attempts = await prisma.examAttempt.findMany({
      where: {
        // Only what was actually handed in.
        status: { in: ['submitted', 'evaluated'] },
        ...(filters.examId ? { exam_id: filters.examId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.teacherId ? { exam: { teacher_id: filters.teacherId } } : {}),
        ...(search !== ''
          ? {
              OR: [
                { student: { name: { contains: search } } },
                { exam: { title: { contains: search } } },
                { exam: { subject: { contains: search } } },
              ],
            }
          : {}),
      },
      orderBy: [{ status: 'asc' }, { submitted_at: 'desc' }],
      take: Math.max(1, Math.min(1000, take)),
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            subject: true,
            exam_type: true,
            total_marks: true,
            pass_marks: true,
            batch: true,
            result_published: true,
          },
        },
        student: { select: { id: true, name: true, name_bn: true, phone: true, image: true } },
        _count: { select: { examAnswerFile_attempt: true } },
      },
    });

    // 'evaluated' sorts before 'submitted' alphabetically, so the "unmarked
    // first" order is applied here rather than in the query.
    return attempts.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'submitted' ? -1 : 1;
      return (b.submitted_at?.getTime() ?? 0) - (a.submitted_at?.getTime() ?? 0);
    });
  } catch {
    return [];
  }
}

/** Everything the marking screen needs for one attempt. */
export async function loadAttempt(attemptId: number, lockTeacherId?: number) {
  if (!Number.isInteger(attemptId) || attemptId <= 0) return null;

  try {
    const attempt = await prisma.examAttempt.findFirst({
      where: {
        id: attemptId,
        // The ownership lock, applied in the query rather than after it.
        ...(lockTeacherId ? { exam: { teacher_id: lockTeacherId } } : {}),
      },
      include: {
        exam: true,
        student: {
          select: {
            id: true,
            name: true,
            name_bn: true,
            phone: true,
            email: true,
            image: true,
            batch: true,
          },
        },
      },
    });
    if (!attempt) return null;

    const [questions, answerRows, files] = await Promise.all([
      examQuestions(attempt.exam_id),
      prisma.examAnswer.findMany({ where: { attempt_id: attemptId } }),
      prisma.examAnswerFile.findMany({
        where: { attempt_id: attemptId },
        orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
      }),
    ]);

    const answers = new Map(answerRows.map((row) => [row.question_id, row]));
    return { attempt, questions, answers, files };
  } catch {
    return null;
  }
}

export interface SaveResult {
  ok: boolean;
  /** A translation key. */
  message: string;
}

/**
 * Saves marks and comments for one attempt.
 *
 * `finalise` is the difference between a draft and a finished evaluation.
 */
export async function saveEvaluation(
  attemptId: number,
  evaluatorId: number,
  marks: Record<number, string>,
  comments: Record<number, string>,
  overallComment: string,
  finalise: boolean,
  lockTeacherId?: number
): Promise<SaveResult> {
  const attempt = await prisma.examAttempt
    .findFirst({
      where: {
        id: attemptId,
        ...(lockTeacherId ? { exam: { teacher_id: lockTeacherId } } : {}),
      },
      select: {
        id: true,
        exam_id: true,
        student_id: true,
        exam: { select: { title: true, subject: true } },
      },
    })
    .catch(() => null);

  if (!attempt) return { ok: false, message: 'oex.err_submission_not_found' };

  if (overallComment.length > 5000) {
    return { ok: false, message: 'oex.err_too_long' };
  }

  // Only CQ questions on THIS exam. MCQs were graded automatically.
  let cq: { id: number; marks: number }[] = [];
  try {
    const rows = await prisma.examQuestion.findMany({
      where: { exam_id: attempt.exam_id, question_type: 'cq' },
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
      select: { id: true, marks: true },
    });
    cq = rows.map((row) => ({ id: row.id, marks: Number(row.marks) }));
  } catch {
    return { ok: false, message: 'oex.err_eval_save' };
  }

  // Validate before writing anything, so a bad value does not leave half the
  // marks saved.
  for (const [index, question] of cq.entries()) {
    const raw = (marks[question.id] ?? '').trim();
    if (raw !== '') {
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0 || value > question.marks) {
        return { ok: false, message: 'oex.err_marks_invalid' };
      }
    }
    if ((comments[question.id] ?? '').length > 5000) {
      return { ok: false, message: 'oex.err_too_long' };
    }
    void index;
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const question of cq) {
        const raw = (marks[question.id] ?? '').trim();
        // A blank box is "not yet marked", stored as 0.
        const parsed = raw === '' ? 0 : Number(raw);
        // Clamped: never more than the question is worth, never negative.
        const value = Math.max(0, Math.min(parsed, question.marks));
        const comment = (comments[question.id] ?? '').trim();

        await tx.examAnswer.upsert({
          where: { attempt_id_question_id: { attempt_id: attemptId, question_id: question.id } },
          update: { awarded_marks: value, teacher_comment: comment !== '' ? comment : null },
          create: {
            attempt_id: attemptId,
            question_id: question.id,
            awarded_marks: value,
            teacher_comment: comment !== '' ? comment : null,
          },
        });
      }

      await tx.examAttempt.update({
        where: { id: attemptId },
        data: {
          teacher_comment: overallComment !== '' ? overallComment : null,
          ...(finalise
            ? { status: 'evaluated', evaluated_by: evaluatorId, evaluated_at: new Date() }
            : {}),
        },
      });
    });

    // Outside the transaction: the totals are derived, and a failure here must
    // not roll back marks a teacher has already entered.
    await recalcAttemptScore(attemptId);

    if (finalise) {
      await prisma.notification
        .create({
          data: {
            user_type: 'student',
            user_id: attempt.student_id,
            title: `Evaluated: ${attempt.exam.title}`,
            message: attempt.exam.subject,
            link: `/student/exams/${attempt.exam_id}/result`,
            icon: 'clipboard-check',
            is_read: false,
          },
        })
        .catch(() => null);
    }

    return { ok: true, message: finalise ? 'oex.msg_eval_saved' : 'oex.msg_draft_saved' };
  } catch {
    return { ok: false, message: 'oex.err_eval_save' };
  }
}

/** Puts a finished evaluation back in the queue for re-marking. */
export async function reopenEvaluation(
  attemptId: number,
  lockTeacherId?: number
): Promise<SaveResult> {
  try {
    const found = await prisma.examAttempt.findFirst({
      where: {
        id: attemptId,
        ...(lockTeacherId ? { exam: { teacher_id: lockTeacherId } } : {}),
      },
      select: { id: true },
    });
    if (!found) return { ok: false, message: 'oex.err_submission_not_found' };

    await prisma.examAttempt.update({
      where: { id: attemptId },
      data: { status: 'submitted', evaluated_at: null },
    });
    return { ok: true, message: 'oex.msg_reopened' };
  } catch {
    return { ok: false, message: 'oex.err_reopen' };
  }
}
