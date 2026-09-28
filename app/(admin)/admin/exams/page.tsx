import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { getLang, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { publicCourses } from '@/lib/site/courses';
import { autosubmitExpired, examState } from '@/lib/exams/engine';
import { adminExams, examTeachers } from '@/lib/exams/admin';
import { ExamForm } from '@/components/exams/ExamForm';
import { ExamRowActions } from '@/components/exams/ExamRowActions';
import {
  saveExamAction,
  setExamStatusAction,
  setResultsPublishedAction,
  deleteExamAction,
} from './actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'oex.title_admin'),
    robots: { index: false, follow: false },
  };
}

/**
 * Online exams, from admin/exams_management.php.
 *
 * The same screen the teacher has, over every teacher's exams. Opening it
 * auto-submits anything whose timer ran out, so a student who closed their
 * browser mid-exam appears in the marking queue instead of being invisible.
 */
export default async function AdminExamsPage({
  searchParams,
}: {
  searchParams: Promise<{
    edit?: string;
    new?: string;
    search?: string;
    teacher?: string;
    course?: string;
    batch?: string;
    type?: string;
    status?: string;
  }>;
}) {
  const params = await searchParams;

  return (
    <AdminPage active="exams" route="/admin/exams" title="">
      {async ({ t }) => {
        await autosubmitExpired();

        const filters = {
          search: (params.search ?? '').trim().slice(0, 100),
          teacherId: /^\d+$/.test(params.teacher ?? '') ? Number(params.teacher) : 0,
          course: (params.course ?? '').slice(0, 150),
          batch: (params.batch ?? '').slice(0, 150),
          type: params.type ?? '',
          status: params.status ?? '',
        };

        const [exams, courses, teachers, allTeachers] = await Promise.all([
          adminExams(filters),
          publicCourses(),
          examTeachers(),
          prisma.teacher
            .findMany({
              where: { status: 'active' },
              orderBy: { name: 'asc' },
              select: { id: true, name: true, name_bn: true },
            })
            .catch(() => []),
        ]);

        const editId = /^\d+$/.test(params.edit ?? '') ? Number(params.edit) : 0;
        const editing = exams.find((exam) => exam.id === editId) ?? null;
        const showForm = editing !== null || params.new !== undefined;

        const courseNames = courses.map((course) => course.name);
        const batchesByCourse: Record<string, string[]> = {};
        for (const course of courses) {
          batchesByCourse[course.name] = course.batches.map((batch) => batch.name);
        }

        const local = (date: Date) =>
          new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-ink-heading">{t.t('oex.title_admin')}</h1>
                <p className="mt-1 text-sm text-ink-muted">{t.t('oex.sub_admin')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/admin/exam-evaluation"
                  className="rounded-orbit border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
                >
                  {t.t('oex.eval_title')}
                </Link>
                {!showForm && (
                  <Link
                    href="/admin/exams?new=1"
                    className="inline-flex items-center gap-2 rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                  >
                    <i className="bi bi-plus-lg" aria-hidden />
                    {t.t('oex.btn_create')}
                  </Link>
                )}
              </div>
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
                onCancelHref="/admin/exams"
                teachers={allTeachers.map((teacher) => ({
                  id: teacher.id,
                  name: t.pick(teacher, 'name'),
                }))}
                selectedTeacherId={editing?.teacher_id ?? 0}
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
                  teacher: t.t('common.teacher'),
                  teacherNone: t.t('oex.f_teacher_none'),
                  create: t.t('oex.btn_create'),
                  update: t.t('oex.btn_update'),
                  cancel: t.t('common.cancel'),
                }}
              />
            )}

            <Card>
              <form method="get" className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-5">
                <label className="flex flex-col gap-1 text-sm lg:col-span-2">
                  <span className="text-ink-muted">{t.t('common.search')}</span>
                  <input
                    type="search"
                    name="search"
                    defaultValue={filters.search}
                    placeholder={t.t('oex.f_title_ph')}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('common.teacher')}</span>
                  <select
                    name="teacher"
                    defaultValue={String(filters.teacherId || 0)}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="0">{t.t('common.all')}</option>
                    {teachers.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {t.pick(teacher, 'name')}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('oex.f_type')}</span>
                  <select
                    name="type"
                    defaultValue={filters.type}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="">{t.t('common.all')}</option>
                    <option value="mcq">{t.t('oex.type_mcq')}</option>
                    <option value="cq">{t.t('oex.type_cq')}</option>
                    <option value="mixed">{t.t('oex.type_mixed')}</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('common.status')}</span>
                  <select
                    name="status"
                    defaultValue={filters.status}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="">{t.t('common.all')}</option>
                    <option value="draft">{t.t('oex.state_draft')}</option>
                    <option value="published">{t.t('status.published')}</option>
                    <option value="cancelled">{t.t('oex.state_cancelled')}</option>
                  </select>
                </label>

                <div className="flex items-end gap-2 sm:col-span-2">
                  <button
                    type="submit"
                    className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                  >
                    {t.t('common.filter')}
                  </button>
                  <Link
                    href="/admin/exams"
                    className="rounded-orbit border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
                  >
                    {t.t('common.clear')}
                  </Link>
                </div>
              </form>
            </Card>

            <Card>
              <CardHeader title={t.t('oex.title_admin')} icon="bi-journal-check" />

              {exams.length === 0 ? (
                <EmptyState
                  icon="bi-journal-plus"
                  title={t.t(
                    filters.search !== '' || filters.teacherId > 0 || filters.type !== '' || filters.status !== ''
                      ? 'oex.none_filtered'
                      : 'oex.none_title'
                  )}
                  body={t.t('oex.none_body')}
                />
              ) : (
                <TableWrap>
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>{t.t('oex.col_exam')}</Th>
                        <Th>{t.t('common.teacher')}</Th>
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
                              {exam.teacher ? t.pick(exam.teacher, 'name') : t.t('oex.f_teacher_none')}
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
                                basePath="/admin"
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
    </AdminPage>
  );
}
