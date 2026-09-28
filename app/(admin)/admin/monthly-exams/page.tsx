import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { Pagination } from '@/components/ui/Pagination';
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { getLang, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { setting, settingNumber } from '@/lib/settings';
import { branchList } from '@/lib/branch/stats';
import { branchesEnabled } from '@/lib/branch/active';
import { formatMark } from '@/lib/results/grades';
import { MERIT_SIZE_MAX, MERIT_SIZE_MIN, examList, examListFilters } from '@/lib/exams/monthly';
import { DeleteExam, MeritOptionsForm, PublishToggle } from './ExamForms';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'mexam.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * Monthly exams, from the list half of admin/monthly_exams.php.
 *
 * The exam name links to its marks page rather than to its settings: an exam is
 * opened to enter or read marks far more often than to change its subjects.
 *
 * Super admins only — an exam can span every branch.
 */
export default async function AdminMonthlyExamsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  return (
    <AdminPage active="monthly_exams" route="/admin/monthly-exams" level="super" title="">
      {async ({ t }) => {
        const filters = examListFilters(params);
        const filtered =
          filters.month !== '' || filters.courseId > 0 || filters.status !== '';

        const [{ rows, pager }, courses, meritPublic, meritSize, searchPublic, multiBranch, branches] =
          await Promise.all([
            examList(filters),
            prisma.course
              .findMany({
                orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
                select: { id: true, name: true, name_bn: true },
              })
              .catch(() => []),
            setting('merit_list_public', '1').then((value) => value === '1'),
            settingNumber('merit_list_size', 10),
            setting('result_search_public', '1').then((value) => value === '1'),
            branchesEnabled(),
            branchList(),
          ]);

        const branchName = (id: number | null) => {
          const branch = id === null ? undefined : branches.find((row) => row.id === id);
          // A branch carries name_en/name_bn, so the pair helper picks the one
          // the reader wants.
          return branch ? t.pickPair(branch, 'name') : '';
        };

        const listQuery = new URLSearchParams();
        if (filters.month !== '') listQuery.set('month', filters.month);
        if (filters.courseId > 0) listQuery.set('course', String(filters.courseId));
        if (filters.status !== '') listQuery.set('status', filters.status);

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-ink-heading">{t.t('mexam.title')}</h1>
                <p className="mt-1 text-sm text-ink-muted">{t.t('mexam.sub')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/admin/subjects"
                  className="rounded-orbit border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-2"
                >
                  <i className="bi bi-list-ol me-1" aria-hidden /> {t.t('subj.title')}
                </Link>
                <Link
                  href="/admin/monthly-exams/new"
                  className="rounded-orbit bg-primary px-3 py-1.5 text-sm font-medium text-white transition hover:bg-primary-hover"
                >
                  <i className="bi bi-plus-circle me-1" aria-hidden /> {t.t('mexam.create')}
                </Link>
              </div>
            </div>

            <Card>
              <CardBody>
                <MeritOptionsForm
                  meritPublic={meritPublic}
                  meritSize={meritSize}
                  searchPublic={searchPublic}
                  min={MERIT_SIZE_MIN}
                  max={MERIT_SIZE_MAX}
                  labels={{
                    title: t.t('merit.admin_title'),
                    sub: t.t('merit.admin_sub'),
                    public: t.t('merit.admin_public'),
                    size: t.t('merit.admin_size'),
                    sizeHint: t.t('merit.admin_size_hint'),
                    search: t.t('merit.admin_search'),
                    save: t.t('merit.admin_save'),
                    preview: t.t('merit.admin_preview'),
                  }}
                />
              </CardBody>
            </Card>

            <Card>
              <form method="get" className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('common.month')}</span>
                  <input
                    type="month"
                    name="month"
                    defaultValue={filters.month}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('common.course')}</span>
                  <select
                    name="course"
                    defaultValue={String(filters.courseId || '')}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="">{t.t('att.course_any')}</option>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {t.pick(course, 'name')}
                      </option>
                    ))}
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
                    <option value="draft">{t.t('status.draft')}</option>
                    <option value="published">{t.t('status.published')}</option>
                  </select>
                </label>

                <div className="flex items-end gap-2">
                  <button
                    type="submit"
                    className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                  >
                    {t.t('common.filter')}
                  </button>
                  {filtered && (
                    <Link
                      href="/admin/monthly-exams"
                      className="rounded-orbit border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
                    >
                      {t.t('common.clear')}
                    </Link>
                  )}
                </div>
              </form>
            </Card>

            <Card>
              <CardHeader title={t.t('mexam.title')} icon="bi-clipboard-data" />

              {rows.length === 0 ? (
                <EmptyState
                  icon="bi-clipboard-data"
                  title={t.t('mexam.none')}
                  body={t.t('mexam.sub')}
                  action={
                    <Link
                      href="/admin/monthly-exams/new"
                      className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                    >
                      {t.t('mexam.create')}
                    </Link>
                  }
                />
              ) : (
                <>
                  <TableWrap>
                    <Table>
                      <Thead>
                        <Tr>
                          <Th>{t.t('result.exam')}</Th>
                          <Th>{t.t('common.course')}</Th>
                          <Th alignment="center">{t.t('result.subjects')}</Th>
                          <Th alignment="center">{t.t('mexam.marked')}</Th>
                          <Th>{t.t('common.status')}</Th>
                          <Th alignment="end">{t.t('common.actions')}</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {rows.map((row) => {
                          const published = row.status === 'published';
                          const course = t.pick(
                            { name: row.courseName, name_bn: row.courseNameBn ?? '' },
                            'name'
                          );
                          const batch = t.pick(
                            { name: row.batchName, name_bn: row.batchNameBn ?? '' },
                            'name'
                          );

                          return (
                            <Tr key={row.id}>
                              <Td>
                                <Link
                                  href={`/admin/monthly-exams/${row.id}/marks`}
                                  className="font-semibold text-ink hover:text-primary"
                                >
                                  {t.pick({ name: row.title, name_bn: row.titleBn ?? '' }, 'name')}
                                </Link>
                                <span className="block text-xs text-ink-muted">
                                  {t.monthLabel(row.month)}
                                  {row.examDate ? ` · ${t.date(row.examDate, 'd M Y')}` : ''}
                                </span>
                              </Td>

                              <Td>
                                {course !== '' ? (
                                  <>
                                    <span className="block text-sm text-ink">{course}</span>
                                    <span className="block text-xs text-ink-muted">
                                      {batch !== ''
                                        ? `${batch}${row.batchType ? ` (${t.t(`course.type_${row.batchType}`)})` : ''}`
                                        : t.t('mexam.any_batch')}
                                    </span>
                                    {multiBranch && row.batchId !== null && row.branchId !== null && (
                                      <Badge tone="neutral">{branchName(row.branchId)}</Badge>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-sm text-ink-muted">
                                    {t.t('mexam.not_linked')}
                                  </span>
                                )}
                              </Td>

                              <Td alignment="center">
                                {t.digits(row.subjects)}
                                <span className="block text-xs text-ink-muted">
                                  {formatMark(row.totalMarks, t.digits)}
                                </span>
                              </Td>

                              <Td alignment="center">
                                {t.t('mexam.students_marked', { count: t.digits(row.markedStudents) })}
                              </Td>

                              <Td>
                                <Badge tone={published ? 'success' : 'neutral'}>
                                  {t.t(published ? 'status.published' : 'status.draft')}
                                </Badge>
                              </Td>

                              <Td alignment="end">
                                <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                                  <Link
                                    href={`/admin/monthly-exams/${row.id}/marks`}
                                    className="rounded-orbit bg-primary px-2.5 py-1 text-xs font-medium text-white transition hover:bg-primary-hover"
                                  >
                                    <i className="bi bi-pencil-square me-1" aria-hidden />
                                    {t.t('mexam.enter_marks')}
                                  </Link>
                                  <Link
                                    href={`/admin/monthly-exams/${row.id}/edit`}
                                    title={t.t('common.edit')}
                                    aria-label={t.t('common.edit')}
                                    className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                                  >
                                    <i className="bi bi-gear" aria-hidden />
                                  </Link>
                                  <PublishToggle
                                    examId={row.id}
                                    published={published}
                                    labels={{
                                      publish: t.t('mexam.publish'),
                                      unpublish: t.t('mexam.unpublish'),
                                    }}
                                  />
                                  <DeleteExam
                                    examId={row.id}
                                    published={published}
                                    labels={{
                                      remove: t.t('common.delete'),
                                      confirm: t.t('mexam.delete_confirm'),
                                      dismiss: t.t('common.cancel'),
                                      deletePublished: t.t('mexam.delete_published'),
                                    }}
                                  />
                                </span>
                              </Td>
                            </Tr>
                          );
                        })}
                      </Tbody>
                    </Table>
                  </TableWrap>

                  {pager.totalPages > 1 && (
                    <CardBody>
                      <Pagination
                        page={pager.page}
                        totalPages={pager.totalPages}
                        hrefFor={(page) => {
                          const query = new URLSearchParams(listQuery);
                          if (page > 1) query.set('page', String(page));
                          const text = query.toString();
                          return `/admin/monthly-exams${text !== '' ? `?${text}` : ''}`;
                        }}
                        labels={{
                          previous: t.t('common.previous'),
                          next: t.t('common.next'),
                          pageOf: t.t('gallery.page_of'),
                        }}
                        format={t.digits}
                      />
                    </CardBody>
                  )}
                </>
              )}
            </Card>
          </div>
        );
      }}
    </AdminPage>
  );
}
