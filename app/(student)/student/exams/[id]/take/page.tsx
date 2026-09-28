import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireStudentUnlocked } from '@/lib/auth/guards';
import { getTranslator, getLang, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { studentScope, scopeOpenWhere } from '@/lib/student/scope';
import { examAttempt, examQuestions, secondsLeft } from '@/lib/exams/engine';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { uploadUrl } from '@/lib/storage/url';
import { StartExam } from './StartExam';
import { ExamRunner, type RunnerQuestion } from './ExamRunner';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'student.nav.exams'),
    robots: { index: false, follow: false },
  };
}

/**
 * Sitting an exam, from student/exam_take.php.
 *
 * The page has no chrome — no sidebar, no navigation. That is deliberate: a
 * student sitting a timed exam should not have one click between them and leaving
 * it, and the original does the same.
 *
 * The exam is resolved through the student's audience scope, so an edited id
 * lands on "not yours" rather than another batch's paper.
 */
export default async function TakeExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const examId = /^\d+$/.test(id) ? Number(id) : 0;

  const student = await requireStudentUnlocked();
  const t = await getTranslator();

  const scope = await studentScope(student);
  const audience = scopeOpenWhere(scope, 'batch', 'course');

  let exam: Awaited<ReturnType<typeof prisma.exam.findFirst>> = null;
  try {
    exam = await prisma.exam.findFirst({
      where: { AND: [{ id: examId }, { status: 'published' }, audience] },
    });
  } catch {
    exam = null;
  }

  if (!exam) {
    return <Notice title={t.t('oex.take_flash_not_found')} body={t.t('oex.take_flash_not_yours')} back={t.t('oex.back_to_exams')} />;
  }

  const now = Date.now();
  const open = now >= exam.start_datetime.getTime() && now <= exam.end_datetime.getTime();

  const attempt = await examAttempt(exam.id, student.id);

  // Already sat: the result page, not the paper.
  if (attempt && attempt.status !== 'in_progress') {
    redirect(`/student/exams/${exam.id}/result`);
  }

  if (!open) {
    return <Notice title={t.t('oex.take_flash_closed')} body={t.t('oex.state_ended')} back={t.t('oex.back_to_exams')} />;
  }

  const questions = await examQuestions(exam.id);
  if (questions.length === 0) {
    return <Notice title={t.t('oex.take_flash_no_questions')} body="" back={t.t('oex.back_to_exams')} />;
  }

  // Not started yet: the briefing screen, so the timer begins when they choose.
  if (!attempt) {
    const mcqCount = questions.filter((question) => question.question_type === 'mcq').length;
    const cqCount = questions.length - mcqCount;
    // The window may be shorter than the duration; the student is told which.
    const windowMinutes = Math.floor((exam.end_datetime.getTime() - now) / 60_000);
    const usable = Math.min(exam.duration_minutes, windowMinutes);

    return (
      <main id="main" className="mx-auto w-full max-w-2xl px-4 py-10">
        <Card>
          <CardHeader title={exam.title} subtitle={exam.subject} icon="bi-journal-check" />
          <CardBody className="space-y-4">
            <h2 className="font-head text-lg font-semibold text-ink-heading">
              {t.t('oex.start_title')}
            </h2>

            <ul className="space-y-1.5 text-sm text-ink">
              {mcqCount > 0 && <li>{t.t('oex.start_mcq_count', { count: t.digits(mcqCount) })}</li>}
              {cqCount > 0 && <li>{t.t('oex.start_cq_count', { count: t.digits(cqCount) })}</li>}
              <li>{t.t('oex.timer_min', { count: t.digits(exam.duration_minutes) })}</li>
              <li>
                {t.t('oex.total_marks')}: {t.digits(Number(exam.total_marks ?? 0))}
              </li>
            </ul>

            {usable < exam.duration_minutes && (
              <Alert tone="warning" icon="bi-hourglass-split">
                {t.t('oex.start_window_note', {
                  time: t.date(exam.end_datetime, 'h:i A'),
                  count: t.digits(usable),
                })}
              </Alert>
            )}

            {exam.instructions && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  {t.t('oex.take_instructions')}
                </p>
                <p className="mt-1 whitespace-pre-line text-sm text-ink">{exam.instructions}</p>
              </div>
            )}

            <Alert tone="info" icon="bi-lightbulb">
              <p>{t.t('oex.start_timer_note')}</p>
              <p className="mt-1">{t.t('oex.start_autosave_note')}</p>
              {cqCount > 0 && <p className="mt-1">{t.t('oex.start_upload_note')}</p>}
            </Alert>

            <StartExam
              examId={exam.id}
              label={t.t('oex.start_btn')}
              backLabel={t.t('oex.back_to_exams')}
            />
          </CardBody>
        </Card>
      </main>
    );
  }

  // Running: load the saved answers and hand it to the runner.
  let saved: { question_id: number; selected_option: string | null; answer_text: string | null }[] = [];
  try {
    saved = await prisma.examAnswer.findMany({
      where: { attempt_id: attempt.id },
      select: { question_id: true, selected_option: true, answer_text: true },
    });
  } catch {
    saved = [];
  }

  const runnerQuestions: RunnerQuestion[] = questions.map((question) => {
    const answer = saved.find((row) => row.question_id === question.id);
    return {
      id: question.id,
      type: question.question_type === 'mcq' ? 'mcq' : 'cq',
      text: question.question_text,
      marks: Number(question.marks),
      imageUrl: uploadUrl(question.question_image),
      options: (['a', 'b', 'c', 'd'] as const)
        .map((key) => ({
          key,
          text: String(
            (question as unknown as Record<string, string | null>)[`option_${key}`] ?? ''
          ),
        }))
        // Options C and D are optional on an MCQ, so blanks are dropped rather
        // than rendered as empty radio buttons.
        .filter((option) => option.text.trim() !== ''),
      answeredOption: (answer?.selected_option as RunnerQuestion['answeredOption']) ?? null,
      answeredText: answer?.answer_text ?? '',
    };
  });

  const negative = Number(exam.negative_marking ?? 0);

  return (
    <main id="main" className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-5">
        <h1 className="font-head text-xl font-semibold text-ink-heading">{exam.title}</h1>
        <p className="mt-1 text-sm text-ink-muted">{exam.subject}</p>
      </header>

      <ExamRunner
        examId={exam.id}
        questions={runnerQuestions}
        initialSeconds={secondsLeft(exam, attempt)}
        negativeMarking={negative}
        resultHref={`/student/exams/${exam.id}/result`}
        labels={{
          question: t.t('oex.take_q_number'),
          marks: t.t('oex.q_marks'),
          yourAnswer: t.t('oex.take_your_answer_plain'),
          yourAnswerPlain: t.t('oex.take_your_answer_plain'),
          answerPlaceholder: t.t('oex.take_answer_ph'),
          clear: t.t('oex.take_clear'),
          answered: t.t('oex.take_answered'),
          notAnswered: t.t('oex.take_not_answered'),
          saving: t.t('oex.take_saving'),
          saved: t.t('oex.take_saved'),
          notSaved: t.t('oex.take_not_saved'),
          offline: t.t('oex.take_offline'),
          timeLeft: t.t('oex.take_time_left'),
          timeUp: t.t('oex.take_time_up'),
          autoSubmitting: t.t('oex.take_auto_submitting'),
          submit: t.t('oex.take_submit_exam'),
          submitting: t.t('oex.take_submitting'),
          confirmTitle: t.t('oex.take_confirm_title'),
          confirmBody: t.t('oex.take_confirm_body'),
          unanswered: t.t('oex.take_unanswered'),
          yesSubmit: t.t('oex.take_yes_submit'),
          keepWorking: t.t('oex.take_keep_working'),
          close: t.t('common.close'),
          goTo: t.t('oex.take_go_to'),
          figureAlt: t.t('oex.take_figure_alt'),
          negative: t.t('oex.take_negative', { value: t.digits(negative) }),
        }}
      />
    </main>
  );
}

function Notice({ title, body, back }: { title: string; body: string; back: string }) {
  return (
    <main id="main" className="mx-auto w-full max-w-xl px-4 py-16 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-surface-3 text-2xl text-ink-muted">
        <i className="bi bi-journal-x" aria-hidden />
      </span>
      <h1 className="mt-4 font-head text-lg font-semibold text-ink-heading">{title}</h1>
      {body !== '' && <p className="mt-2 text-ink-muted">{body}</p>}
      <Link
        href="/student/exams"
        className="mt-6 inline-block rounded-orbit border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
      >
        {back}
      </Link>
    </main>
  );
}
