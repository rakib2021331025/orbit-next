import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback';
import { getLang, translate } from '@/lib/i18n';
import { loadAttempt } from '@/lib/exams/evaluation';
import { uploadUrl, studentPhotoUrl } from '@/lib/storage/url';
import { formatMark } from '@/lib/results/grades';
import { EvaluateForm, type EvaluateQuestion } from '@/components/exams/EvaluateForm';
import { ReopenButton } from '@/components/exams/ReopenButton';
import { saveEvaluationAction, reopenAction } from './actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'oex.ev_title'),
    robots: { index: false, follow: false },
  };
}

/**
 * Marking one submission as an administrator, from admin/exam_evaluate.php.
 *
 * The same workspace the teacher uses, **without the ownership lock** — an
 * administrator marks on behalf of any teacher, which is the entire reason this
 * screen exists next to the teacher's.
 *
 * A finished evaluation is read-only until it is reopened. That is deliberate:
 * changing a mark a student has already seen should be a decision, not a
 * keystroke.
 */
export default async function AdminEvaluatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const attemptId = /^\d+$/.test(id) ? Number(id) : 0;

  return (
    <AdminPage active="evaluation" route="/admin/exam-evaluation" title="">
      {async ({ t }) => {
        // No second argument: no ownership lock for an admin.
        const loaded = await loadAttempt(attemptId);

        if (!loaded) {
          return (
            <Card>
              <EmptyState
                icon="bi-inbox"
                title={t.t('oex.err_submission_not_found')}
                action={
                  <Link
                    href="/admin/exam-evaluation"
                    className="rounded-orbit border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
                  >
                    {t.t('oex.back_to_queue')}
                  </Link>
                }
              />
            </Card>
          );
        }

        const { attempt, questions, answers, files } = loaded;
        const marked = attempt.status === 'evaluated';
        const total = Number(attempt.exam.total_marks ?? 0);
        const score = Number(attempt.total_score ?? 0);
        const photo = studentPhotoUrl(attempt.student);

        const formQuestions: EvaluateQuestion[] = questions.map((question, index) => {
          const answer = answers.get(question.id);
          const row = question as unknown as Record<string, string | null>;

          return {
            id: question.id,
            index: index + 1,
            type: question.question_type === 'mcq' ? 'mcq' : 'cq',
            text: question.question_text,
            imageUrl: uploadUrl(question.question_image),
            marks: Number(question.marks),
            chosen: answer?.selected_option ?? null,
            correct: question.correct_option ?? null,
            options: (['a', 'b', 'c', 'd'] as const)
              .map((key) => ({ key, text: String(row[`option_${key}`] ?? '') }))
              .filter((option) => option.text.trim() !== ''),
            answerText: answer?.answer_text ?? '',
            awarded: answer?.awarded_marks === null || answer?.awarded_marks === undefined
              ? null
              : Number(answer.awarded_marks),
            comment: answer?.teacher_comment ?? '',
            isCorrect: answer?.is_correct ?? null,
          };
        });

        return (
          <div className="space-y-6">
            <Link
              href="/admin/exam-evaluation"
              className="inline-flex items-center gap-2 text-sm font-medium text-ink-muted transition hover:text-primary"
            >
              <span aria-hidden>&larr;</span>
              {t.t('oex.back_to_queue')}
            </Link>

            <Card>
              <CardBody className="flex flex-wrap items-center gap-4">
                {photo !== '' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt="" className="h-14 w-14 rounded-full object-cover" />
                ) : (
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-xl font-semibold text-primary">
                    {t.pick(attempt.student, 'name').charAt(0)}
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <p className="font-head text-lg font-semibold text-ink-heading">
                    {t.pick(attempt.student, 'name')}
                  </p>
                  <p className="text-sm text-ink-muted">
                    {attempt.exam.title} · {attempt.exam.subject}
                    {attempt.student.batch ? ` · ${attempt.student.batch}` : ''}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {attempt.submitted_at
                      ? t.t('oex.ev_submitted_at', {
                          date: t.date(attempt.submitted_at, 'd M Y, h:i A'),
                        })
                      : ''}
                    {attempt.submit_mode === 'auto' && ` (${t.t('oex.ev_auto_submitted')})`}
                  </p>
                </div>

                <div className="text-end">
                  <p className="font-head text-2xl font-semibold tabular-nums text-primary">
                    {formatMark(score, t.digits)} / {t.digits(total)}
                  </p>
                  <Badge tone={marked ? 'success' : 'warning'}>
                    {t.t(marked ? 'oex.eval_st_evaluated' : 'oex.eval_st_to_mark')}
                  </Badge>
                </div>
              </CardBody>
            </Card>

            {marked && !attempt.exam.result_published && (
              <Alert tone="warning" icon="bi-eye-slash">
                {t.t('oex.ev_not_published')}
              </Alert>
            )}

            {files.length > 0 && (
              <Card>
                <CardHeader
                  title={t.t('oex.ev_whole_script', { count: t.digits(files.length) })}
                  icon="bi-paperclip"
                />
                <CardBody>
                  <ul className="grid gap-3 sm:grid-cols-3">
                    {files.map((file) => {
                      const href = uploadUrl(file.file_path);
                      if (href === '') return null;

                      return (
                        <li key={file.id}>
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block overflow-hidden rounded-orbit border border-line-soft transition hover:border-primary/40"
                          >
                            {file.file_type === 'image' ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={href} alt="" className="h-40 w-full object-cover" />
                            ) : (
                              <span className="flex h-40 items-center justify-center gap-2 bg-surface-2 text-sm text-ink-muted">
                                <i className="bi bi-file-earmark-pdf text-2xl" aria-hidden />
                                PDF
                              </span>
                            )}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </CardBody>
              </Card>
            )}

            <EvaluateForm
              action={saveEvaluationAction}
              attemptId={attempt.id}
              questions={formQuestions}
              overallComment={attempt.teacher_comment ?? ''}
              readOnly={marked}
              labels={{
                questionNumber: t.t('oex.take_q_number'),
                mcqAuto: t.t('oex.ev_mcq_auto'),
                cqMarked: t.t('oex.ev_cq_marked'),
                studentAnswer: t.t('oex.ev_student_tag'),
                typedAnswer: t.t('oex.ev_typed'),
                noAnswer: t.t('oex.ev_no_answer'),
                notAnswered: t.t('oex.ev_not_answered'),
                correct: t.t('oex.ev_correct'),
                wrong: t.t('oex.ev_wrong'),
                marksMax: t.t('oex.ev_marks_max'),
                comment: t.t('oex.ev_comment'),
                commentPlaceholder: t.t('oex.ev_comment_ph'),
                feedback: t.t('oex.ev_feedback'),
                feedbackPlaceholder: t.t('oex.ev_feedback_ph'),
                saveDraft: t.t('oex.ev_save_draft'),
                finish: t.t('oex.ev_finish'),
                finishNote: t.t('oex.ev_finish_note'),
                figureAlt: t.t('oex.take_figure_alt'),
              }}
            />

            {marked && (
              <ReopenButton
                action={reopenAction}
                attemptId={attempt.id}
                label={t.t('oex.ev_reopen')}
                confirmLabel={t.t('oex.ev_reopen_confirm')}
              />
            )}
          </div>
        );
      }}
    </AdminPage>
  );
}
