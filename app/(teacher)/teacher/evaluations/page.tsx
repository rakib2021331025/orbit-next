import type { Metadata } from 'next';
import Link from 'next/link';
import { TeacherPage } from '@/components/portal/TeacherPage';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { ButtonLink } from '@/components/ui/Button';
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { getLang, translate } from '@/lib/i18n';
import { teacherExams } from '@/lib/teacher/data';
import { fetchAttempts } from '@/lib/exams/evaluation';
import { autosubmitExpired } from '@/lib/exams/engine';
import { formatMark } from '@/lib/results/grades';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'oex.eval_title'),
    robots: { index: false, follow: false },
  };
}

/**
 * The evaluation queue, from teacher/evaluations.php.
 *
 * Every filter is applied on top of `teacherId`, which is not a filter the
 * teacher chose — it is the boundary. The original makes the same distinction by
 * zeroing `teacher_id` in the array it hands to the view *after* the query has
 * run, so the UI cannot offer to remove it.
 *
 * Opening the page auto-submits anything whose timer ran out, so a student who
 * closed their browser appears in the queue rather than being invisible.
 */
export default async function TeacherEvaluationsPage({
  searchParams,
}: {
  searchParams: Promise<{ exam?: string; status?: string; search?: string }>;
}) {
  const params = await searchParams;

  return (
    <TeacherPage
      active="evaluation"
      title={(t) => t.t('oex.eval_title')}
      subtitle={(t) => t.t('oex.eval_sub_teacher')}
      actions={(t) => (
        <ButtonLink href="/teacher/exams" variant="secondary" icon="bi-journal-check">
          {t.t('oex.title_teacher')}
        </ButtonLink>
      )}
    >
      {async ({ teacher, t }) => {
        await autosubmitExpired();

        const examId = /^\d+$/.test(params.exam ?? '') ? Number(params.exam) : 0;
        const status =
          params.status === 'submitted' || params.status === 'evaluated' ? params.status : '';
        const search = (params.search ?? '').trim().slice(0, 100);

        const [attempts, exams] = await Promise.all([
          fetchAttempts({ teacherId: teacher.id, examId, status, search }),
          teacherExams(teacher.id),
        ]);

        return (
          <div className="space-y-6">
            <Card>
              <form method="get" className="flex flex-wrap items-end gap-3 px-5 py-4">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('oex.col_exam')}</span>
                  <select
                    name="exam"
                    defaultValue={String(examId)}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="0">{t.t('oex.eval_all_exams')}</option>
                    {exams.map((exam) => (
                      <option key={exam.id} value={exam.id}>
                        {exam.title}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('common.status')}</span>
                  <select
                    name="status"
                    defaultValue={status}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="">{t.t('rec.any_status')}</option>
                    <option value="submitted">{t.t('oex.ev_awaiting')}</option>
                    <option value="evaluated">{t.t('oex.eval_st_evaluated')}</option>
                  </select>
                </label>

                <label className="flex flex-1 flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('common.search')}</span>
                  <input
                    type="search"
                    name="search"
                    defaultValue={search}
                    placeholder={t.t('oex.eval_search_ph')}
                    className="w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  />
                </label>

                <button
                  type="submit"
                  className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                >
                  {t.t('common.filter')}
                </button>
              </form>
            </Card>

            <Card>
              <CardHeader
                title={t.t('oex.submissions')}
                icon="bi-inbox"
                actions={<Badge tone="neutral">{t.digits(attempts.length)}</Badge>}
              />

              {attempts.length === 0 ? (
                <EmptyState
                  icon="bi-inbox"
                  title={t.t('oex.eval_none_title')}
                  body={t.t('oex.eval_none_body')}
                />
              ) : (
                <TableWrap>
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>{t.t('common.name')}</Th>
                        <Th>{t.t('oex.col_exam')}</Th>
                        <Th alignment="end" numeric>{t.t('oex.col_score')}</Th>
                        <Th alignment="center">{t.t('oex.col_files')}</Th>
                        <Th>{t.t('oex.col_submitted')}</Th>
                        <Th alignment="center">{t.t('common.status')}</Th>
                        <Th alignment="end">{t.t('common.actions')}</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {attempts.map((attempt) => {
                        const total = Number(attempt.exam.total_marks ?? 0);
                        const score = Number(attempt.total_score ?? 0);
                        const marked = attempt.status === 'evaluated';

                        return (
                          <Tr key={attempt.id}>
                            <Td>
                              <span className="font-medium text-ink">
                                {t.pick(attempt.student, 'name')}
                              </span>
                              {attempt.exam.batch && (
                                <span className="block text-xs text-ink-muted">
                                  {attempt.exam.batch}
                                </span>
                              )}
                            </Td>
                            <Td>
                              {attempt.exam.title}
                              <span className="block text-xs text-ink-muted">
                                {attempt.exam.subject}
                              </span>
                            </Td>
                            <Td alignment="end" numeric>
                              <span className={cn(marked && 'font-semibold text-primary')}>
                                {formatMark(score, t.digits)} / {t.digits(total)}
                              </span>
                            </Td>
                            <Td alignment="center">
                              {attempt._count.examAnswerFile_attempt > 0 ? (
                                <Badge tone="info" icon="bi-paperclip">
                                  {t.digits(attempt._count.examAnswerFile_attempt)}
                                </Badge>
                              ) : (
                                <span className="text-xs text-ink-muted">—</span>
                              )}
                            </Td>
                            <Td>
                              {attempt.submitted_at
                                ? t.date(attempt.submitted_at, 'd M Y, h:i A')
                                : '—'}
                              {attempt.submit_mode === 'auto' && (
                                <span className="ms-1 text-xs text-ink-muted">
                                  ({t.t('oex.auto_badge')})
                                </span>
                              )}
                            </Td>
                            <Td alignment="center">
                              <Badge tone={marked ? 'success' : 'warning'}>
                                {t.t(marked ? 'oex.eval_st_evaluated' : 'oex.eval_st_to_mark')}
                              </Badge>
                            </Td>
                            <Td alignment="end">
                              <Link
                                href={`/teacher/evaluate/${attempt.id}`}
                                className="rounded-orbit border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-2"
                              >
                                {t.t(marked ? 'oex.btn_review' : 'oex.btn_evaluate')}
                              </Link>
                            </Td>
                          </Tr>
                        );
                      })}
                    </Tbody>
                  </Table>
                </TableWrap>
              )}
            </Card>
          </div>
        );
      }}
    </TeacherPage>
  );
}
