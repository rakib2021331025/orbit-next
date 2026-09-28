import type { Metadata } from 'next';
import Link from 'next/link';
import { StudentPage } from '@/components/portal/StudentPage';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/Card';
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback';
import { getLang, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { studentScope, scopeOpenWhere } from '@/lib/student/scope';
import { examAttempt, examGradeLetter } from '@/lib/exams/engine';
import { uploadUrl } from '@/lib/storage/url';
import { formatMark } from '@/lib/results/grades';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'student.nav.exams'),
    robots: { index: false, follow: false },
  };
}

/**
 * One exam's result for the student, from student/exam_result.php.
 *
 * **Marks are only shown once the exam's results are published.** A teacher may
 * have finished marking, but until the exam is published the student sees "marked,
 * not yet published" rather than a score that could still change.
 *
 * Correct answers are shown only for a published result too: revealing the key
 * while the exam window is still open would hand it to everyone who has not sat it.
 */
export default async function ExamResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const examId = /^\d+$/.test(id) ? Number(id) : 0;

  return (
    <StudentPage active="exams" title={(t) => t.t('student.nav.exams')}>
      {async ({ student, t }) => {
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

        const attempt = exam ? await examAttempt(exam.id, student.id) : null;

        if (!exam || !attempt) {
          return (
            <Card>
              <EmptyState
                icon="bi-journal-x"
                title={t.t('oex.take_flash_not_found')}
                body={t.t('oex.take_flash_not_yours')}
                action={
                  <Link
                    href="/student/exams"
                    className="rounded-orbit border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
                  >
                    {t.t('oex.back_to_exams')}
                  </Link>
                }
              />
            </Card>
          );
        }

        const published = exam.result_published === true;
        const marked = attempt.status === 'evaluated';
        const total = Number(exam.total_marks ?? 0);
        const score = Number(attempt.total_score ?? 0);
        const percentage = total > 0 ? (score / total) * 100 : 0;

        const [questions, answers, files] = await Promise.all([
          prisma.examQuestion
            .findMany({
              where: { exam_id: exam.id },
              orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
            })
            .catch(() => []),
          prisma.examAnswer
            .findMany({ where: { attempt_id: attempt.id } })
            .catch(() => []),
          prisma.examAnswerFile
            .findMany({ where: { attempt_id: attempt.id }, orderBy: { id: 'asc' } })
            .catch(() => []),
        ]);

        return (
          <div className="space-y-6">
            <Link
              href="/student/exams"
              className="inline-flex items-center gap-2 text-sm font-medium text-ink-muted transition hover:text-primary"
            >
              <span aria-hidden>&larr;</span>
              {t.t('oex.back_to_exams')}
            </Link>

            <Card>
              <CardHeader
                title={exam.title}
                subtitle={exam.subject}
                icon="bi-journal-check"
                actions={
                  attempt.submit_mode === 'auto' ? (
                    <Badge tone="neutral">{t.t('oex.auto_badge')}</Badge>
                  ) : undefined
                }
              />
              <CardBody>
                {!marked ? (
                  <Alert tone="info" icon="bi-hourglass-split">
                    {t.t('oex.ev_awaiting')}
                  </Alert>
                ) : !published ? (
                  // Marked but not released: the score could still change.
                  <Alert tone="warning" icon="bi-eye-slash">
                    {t.t('oex.ev_not_published')}
                  </Alert>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-3">
                    <StatCard
                      label={t.t('oex.col_score')}
                      value={`${t.digits(formatMark(score, t.digits))} / ${t.digits(total)}`}
                      icon="bi-award"
                      tone="primary"
                    />
                    <StatCard
                      label={t.t('result.percentage')}
                      value={`${t.digits(percentage.toFixed(1))}%`}
                      icon="bi-percent"
                    />
                    <StatCard
                      label={t.t('result.grade')}
                      value={examGradeLetter(percentage)}
                      icon="bi-star"
                    />
                  </div>
                )}

                <p className="mt-4 text-xs text-ink-muted">
                  {t.t('oex.col_submitted')}:{' '}
                  {attempt.submitted_at ? t.date(attempt.submitted_at, 'd M Y, h:i A') : '—'}
                </p>
              </CardBody>
            </Card>

            {files.length > 0 && (
              <Card>
                <CardHeader title={t.t('oex.col_files')} icon="bi-paperclip" />
                <ul className="divide-y divide-line-soft">
                  {files.map((file) => {
                    const href = uploadUrl(file.file_path);
                    return (
                      <li key={file.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                        <i
                          className={`bi ${file.file_type === 'pdf' ? 'bi-file-earmark-pdf' : 'bi-file-earmark-image'} text-ink-muted`}
                          aria-hidden
                        />
                        {href !== '' ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-ink hover:text-primary hover:underline"
                          >
                            {file.original_name ?? t.t('oex.take_uploaded')}
                          </a>
                        ) : (
                          <span className="text-ink">{file.original_name ?? ''}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}

            {/* The question-by-question breakdown, once results are out. */}
            {published && marked && questions.length > 0 && (
              <div className="space-y-4">
                {questions.map((question, index) => {
                  const answer = answers.find((row) => row.question_id === question.id);
                  const awarded = Number(answer?.awarded_marks ?? 0);
                  const isMcq = question.question_type === 'mcq';

                  return (
                    <Card key={question.id}>
                      <CardHeader
                        title={t.t('oex.take_q_number', { n: t.digits(index + 1) })}
                        icon={isMcq ? 'bi-ui-radios' : 'bi-pencil'}
                        actions={
                          <Badge
                            tone={
                              answer?.is_correct === true
                                ? 'success'
                                : answer?.is_correct === false
                                  ? 'danger'
                                  : 'neutral'
                            }
                          >
                            {t.digits(formatMark(awarded, t.digits))} / {t.digits(Number(question.marks))}
                          </Badge>
                        }
                      />
                      <CardBody className="space-y-3">
                        <p className="whitespace-pre-line text-ink">{question.question_text}</p>

                        {uploadUrl(question.question_image) !== '' && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={uploadUrl(question.question_image)}
                            alt={t.t('oex.take_figure_alt')}
                            className="max-h-72 rounded-orbit border border-line-soft object-contain"
                          />
                        )}

                        {isMcq ? (
                          <ul className="space-y-1.5 text-sm">
                            {(['a', 'b', 'c', 'd'] as const).map((key) => {
                              const text = String(
                                (question as unknown as Record<string, string | null>)[`option_${key}`] ?? ''
                              );
                              if (text.trim() === '') return null;

                              const chosen = answer?.selected_option === key;
                              const correct = question.correct_option === key;

                              return (
                                <li
                                  key={key}
                                  className={
                                    correct
                                      ? 'rounded-orbit bg-emerald-50 px-3 py-2 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                                      : chosen
                                        ? 'rounded-orbit bg-red-50 px-3 py-2 text-red-900 dark:bg-red-950/40 dark:text-red-200'
                                        : 'px-3 py-2 text-ink'
                                  }
                                >
                                  <span className="me-2 font-semibold uppercase">{key}</span>
                                  {text}
                                  {correct && (
                                    <i className="bi bi-check-lg ms-2" aria-hidden />
                                  )}
                                  {chosen && !correct && (
                                    <i className="bi bi-x-lg ms-2" aria-hidden />
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                              {t.t('oex.take_your_answer_plain')}
                            </p>
                            <p className="mt-1 whitespace-pre-line text-sm text-ink">
                              {answer?.answer_text?.trim()
                                ? answer.answer_text
                                : t.t('oex.ev_no_answer')}
                            </p>
                          </div>
                        )}

                        {answer?.teacher_comment && (
                          <div className="rounded-orbit border border-line-soft bg-surface-2 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                              {t.t('oex.ev_comment')}
                            </p>
                            <p className="mt-1 text-sm text-ink">{answer.teacher_comment}</p>
                          </div>
                        )}
                      </CardBody>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        );
      }}
    </StudentPage>
  );
}
