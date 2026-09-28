import 'server-only';
import { prisma } from '@/lib/db/prisma';

/**
 * The online exam engine, from includes/exam_lib.php.
 *
 * Six rules here decide a student's marks, and each one is the original's rather
 * than the obvious implementation:
 *
 *   1. **The deadline is the EARLIER of** attempt start + duration, and the exam's
 *      own `end_datetime`. A student who starts five minutes before the window
 *      closes gets five minutes, not the full duration.
 *   2. **An unanswered MCQ costs nothing.** No marks, and no negative penalty —
 *      penalising a blank would punish honesty over guessing.
 *   3. **Negative marking never pushes the MCQ total below zero.** A student who
 *      guessed badly scores 0, not a debt carried into the CQ marks.
 *   4. **A pure-MCQ exam is `evaluated` on submit**; anything with a CQ becomes
 *      `submitted` and waits for a teacher. Marking everything `submitted` would
 *      leave MCQ students waiting for a human who has nothing to do.
 *   5. **Submitting twice is ignored**, not an error: the timer, the button and
 *      `sendBeacon` on page-unload can all fire, and the second one must be
 *      harmless.
 *   6. **Expired attempts are auto-submitted** whenever the list is opened, so a
 *      student who closed the browser still gets their MCQ marks.
 */

export type AttemptStatus = 'in_progress' | 'submitted' | 'evaluated';

export interface ExamRow {
  id: number;
  title: string;
  subject: string;
  exam_type: string;
  duration_minutes: number;
  start_datetime: Date;
  end_datetime: Date;
  total_marks: unknown;
  negative_marking: unknown;
  instructions: string | null;
  teacher_id: number | null;
  status: string;
}

export interface ExamState {
  labelKey: string;
  tone: 'success' | 'info' | 'neutral' | 'danger';
  open: boolean;
}

/** Where an exam stands right now. */
export function examState(exam: {
  status: string;
  start_datetime: Date;
  end_datetime: Date;
}): ExamState {
  if (exam.status === 'cancelled') {
    return { labelKey: 'oex.state_cancelled', tone: 'danger', open: false };
  }
  if (exam.status === 'draft') {
    return { labelKey: 'oex.state_draft', tone: 'neutral', open: false };
  }

  const now = Date.now();
  if (now < exam.start_datetime.getTime()) {
    return { labelKey: 'oex.state_upcoming', tone: 'info', open: false };
  }
  if (now > exam.end_datetime.getTime()) {
    return { labelKey: 'oex.state_ended', tone: 'neutral', open: false };
  }
  return { labelKey: 'oex.state_running', tone: 'success', open: true };
}

/** Questions in display order. */
export async function examQuestions(examId: number) {
  try {
    return await prisma.examQuestion.findMany({
      where: { exam_id: examId },
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });
  } catch {
    return [];
  }
}

/**
 * The student's attempt, created on demand when they start.
 *
 * `create` is guarded by the unique (exam_id, student_id) index: two simultaneous
 * starts cannot make two attempts, and the loser re-reads the winner's row.
 */
export async function examAttempt(examId: number, studentId: number, createIfMissing = false) {
  try {
    const existing = await prisma.examAttempt.findUnique({
      where: { exam_id_student_id: { exam_id: examId, student_id: studentId } },
    });
    if (existing || !createIfMissing) return existing;

    try {
      return await prisma.examAttempt.create({
        data: {
          exam_id: examId,
          student_id: studentId,
          started_at: new Date(),
          status: 'in_progress',
          // The three score columns have no database default, so they are set
          // here rather than left for the first grading pass to discover missing.
          mcq_score: 0,
          cq_score: 0,
          total_score: 0,
        },
      });
    } catch {
      // Lost a race with another tab; the other one's row is the answer.
      return prisma.examAttempt.findUnique({
        where: { exam_id_student_id: { exam_id: examId, student_id: studentId } },
      });
    }
  } catch {
    return null;
  }
}

/**
 * Seconds left in a running attempt.
 *
 * The earlier of (start + duration) and the exam's end, so a late starter can
 * never run past the window.
 */
export function secondsLeft(
  exam: { duration_minutes: number; end_datetime: Date },
  attempt: { started_at: Date | null }
): number {
  const startedAt = attempt.started_at?.getTime() ?? Date.now();
  const byDuration = startedAt + exam.duration_minutes * 60_000;
  const byWindow = exam.end_datetime.getTime();
  return Math.max(0, Math.floor((Math.min(byDuration, byWindow) - Date.now()) / 1000));
}

/**
 * Grades every MCQ in an attempt and writes the scores.
 *
 * CQ answers are left alone: `cq_score` keeps whatever the teacher has awarded so
 * far, which is 0 before evaluation.
 */
