import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback';
import { getLang, translate } from '@/lib/i18n';
import { adminExam } from '@/lib/exams/admin';
import { examQuestions } from '@/lib/exams/engine';
import { uploadUrl } from '@/lib/storage/url';
import { formatMark } from '@/lib/results/grades';
import { QuestionForm } from '@/components/exams/QuestionForm';
import { DeleteQuestion } from '@/components/exams/DeleteQuestion';
import { saveQuestionAction, deleteQuestionAction } from '../../actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'oex.q_title'),
    robots: { index: false, follow: false },
  };
}

/**
 * The question editor, from admin/exam_questions.php.
 *
 * The teacher's editor without the ownership lock — an administrator can fix any
 * teacher's paper. The exam's total marks are the SUM of its questions and are
 * recalculated on every change, never typed in, so the total a student sees
 * always matches the paper in front of them.
 */
export default async function AdminExamQuestionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const examId = /^\d+$/.test(id) ? Number(id) : 0;

  return (
    <AdminPage active="exams" route="/admin/exams" title="">
      {async ({ t }) => {
        const exam = await adminExam(examId);

        if (!exam) {
          return (
            <Card>
              <EmptyState
                icon="bi-journal-x"
                title={t.t('oex.err_not_found')}
                body={t.t('oex.sub_admin')}
                action={
                  <Link
                    href="/admin/exams"
                    className="rounded-orbit border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
                  >
                    {t.t('oex.back_to_exams')}
                  </Link>
                }
              />
            </Card>
          );
        }

        const questions = await examQuestions(exam.id);

        const editId = /^\d+$/.test(query.edit ?? '') ? Number(query.edit) : 0;
        const editing = questions.find((question) => question.id === editId) ?? null;

        // An exam set to one type but holding the other is worth saying out
        // loud: students would not be able to answer it.
        const hasMcq = questions.some((question) => question.question_type === 'mcq');
        const hasCq = questions.some((question) => question.question_type === 'cq');
        const mismatch =
          exam.exam_type === 'mcq' && hasCq
            ? 'oex.q_type_mismatch_mcq'
            : exam.exam_type === 'cq' && hasMcq
              ? 'oex.q_type_mismatch_cq'
              : '';

        return (
          <div className="space-y-6">
            <Link
              href="/admin/exams"
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
                  <Badge tone="neutral">
                    {t.t('oex.total_marks')}: {t.digits(Number(exam.total_marks ?? 0))}
                  </Badge>
                }
              />
            </Card>

            {mismatch !== '' && (
              <Alert tone="warning" icon="bi-exclamation-triangle-fill">
                {t.t(mismatch)}
              </Alert>
            )}

            <QuestionForm
              action={saveQuestionAction}
              examId={exam.id}
              onCancelHref={`/admin/exams/${exam.id}/questions`}
              values={{
                id: editing?.id ?? 0,
                question_type: editing?.question_type ?? (exam.exam_type === 'cq' ? 'cq' : 'mcq'),
                question_text: editing?.question_text ?? '',
                marks: editing ? String(Number(editing.marks)) : '1',
                sort_order: editing ? String(editing.sort_order) : '0',
                option_a: editing?.option_a ?? '',
                option_b: editing?.option_b ?? '',
                option_c: editing?.option_c ?? '',
                option_d: editing?.option_d ?? '',
                correct_option: editing?.correct_option ?? '',
              }}
              labels={{
                add: t.t('oex.q_add'),
                edit: t.t('oex.q_edit'),
                update: t.t('oex.q_update_btn'),
                cancelEdit: t.t('oex.q_cancel_edit'),
                type: t.t('oex.q_type'),
                typeHint: t.t('oex.q_type_hint'),
                typeMcq: t.t('oex.type_mcq'),
                typeCq: t.t('oex.q_type_cq_long'),
                marks: t.t('oex.q_marks'),
                order: t.t('oex.q_order'),
                orderHint: t.t('oex.q_order_hint'),
                text: t.t('oex.q_text'),
                textPlaceholder: t.t('oex.q_text_ph'),
                options: t.t('oex.q_options'),
                optionsHint: t.t('oex.q_options_hint'),
                optionPlaceholder: t.t('oex.q_option_ph'),
                optionOptionalPlaceholder: t.t('oex.q_option_optional_ph'),
                markCorrect: t.t('oex.q_mark_correct'),
                cqNote: t.t('oex.q_cq_note'),
              }}
            />

            <Card>
              <CardHeader
                title={t.t('oex.q_list')}
                subtitle={t.t('oex.q_sub')}
                icon="bi-list-ol"
                actions={<Badge tone="neutral">{t.digits(questions.length)}</Badge>}
              />

              {questions.length === 0 ? (
                <EmptyState
                  icon="bi-patch-question"
                  title={t.t('oex.q_none_title')}
                  body={t.t('oex.q_none_body')}
                />
              ) : (
                <ul className="divide-y divide-line-soft">
                  {questions.map((question, index) => (
                    <li key={question.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-ink-heading">
                              {t.t('oex.take_q_number', { n: t.digits(index + 1) })}
                            </span>
                            <Badge tone={question.question_type === 'mcq' ? 'neutral' : 'info'}>
                              {t.t(question.question_type === 'mcq' ? 'oex.type_mcq' : 'oex.type_cq')}
                            </Badge>
                            <Badge tone="neutral">
                              {formatMark(Number(question.marks), t.digits)} {t.t('oex.q_marks')}
                            </Badge>
                          </p>

                          <p className="mt-1.5 whitespace-pre-line text-sm text-ink">
                            {question.question_text}
                          </p>

                          {uploadUrl(question.question_image) !== '' && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={uploadUrl(question.question_image)}
                              alt={t.t('oex.q_current_image')}
                              className="mt-2 max-h-40 rounded-orbit border border-line-soft object-contain"
                            />
                          )}

                          {question.question_type === 'mcq' && (
                            <ul className="mt-2 space-y-1 text-sm">
                              {(['a', 'b', 'c', 'd'] as const).map((key) => {
                                const text = String(
                                  (question as unknown as Record<string, string | null>)[
                                    `option_${key}`
                                  ] ?? ''
                                );
                                if (text.trim() === '') return null;
                                const correct = question.correct_option === key;
                                return (
                                  <li
                                    key={key}
                                    className={
                                      correct
                                        ? 'font-medium text-emerald-700 dark:text-emerald-400'
                                        : 'text-ink-muted'
                                    }
                                  >
                                    <span className="me-2 font-semibold uppercase">{key}</span>
                                    {text}
                                    {correct && <i className="bi bi-check-lg ms-2" aria-hidden />}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          <Link
                            href={`/admin/exams/${exam.id}/questions?edit=${question.id}`}
                            className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                          >
                            {t.t('common.edit')}
                          </Link>
                          <DeleteQuestion
                            action={deleteQuestionAction}
                            examId={exam.id}
                            questionId={question.id}
                            labels={{
                              remove: t.t('common.delete'),
                              confirm: t.t('oex.q_delete_confirm'),
                              cancel: t.t('common.cancel'),
                            }}
                          />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <CardBody className="border-t border-line-soft text-xs text-ink-muted">
                {t.t('oex.q_sub')}
              </CardBody>
            </Card>
          </div>
        );
      }}
    </AdminPage>
  );
}
