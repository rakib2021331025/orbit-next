import type { Metadata } from 'next';
import Link from 'next/link';
import { TeacherPage } from '@/components/portal/TeacherPage';
import { Card, CardHeader, StatCard } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { getLang, translate } from '@/lib/i18n';
import { teacherExams } from '@/lib/teacher/data';
import { autosubmitExpired, examState } from '@/lib/exams/engine';
import { publicCourses } from '@/lib/site/courses';
import { ExamForm } from '@/components/exams/ExamForm';
import {
  saveExamAction,
  setExamStatusAction,
  setResultsPublishedAction,
  deleteExamAction,
} from './actions';
import { ExamRowActions } from '@/components/exams/ExamRowActions';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'oex.title_teacher'),
    robots: { index: false, follow: false },
  };
}

/**
 * The teacher's exams, from teacher/exams.php.
 *
 * Teachers only ever see and edit exams assigned to them, and a new exam is
 * assigned to them — that is not a filter on the page but a lock in the library,
 * so there is no UI state that could remove it.
 *
 * `?edit=<id>` opens the form on an existing exam. The id is resolved through the
 * teacher's own list, so an id belonging to somebody else simply is not found.
 */
export default async function TeacherExamsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; new?: string }>;
}) {
  const params = await searchParams;

  return (
    <TeacherPage
      active="exams"
      title={(t) => t.t('oex.title_teacher')}
      subtitle={(t) => t.t('oex.sub_teacher')}
      actions={(t) => (
        <Link
          href="/teacher/exams?new=1"
          className="inline-flex items-center gap-2 rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
        >
          <i className="bi bi-plus-lg" aria-hidden />
          {t.t('oex.btn_create')}
        </Link>
      )}
    >
      {async ({ teacher, t }) => {
        await autosubmitExpired();

        const [exams, courses] = await Promise.all([teacherExams(teacher.id), publicCourses()]);

        const editId = /^\d+$/.test(params.edit ?? '') ? Number(params.edit) : 0;
        // Found through the teacher's own list, so another teacher's id is simply
        // absent rather than refused.
        const editing = exams.find((exam) => exam.id === editId) ?? null;
        const showForm = params.new === '1' || editing !== null;

        const courseNames = courses.map((course) => course.name);
        const batchesByCourse: Record<string, string[]> = {};
        for (const course of courses) {
          batchesByCourse[course.name] = course.batches.map((batch) => batch.name);
        }

        const local = (date: Date) =>
          // `datetime-local` wants the wall clock, not an ISO instant.
          new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
            .toISOString()
            .slice(0, 16);

        const running = exams.filter((exam) => examState(exam).open).length;
        const drafts = exams.filter((exam) => exam.status === 'draft').length;
        const published = exams.filter((exam) => exam.status === 'published').length;

        return (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard label={t.t('oex.stat_running')} value={t.digits(running)} icon="bi-broadcast" tone={running > 0 ? 'success' : 'default'} />
              <StatCard label={t.t('oex.stat_published')} value={t.digits(published)} icon="bi-journal-check" />
              <StatCard label={t.t('oex.stat_drafts')} value={t.digits(drafts)} icon="bi-pencil" />
            </div>

            {showForm && (
              <ExamForm
                action={saveExamAction}
                values={{
                  id: editing?.id ?? 0,
                  title: editing?.title ?? '',
                  exam_type: editing?.exam_type ?? 'mcq',
                  subject: editing?.subject ?? '',
                  course: editing?.course ?? '',
                  batch: editing?.batch ?? '',
                  instructions: editing?.instructions ?? '',
                  pass_marks: editing ? String(Number(editing.pass_marks)) : '0',
                  duration_minutes: editing ? String(editing.duration_minutes) : '60',
                  start_datetime: editing ? local(editing.start_datetime) : '',
                  end_datetime: editing ? local(editing.end_datetime) : '',
                  negative_marking: editing ? String(Number(editing.negative_marking)) : '0',
                  allow_file_upload: editing?.allow_file_upload ?? true,
                  status: editing?.status ?? 'draft',
                }}
                courses={courseNames}
                batchesByCourse={batchesByCourse}
                onCancelHref="/teacher/exams"
                labels={{
                  newTitle: t.t('oex.btn_create'),
                  editTitle: t.t('oex.btn_update'),
                  title: t.t('oex.f_title'),
                  titlePlaceholder: t.t('oex.f_title_ph'),
                  subject: t.t('common.subject'),
                  type: t.t('oex.f_type'),
                  typeMcq: t.t('oex.type_mcq_long'),
                  typeCq: t.t('oex.type_cq_long'),
                  typeMixed: t.t('oex.type_mixed_long'),
                  course: t.t('common.course'),
                  batch: t.t('common.batch'),
                  anyCourse: t.t('oex.f_any_course'),
                  anyBatch: t.t('oex.f_any_batch'),
                  audienceHint: t.t('oex.f_audience_hint'),
                  starts: t.t('oex.f_starts'),
                  ends: t.t('oex.f_ends'),
                  endsHint: t.t('oex.f_ends_hint'),
                  duration: t.t('oex.f_duration'),
                  durationHint: t.t('oex.f_duration_hint'),
                  passMarks: t.t('oex.f_pass_marks'),
                  negative: t.t('oex.f_negative'),
                  negativeHint: t.t('oex.f_negative_hint'),
                  status: t.t('common.status'),
                  statusDraft: t.t('oex.state_draft'),
                  statusPublished: t.t('status.published'),
                  statusCancelled: t.t('oex.state_cancelled'),
                  instructions: t.t('oex.f_instructions'),
                  instructionsPlaceholder: t.t('oex.f_instructions_ph'),
                  allowUpload: t.t('oex.f_allow_upload'),
                  create: t.t('oex.btn_create'),
                  update: t.t('oex.btn_update'),
                  cancel: t.t('common.cancel'),
                }}
              />
            )}

            <Card>
              <CardHeader title={t.t('oex.title_teacher')} icon="bi-journal-check" />

              {exams.length === 0 ? (
                <EmptyState
                  icon="bi-journal-plus"
                  title={t.t('tch.dash.no_exams')}
                  body={t.t('oex.sub_teacher')}
                />
              ) : (
                <TableWrap>
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>{t.t('oex.col_exam')}</Th>
                        <Th>{t.t('oex.col_window')}</Th>
                        <Th alignment="center">{t.t('oex.col_qs_marks')}</Th>
                        <Th alignment="center">{t.t('oex.col_attempts')}</Th>
                        <Th alignment="center">{t.t('common.status')}</Th>
                        <Th alignment="end">{t.t('common.actions')}</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {exams.map((exam) => {
                        const state = examState(exam);
                        return (
                          <Tr key={exam.id}>
                            <Td>
                              <span className="font-medium text-ink">{exam.title}</span>
                              <span className="block text-xs text-ink-muted">
                                {[exam.subject, exam.course, exam.batch].filter(Boolean).join(' · ')}
                              </span>
                            </Td>
                            <Td className="text-xs">
                              {t.date(exam.start_datetime, 'd M, h:i A')}
                              <span className="block text-ink-muted">
                                {t.date(exam.end_datetime, 'd M, h:i A')}
                              </span>
                            </Td>
                            <Td alignment="center" numeric>
                              {t.digits(exam._count.examQuestion_exam)} /{' '}
                              {t.digits(Number(exam.total_marks ?? 0))}
                            </Td>
                            <Td alignment="center" numeric>
                              {t.digits(exam._count.examAttempt_exam)}
                            </Td>
                            <Td alignment="center">
                              <Badge tone={state.tone}>{t.t(state.labelKey)}</Badge>
                              {exam.result_published && (
                                <span className="mt-1 block">
                                  <Badge tone="info">{t.t('oex.results_live')}</Badge>
                                </span>
                              )}
                            </Td>
                            <Td alignment="end">
                              <ExamRowActions
                                actions={{
                                  setStatus: setExamStatusAction,
                                  setResultsPublished: setResultsPublishedAction,
                                  remove: deleteExamAction,
                                }}
                                basePath="/teacher"
                                examId={exam.id}
                                status={exam.status}
                                resultsPublished={exam.result_published}
                                hasQuestions={exam._count.examQuestion_exam > 0}
                                labels={{
                                  questions: t.t('oex.act_questions'),
                                  edit: t.t('common.edit'),
                                  publish: t.t('oex.act_publish'),
                                  unpublish: t.t('oex.act_unpublish'),
                                  publishResults: t.t('oex.act_publish_results'),
                                  hideResults: t.t('oex.act_hide_results'),
                                  submissions: t.t('oex.act_submissions'),
                                  remove: t.t('common.delete'),
                                  confirmDelete: t.t('oex.delete_confirm', { title: exam.title }),
                                  cancel: t.t('common.cancel'),
                                }}
                              />
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
