import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { getLang, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { paginate, pageHref } from '@/lib/paginate';
import { attendanceBatches } from '@/lib/attendance/register';
import {
  reportFilters,
  reportWhere,
  reportTotals,
  reportRecords,
  studentSummaries,
  filtersQuery,
} from '@/lib/attendance/report';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'att.report_title'),
    robots: { index: false, follow: false },
  };
}

/**
 * The attendance report, from admin/attendance_report.php.
 *
 * Two views over the same filters: the individual records, and one row per student
 * with their rate. The summary can be sorted **lowest first**, which is the view
 * an office actually needs — it answers "who should we call" rather than "what
 * happened".
 *
 * A rate below 75% is highlighted, the threshold the rest of the app uses.
 */
export default async function AdminAttendanceReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  return (
    <AdminPage active="attendance_report" route="/admin/attendance-report" title="">
      {async ({ t }) => {
        const view = params.view === 'summary' ? 'summary' : 'records';
        const sort = params.sort === 'low' ? 'low' : 'name';

        const filters = await reportFilters(params);
        const where = await reportWhere(filters);
        const query = { ...filtersQuery(filters), view, sort };

        const [totals, courses, batches] = await Promise.all([
          reportTotals(where),
          prisma.course
            .findMany({
              orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
              select: { id: true, name: true, name_bn: true },
            })
            .catch(() => []),
          attendanceBatches(),
        ]);

        const studentCount = (
          await prisma.attendance
            .findMany({ where, distinct: ['student_id'], select: { student_id: true } })
            .catch(() => [])
        ).length;

        const pager = paginate(totals.total, 30, Number(params.page ?? 1));
        const records = view === 'records' ? await reportRecords(where, pager.perPage, pager.offset) : [];

        const summaries = view === 'summary' ? await studentSummaries(where) : [];
        if (view === 'summary' && sort === 'low') {
          // Lowest attendance first, and within the same rate the student with
          // more classes recorded comes first — a 50% over 20 classes is a
          // bigger problem than 50% over two.
          summaries.sort((a, b) => a.totals.rate - b.totals.rate || b.totals.total - a.totals.total);
        }

        const rateBadge = (rate: number) => (
          <Badge tone={rate >= 90 ? 'success' : rate >= 75 ? 'warning' : 'danger'}>
            {t.number(rate, 1)}%
          </Badge>
        );

        const statusTone: Record<string, 'success' | 'warning' | 'info' | 'danger'> = {
          present: 'success',
          late: 'warning',
          half_day: 'info',
          absent: 'danger',
        };

        const exportQuery = new URLSearchParams();
        for (const [key, value] of Object.entries(filtersQuery(filters))) {
          if (value !== undefined) exportQuery.set(key, value);
        }

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-ink-heading">{t.t('att.report_title')}</h1>
                <p className="mt-1 text-sm text-ink-muted">{t.t('att.report_sub')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {/* The export is a route rather than a page: it streams a file. */}
                <a
                  href={`/api/export/attendance?${exportQuery}`}
                  className="rounded-orbit bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
                >
                  {t.t('att.export_xlsx')}
                </a>
                <a
                  href={`/api/export/attendance?${exportQuery}${exportQuery.size > 0 ? '&' : ''}format=csv`}
                  className="rounded-orbit border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
                >
                  {t.t('att.export_csv')}
                </a>
                <Link
                  href="/admin/attendance"
                  className="rounded-orbit border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
                >
                  {t.t('att.register')}
                </Link>
              </div>
            </div>

            <Card>
              <form method="get" className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
                <input type="hidden" name="view" value={view} />
                <input type="hidden" name="sort" value={sort} />

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('common.course')}</span>
                  <select
                    name="course"
                    defaultValue={filters.courseId > 0 ? String(filters.courseId) : ''}
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
                  <span className="text-ink-muted">{t.t('common.batch')}</span>
                  <select
                    name="batch"
                    defaultValue={filters.batchId === '' ? '' : String(filters.batchId)}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="">{t.t('att.batch_any')}</option>
                    <option value="0">{t.t('att.unassigned')}</option>
                    {batches.map((batch) => (
                      <option key={batch.id} value={batch.id}>
                        {t.pick(batch, 'name')} (
                        {t.t(batch.batch_type === 'online' ? 'abat.type_online' : 'abat.type_offline')})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('att.student_search')}</span>
                  <input
                    type="search"
                    name="student"
                    maxLength={100}
                    defaultValue={filters.student}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('common.status')}</span>
                  <select
                    name="status"
                    defaultValue={filters.status}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="">{t.t('att.status_any')}</option>
                    {(['present', 'late', 'half_day', 'absent'] as const).map((status) => (
                      <option key={status} value={status}>
                        {t.t(`attendance.${status}`)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('common.from')}</span>
                  <input
                    type="date"
                    name="from"
                    defaultValue={filters.from}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('common.to')}</span>
                  <input
                    type="date"
                    name="to"
                    defaultValue={filters.to}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  />
                </label>

                <div className="flex items-end gap-2 sm:col-span-2">
                  <button
                    type="submit"
                    className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                  >
                    {t.t('common.filter')}
                  </button>
                  <Link
                    href={`/admin/attendance-report?view=${view}`}
                    className="rounded-orbit border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
                  >
                    {t.t('common.clear')}
                  </Link>
                </div>
              </form>
            </Card>

            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: t.t('att.records'), value: t.digits(totals.total) },
                { label: t.t('common.student'), value: t.digits(studentCount) },
                { label: t.t('attendance.present'), value: t.digits(totals.present) },
                { label: t.t('attendance.late'), value: t.digits(totals.late) },
                { label: t.t('attendance.absent'), value: t.digits(totals.absent) },
                { label: t.t('att.rate'), value: `${t.number(totals.rate, 1)}%` },
              ].map((stat) => (
                <div key={stat.label} className="rounded-orbit border border-line bg-surface p-4">
                  <span className="block text-xl font-bold text-ink-heading">{stat.value}</span>
                  <span className="block text-sm text-ink-muted">{stat.label}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {(['records', 'summary'] as const).map((tab) => (
                <Link
                  key={tab}
                  href={pageHref('/admin/attendance-report', { ...query, view: tab, page: undefined }, 1)}
                  className={`rounded-orbit px-3 py-1.5 text-sm font-medium transition ${
                    tab === view ? 'bg-primary text-white' : 'border border-line text-ink hover:bg-surface-2'
                  }`}
                >
                  {t.t(tab === 'records' ? 'att.records' : 'att.summary')}
                </Link>
              ))}

              {view === 'summary' && (
                <>
                  <Link
                    href={pageHref('/admin/attendance-report', { ...query, sort: 'name' }, 1)}
                    className={`rounded-orbit px-3 py-1.5 text-sm font-medium transition ${
                      sort === 'name' ? 'bg-surface-2 text-ink' : 'border border-line text-ink hover:bg-surface-2'
                    }`}
                  >
                    {t.t('att.sort_name')}
                  </Link>
                  <Link
                    href={pageHref('/admin/attendance-report', { ...query, sort: 'low' }, 1)}
                    className={`rounded-orbit px-3 py-1.5 text-sm font-medium transition ${
                      sort === 'low' ? 'bg-surface-2 text-ink' : 'border border-line text-ink hover:bg-surface-2'
                    }`}
                  >
                    {t.t('att.sort_low')}
                  </Link>
                </>
              )}
            </div>

            <Card>
              <CardHeader
                title={t.t(view === 'records' ? 'att.records' : 'att.summary')}
                icon="bi-file-earmark-spreadsheet"
              />

              {view === 'records' ? (
                records.length === 0 ? (
                  <EmptyState
                    icon="bi-calendar-x"
                    title={t.t('att.no_records')}
                    body={t.t('att.report_sub')}
                  />
                ) : (
                  <TableWrap>
                    <Table>
                      <Thead>
                        <Tr>
                          <Th>{t.t('common.date')}</Th>
                          <Th>{t.t('common.student')}</Th>
                          <Th>{t.t('att.class_label')}</Th>
                          <Th alignment="center">{t.t('common.status')}</Th>
                          <Th>{t.t('common.note')}</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {records.map((record) => (
                          <Tr key={record.id}>
                            <Td className="text-xs">{t.date(record.attendance_date, 'd M Y')}</Td>
                            <Td>
                              <Link
                                href={`/admin/students/${record.student.id}`}
                                className="font-medium text-ink hover:text-primary"
                              >
                                {t.pick(record.student, 'name')}
                              </Link>
                              <span className="block text-xs text-ink-muted">
                                {record.student.student_id_no ?? ''}
                              </span>
                            </Td>
                            <Td className="text-xs">{record.class_label ?? '—'}</Td>
                            <Td alignment="center">
                              <Badge tone={statusTone[record.status ?? 'absent'] ?? 'neutral'}>
                                {t.t(`attendance.${record.status ?? 'absent'}`)}
                              </Badge>
                            </Td>
                            <Td className="text-xs">{record.note ?? ''}</Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </TableWrap>
                )
              ) : summaries.length === 0 ? (
                <EmptyState
                  icon="bi-calendar-x"
                  title={t.t('att.no_records')}
                  body={t.t('att.report_sub')}
                />
              ) : (
                <TableWrap>
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>{t.t('common.student')}</Th>
                        <Th>{t.t('astd.col_course_batch')}</Th>
                        <Th alignment="center">{t.t('att.short.present')}</Th>
                        <Th alignment="center">{t.t('att.short.late')}</Th>
                        <Th alignment="center">{t.t('att.short.half_day')}</Th>
                        <Th alignment="center">{t.t('att.short.absent')}</Th>
                        <Th alignment="center">{t.t('att.records')}</Th>
                        <Th alignment="center">{t.t('att.percentage')}</Th>
                        <Th>{t.t('att.first_last')}</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {summaries.map((row) => (
                        <Tr key={row.studentId}>
                          <Td>
                            <Link
                              href={`/admin/students/${row.studentId}`}
                              className="font-medium text-ink hover:text-primary"
                            >
                              {t.pick({ name: row.name, name_bn: row.nameBn }, 'name')}
                            </Link>
                            <span className="block text-xs text-ink-muted">{row.studentIdNo ?? ''}</span>
                          </Td>
                          <Td className="text-xs">
                            {row.courses.join(', ')}
                            {row.batches.length > 0 && (
                              <span className="block text-ink-muted">{row.batches.join(', ')}</span>
                            )}
                          </Td>
                          <Td alignment="center" numeric>
                            {t.digits(row.totals.present)}
                          </Td>
                          <Td alignment="center" numeric>
                            {t.digits(row.totals.late)}
                          </Td>
                          <Td alignment="center" numeric>
                            {t.digits(row.totals.half_day)}
                          </Td>
                          <Td alignment="center" numeric>
                            {t.digits(row.totals.absent)}
                          </Td>
                          <Td alignment="center" numeric>
                            {t.digits(row.totals.total)}
                          </Td>
                          <Td alignment="center">{rateBadge(row.totals.rate)}</Td>
                          <Td className="text-xs">
                            {row.firstDate ? t.date(row.firstDate, 'd M Y') : ''}
                            {row.lastDate && row.lastDate !== row.firstDate
                              ? ` – ${t.date(row.lastDate, 'd M Y')}`
                              : ''}
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </TableWrap>
              )}

              {view === 'records' && pager.totalPages > 1 && (
                <CardBody className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft text-sm">
                  <span className="text-ink-muted">
                    {t.t('astd.showing', {
                      from: t.digits(pager.from),
                      to: t.digits(pager.to),
                      total: t.digits(pager.total),
                    })}
                  </span>
                  <span className="flex gap-2">
                    {pager.page > 1 && (
                      <Link
                        href={pageHref('/admin/attendance-report', query, pager.page - 1)}
                        className="rounded-orbit border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-2"
                      >
                        {t.t('common.previous')}
                      </Link>
                    )}
                    {pager.page < pager.totalPages && (
                      <Link
                        href={pageHref('/admin/attendance-report', query, pager.page + 1)}
                        className="rounded-orbit border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-2"
                      >
                        {t.t('common.next')}
                      </Link>
                    )}
                  </span>
                </CardBody>
              )}
            </Card>
          </div>
        );
      }}
    </AdminPage>
  );
}