export async function gradeMcq(attemptId: number): Promise<number> {
  try {
    const attempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
      select: { id: true, cq_score: true, exam: { select: { negative_marking: true } } },
    });
    if (!attempt) return 0;

    const negative = Number(attempt.exam.negative_marking ?? 0);

    const answers = await prisma.examAnswer.findMany({
      where: { attempt_id: attemptId, question: { question_type: 'mcq' } },
      select: {
        id: true,
        selected_option: true,
        question: { select: { correct_option: true, marks: true } },
      },
    });

    // Answers that receive the same (is_correct, awarded_marks) are written by
    // one updateMany. That is a handful of statements per attempt — unanswered,
    // wrong, and correct once per distinct mark value — instead of one per
    // question, which matters when a whole class submits as the clock runs out.
    const groups = new Map<string, { is_correct: boolean | null; awarded_marks: number; ids: number[] }>();
    const assign = (id: number, isCorrect: boolean | null, awarded: number) => {
      const key = `${isCorrect}|${awarded}`;
      const group = groups.get(key) ?? { is_correct: isCorrect, awarded_marks: awarded, ids: [] };
      group.ids.push(id);
      groups.set(key, group);
    };

    let score = 0;
    for (const answer of answers) {
      // `selected_option` is an enum, so null is the only way to be unanswered.
      if (answer.selected_option === null) {
        // Unanswered: no marks, no penalty.
        assign(answer.id, null, 0);
        continue;
      }

      const correct = answer.selected_option === answer.question.correct_option;
      const awarded = correct ? Number(answer.question.marks) : -negative;
      score += awarded;
      assign(answer.id, correct, awarded);
    }

    // Negative marking must never push the MCQ total below zero.
    score = Math.max(0, score);

    // The marks and the attempt's total land together, so the total can never
    // disagree with the answers it was added up from.
    await prisma.$transaction([
      ...[...groups.values()].map((group) =>
        prisma.examAnswer.updateMany({
          where: { id: { in: group.ids } },
          data: { is_correct: group.is_correct, awarded_marks: group.awarded_marks },
        })
      ),
      prisma.examAttempt.update({
        where: { id: attemptId },
        data: { mcq_score: score, total_score: score + Number(attempt.cq_score ?? 0) },
      }),
    ]);

    return score;
  } catch {
    return 0;
  }
}

/**
 * Finalises an attempt: grades the MCQs, stamps the time, and decides whether a
 * human is still needed.
 *
 * Returns false for an attempt that was already submitted — duplicates are
 * ignored, not errors.
 */
export async function submitAttempt(attemptId: number, mode: 'manual' | 'auto' = 'manual'): Promise<boolean> {
  try {
    const attempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        status: true,
        exam_id: true,
        student_id: true,
        exam: { select: { title: true, teacher_id: true } },
      },
    });

    // Already submitted — the timer, the button and sendBeacon can all fire.
    if (!attempt || attempt.status !== 'in_progress') return false;

    await gradeMcq(attemptId);

    // A pure-MCQ exam needs no teacher and is evaluated straight away.
    const cqCount = await prisma.examQuestion.count({
      where: { exam_id: attempt.exam_id, question_type: 'cq' },
    });
    const hasCq = cqCount > 0;

    await prisma.examAttempt.update({
      where: { id: attemptId },
      data: {
        status: hasCq ? 'submitted' : 'evaluated',
        submitted_at: new Date(),
        submit_mode: mode,
      },
    });

    // Tell the owning teacher something is waiting.
    if (hasCq && attempt.exam.teacher_id) {
      const student = await prisma.student.findUnique({
        where: { id: attempt.student_id },
        select: { name: true },
      });
      await prisma.notification
        .create({
          data: {
            user_type: 'teacher',
            user_id: attempt.exam.teacher_id,
            title: 'New exam submission',
            message: `${student?.name ?? ''} — ${attempt.exam.title}`,
            link: `/teacher/evaluate/${attemptId}`,
            icon: 'clipboard-check',
            is_read: false,
          },
        })
        .catch(() => null);
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Auto-submits every attempt whose time has run out.
 *
 * Called when a student opens the exam list and when a teacher opens the
 * evaluation screen, so a student who simply closed the browser still gets their
 * MCQ marks and the teacher is not left waiting for a submission that will never
 * come.
 */
export async function autosubmitExpired(examId?: number): Promise<number> {
  try {
    const running = await prisma.examAttempt.findMany({
      where: {
        status: 'in_progress',
        ...(examId !== undefined ? { exam_id: examId } : {}),
      },
      select: {
        id: true,
        started_at: true,
        exam: { select: { end_datetime: true, duration_minutes: true } },
      },
    });

    const now = Date.now();
    const expired = running.filter((attempt) => {
      const byWindow = attempt.exam.end_datetime.getTime();
      const byDuration =
        (attempt.started_at?.getTime() ?? now) + attempt.exam.duration_minutes * 60_000;
      return now > byWindow || now > byDuration;
    });

    for (const attempt of expired) {
      await submitAttempt(attempt.id, 'auto');
    }
    return expired.length;
  } catch {
    return 0;
  }
}

/**
 * Recomputes `cq_score` and `total_score` from the per-answer marks a teacher
 * awarded.
 */
export async function recalcAttemptScore(attemptId: number): Promise<void> {
  try {
    const cq = await prisma.examAnswer.aggregate({
      where: { attempt_id: attemptId, question: { question_type: 'cq' } },
      _sum: { awarded_marks: true },
    });
    const attempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
      select: { mcq_score: true },
    });

    const cqScore = Number(cq._sum.awarded_marks ?? 0);
    const mcqScore = Number(attempt?.mcq_score ?? 0);

    await prisma.examAttempt.update({
      where: { id: attemptId },
      data: { cq_score: cqScore, total_score: mcqScore + cqScore },
    });
  } catch {
    // Requires database configuration.
  }
}

/** The letter for a percentage, from orbit_exam_grade_letter(). */
export function examGradeLetter(percentage: number): string {
  if (percentage >= 80) return 'A+';
  if (percentage >= 70) return 'A';
  if (percentage >= 60) return 'A-';
  if (percentage >= 50) return 'B';
  if (percentage >= 40) return 'C';
  if (percentage >= 33) return 'D';
  return 'F';
}
