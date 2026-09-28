import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { Pagination } from '@/components/ui/Pagination';
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { getLang, translate } from '@/lib/i18n';
import { pickLocalized } from '@/lib/i18n/format';
import { paginate } from '@/lib/paginate';
import { prisma } from '@/lib/db/prisma';
import {
  PAYMENT_METHODS,
  REPORT_LIMIT,
  REPORT_TYPES,
  RESULT_CODES,
  cellText,
  isFiltered,
  isNumericType,
  isReportType,
  legacyReportUrl,
  reportFilters,
  reportQuery,
  type ReportType,
} from '@/lib/reports/core';
import {
  examLabel,
  reportBatches,
  reportColumns,
  reportCourses,
  reportExams,
  reportRows,
  reportSummary,
} from '@/lib/reports/data';
import { FilterForm } from './FilterForm';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'arep.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * The reports hub, from admin/reports.php.
 *
 * Five reports over the same institute, each with filters, a table with totals,
 * and exports that use **exactly those filters**. Attendance keeps its own
 * report and this page links to it rather than half-reimplementing it.
 *
 * Super admins only: these are institute-wide figures, and a branch-restricted
 * admin has no business reading another branch's money or roll.
 */
export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  // Links to the old FPDF reports still arrive; they go where they meant to.
  if (params.type !== undefined && params.report === undefined) {
    redirect(legacyReportUrl(params));
  }
  if (params.report === 'attendance') redirect('/admin/attendance-report');

  return (
    <AdminPage active="reports" route="/admin/reports" level="super" title="">
      {async ({ t }) => {
        const report: ReportType | '' = isReportType(params.report) ? params.report : '';

        /* ------------------------------------------------- the picker */
        if (report === '') {
          const monthStart = new Date();
          monthStart.setUTCDate(1);
          monthStart.setUTCHours(0, 0, 0, 0);
          const monthNext = new Date(monthStart);
          monthNext.setUTCMonth(monthNext.getUTCMonth() + 1);

          const [students, enrollments, collected, dues, exams, attendance] = await Promise.all([
            prisma.student
              .count({ where: { status: 'approved', student_status: 'Active' } })
              .catch(() => null),
            prisma.admission
              .count({ where: { status: { in: ['pending', 'under_review', 'payment_verified'] } } })
              .catch(() => null),
            prisma.payment
              .aggregate({
                where: {
                  payment_status: 'paid',
                  payment_date: { gte: monthStart, lt: monthNext },
                },
                _sum: { amount: true },
              })
              .catch(() => null),
            // Summed in the database, one row per status, instead of reading
            // every payment the institute has ever taken to add it up here.
            prisma.payment
              .groupBy({
                by: ['payment_status'],
                _sum: { amount: true, due_amount: true },
              })
              .catch(() => null),
            prisma.monthlyExam.count().catch(() => null),
            prisma.attendance.count().catch(() => null),
          ]);

          const dueTotal =
            dues === null
              ? null
              : dues.reduce(
                  (sum, row) =>
                    sum +
                    (row.payment_status === 'paid'
                      ? Number(row._sum.due_amount ?? 0)
                      : Number(row._sum.amount ?? 0)),
                  0
                );

          const figures: Partial<Record<ReportType, string>> = {};
          if (students !== null) figures.students = t.t('arep.card_students', { count: t.digits(students) });
          if (enrollments !== null) {
            figures.enrollments = t.t('arep.card_enrollments', { count: t.digits(enrollments) });
          }
          if (collected !== null) {
            figures.payments = t.t('arep.card_payments', {
              amount: t.money(Number(collected._sum.amount ?? 0)),
            });
          }
          if (dueTotal !== null) figures.dues = t.t('arep.card_dues', { amount: t.money(dueTotal) });
          if (exams !== null) figures.results = t.t('arep.card_results', { count: t.digits(exams) });
          if (attendance !== null) {
            figures.attendance = t.t('arep.card_attendance', { count: t.digits(attendance) });
          }

          return (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-ink-heading">{t.t('arep.title')}</h1>
                <p className="mt-1 text-sm text-ink-muted">{t.t('arep.sub')}</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {(Object.keys(REPORT_TYPES) as ReportType[]).map((type) => (
                  <Link
                    key={type}
                    href={type === 'attendance' ? '/admin/attendance-report' : `/admin/reports?report=${type}`}
                    className="flex gap-4 rounded-orbit border border-line bg-surface p-4 transition hover:border-primary hover:shadow-orbit"
                  >
                    <span className="text-2xl text-primary">
                      <i className={`bi ${REPORT_TYPES[type].icon}`} aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold text-ink-heading">
                        {t.t(`arep.type_${type}`)}
                      </span>
                      <span className="block text-sm text-ink-muted">
                        {t.t(`arep.type_${type}_sub`)}
                      </span>
                      {figures[type] !== undefined && (
                        <span className="mt-1 block text-sm font-medium text-primary">
                          {figures[type]}
                        </span>
                      )}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          );
        }

        /* ------------------------------------------------- one report */
        const filters = reportFilters(report, params);
        const exams = report === 'results' ? await reportExams() : [];
        // Without a chosen exam the newest one is the one somebody means.
        if (report === 'results' && filters.exam === 0 && exams.length > 0) {
          filters.exam = exams[0].id;
        }

        const [summary, columns, courses, batches] = await Promise.all([
          reportSummary(report, filters, t.lang),
          reportColumns(report, filters, t.lang),
          reportCourses(),
          reportBatches(),
        ]);

        const pager = paginate(summary.count, REPORT_LIMIT.page, Number(params.page ?? 1));
        const rows = await reportRows(report, filters, t.lang, pager.perPage, pager.offset);

        const query = reportQuery(report, filters);
        const outputUrl = (format: string) =>
          `/api/export/report?${reportQuery(report, filters, { output: format })}`;
        const printUrl = `/admin/reports/print?${query}`;
        const pageUrl = (page: number) =>
          `/admin/reports?${query}${page > 1 ? `&page=${page}` : ''}`;

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <Link href="/admin/reports" className="text-sm text-primary hover:underline">
                  <i className="bi bi-arrow-left me-1" aria-hidden /> {t.t('arep.all_reports')}
                </Link>
                <h1 className="mt-1 text-2xl font-bold text-ink-heading">
                  {t.t(`arep.type_${report}`)}
                </h1>
                <p className="mt-1 text-sm text-ink-muted">{t.t(`arep.type_${report}_sub`)}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <a
                  href={outputUrl('xlsx')}
                  className="rounded-orbit bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700"
                >
                  <i className="bi bi-file-earmark-excel me-1" aria-hidden />{' '}
                  {t.t('arep.export_xlsx')}
                </a>
                <a
                  href={outputUrl('csv')}
                  className="rounded-orbit border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-2"
                >
                  <i className="bi bi-filetype-csv me-1" aria-hidden /> {t.t('arep.export_csv')}
                </a>
                <a
                  href={printUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-orbit border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-2"
                >
                  <i className="bi bi-printer me-1" aria-hidden /> {t.t('arep.print')}
                </a>
                {report === 'students' && (
                  <a
                    href="/api/export/photos"
                    className="rounded-orbit border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-2"
                  >
                    <i className="bi bi-file-zip me-1" aria-hidden /> {t.t('arep.photos_zip')}
                  </a>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {(Object.keys(REPORT_TYPES) as ReportType[]).map((type) => (
                <Link
                  key={type}
                  href={type === 'attendance' ? '/admin/attendance-report' : `/admin/reports?report=${type}`}
                  aria-current={type === report ? 'page' : undefined}
                  className={`inline-flex items-center gap-2 rounded-orbit px-3 py-1.5 text-sm font-medium transition ${
                    type === report
                      ? 'bg-primary text-white'
                      : 'border border-line text-ink hover:bg-surface-2'
                  }`}
                >
                  <i className={`bi ${REPORT_TYPES[type].icon}`} aria-hidden />
                  {t.t(`arep.type_${type}`)}
                </Link>
              ))}
            </div>

            <Card>
              <FilterForm
                report={report}
                filtered={isFiltered(report, filters)}
                values={{
                  course: filters.course > 0 ? String(filters.course) : '',
                  batch: filters.batch > 0 ? String(filters.batch) : '',
                  status: filters.status,
                  state: filters.state,
                  method: filters.method,
                  month: filters.month,
                  // The month already covers the range, so the date boxes stay
                  // empty rather than showing a range nobody typed.
                  from: filters.month !== '' ? '' : filters.from,
                  to: filters.month !== '' ? '' : filters.to,
                  exam: filters.exam > 0 ? String(filters.exam) : '',
                  result: filters.result,
                  q: filters.q,
                }}
                courses={courses.map((course) => ({
                  value: String(course.id),
                  label: pickLocalized(course, 'name', t.lang),
                }))}
                batches={batches.map((batch) => ({
                  value: String(batch.id),
                  label:
                    pickLocalized(batch, 'name', t.lang) +
                    (batch.batch_type ? ` (${t.t(`course.type_${batch.batch_type}`)})` : ''),
                  course: batch.course_id ?? 0,
                }))}
                exams={exams.map((exam) => ({
                  value: String(exam.id),
                  label:
                    examLabel(exam, t.lang) +
                    (exam.status !== 'published' ? ` — ${t.t('status.draft')}` : ''),
                }))}
                resultCodes={RESULT_CODES.map((code) => ({
                  value: code,
                  label: t.t(`result.${code}`),
                }))}
                methods={PAYMENT_METHODS.map((method) => ({
                  value: method,
                  label: t.t(`arep.method_${method}`),
                }))}
                labels={{
                  course: t.t('common.course'),
                  batch: t.t('common.batch'),
                  status: t.t('common.status'),
                  method: t.t('arep.col_method'),
                  month: t.t('common.month'),
                  from: t.t('common.from'),
                  to: t.t('common.to'),
                  exam: t.t('arep.exam_pick'),
                  result: t.t('result.result'),
                  search: t.t('common.search'),
                  anyCourse: t.t('arep.any_course'),
                  anyBatch: t.t('arep.any_batch'),
                  anyStatus: t.t('arep.any_status'),
                  anyMethod: t.t('arep.any_method'),
                  anyResult: t.t('arep.any_result'),
                  statusActive: t.t('status.active'),
                  statusInactive: t.t('status.inactive'),
                  statusPaid: t.t('status.paid'),
                  statusUnpaid: t.t('status.unpaid'),
                  statePending: t.t('status.pending'),
                  stateApproved: t.t('status.approved'),
                  stateRejected: t.t('status.rejected'),
                  methodBkash: t.t('arep.method_bkash'),
                  methodNagad: t.t('arep.method_nagad'),
                  methodNone: t.t('arep.method_none'),
                  searchStudent: t.t('arep.search_student'),
                  searchApplication: t.t('arep.search_application'),
                  searchPayment: t.t('arep.search_payment'),
                  monthHint: t.t('arep.month_hint'),
                  filter: t.t('common.filter'),
                  clear: t.t('common.clear'),
                  examOpen: t.t('arep.exam_open'),
                }}
              />
            </Card>

            {summary.stats.length > 0 && (
              <div
                className={`grid gap-4 sm:grid-cols-2 ${
                  summary.stats.length > 4 ? 'xl:grid-cols-6' : 'xl:grid-cols-4'
                }`}
              >
                {summary.stats.map((stat) => (
                  <div key={stat.label} className="rounded-orbit border border-line bg-surface p-4">
                    <span className="block break-words text-xl font-bold text-ink-heading">
                      {stat.value}
                    </span>
                    <span className="block text-sm text-ink-muted">{stat.label}</span>
                  </div>
                ))}
              </div>
            )}

            <Card>
              <CardHeader
                title={t.t(`arep.type_${report}`)}
                icon={REPORT_TYPES[report].icon}
                actions={
                  pager.total > 0 ? (
                    <span className="text-xs text-ink-muted">
                      {t.t('arep.showing', {
                        from: t.digits(pager.from),
                        to: t.digits(pager.to),
                        total: t.digits(pager.total),
                      })}
                    </span>
                  ) : undefined
                }
              />

              {report === 'results' && exams.length === 0 ? (
                <EmptyState
                  icon="bi-clipboard-data"
                  title={t.t('arep.exam_none')}
                  body={t.t('arep.type_results_sub')}
                />
              ) : rows.length === 0 ? (
                <EmptyState
                  icon="bi-inbox"
                  title={t.t('arep.no_rows')}
                  body={t.t(`arep.type_${report}_sub`)}
                />
              ) : (
                <>
                  <TableWrap>
                    <Table>
                      <Thead>
                        <Tr>
                          {columns.map((column) => (
                            <Th
                              key={column.key}
                              alignment={isNumericType(column.type) ? 'end' : undefined}
                            >
                              {column.label}
                            </Th>
                          ))}
                        </Tr>
                      </Thead>
                      <Tbody>
                        {rows.map((row, index) => (
                          <Tr key={`${row._sid ?? 'row'}-${index}`}>
                            {columns.map((column) => {
                              const value = row[column.key] ?? null;
                              const text = cellText(column, value, t.lang);
                              const empty = value === null || value === '';

                              let cell = empty ? (
                                <span className="text-ink-muted">—</span>
                              ) : column.type === 'status' ? (
                                <Badge tone={column.tones?.[String(value)] ?? 'neutral'}>
                                  {text}
                                </Badge>
                              ) : (
                                <span
                                  className={
                                    isNumericType(column.type) ||
                                    column.type === 'date' ||
                                    column.type === 'code'
                                      ? 'whitespace-nowrap'
                                      : undefined
                                  }
                                >
                                  {text}
                                </span>
                              );

                              if (column.link && !empty && (row._sid ?? 0) > 0) {
                                cell = (
                                  <Link
                                    href={`/admin/students/${row._sid}`}
                                    className="font-semibold text-ink hover:text-primary"
                                  >
                                    {cell}
                                  </Link>
                                );
                              }

                              return (
                                <Td
                                  key={column.key}
                                  alignment={isNumericType(column.type) ? 'end' : undefined}
                                >
                                  {cell}
                                </Td>
                              );
                            })}
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </TableWrap>

                  {pager.totalPages > 1 && (
                    <CardBody>
                      <Pagination
                        page={pager.page}
                        totalPages={pager.totalPages}
                        hrefFor={pageUrl}
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
