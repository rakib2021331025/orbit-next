import type { Metadata } from 'next';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { ChartLegend, LineChart } from '@/components/analytics/LineChart';
import { getLang, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import {
  FEE_TYPES,
  RANGES,
  canData,
  canFilters,
  canQuery,
  resolveStudent,
} from '@/lib/analytics/coaching';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'can.title'),
    robots: { index: false, follow: false },
  };
}

const COLOURS = { revenue: '#15803d', students: '#f59e0b', marks: '#2563eb' };

/**
 * Coaching analytics, from admin/coaching_analytics.php.
 *
 * Read-only, and every figure is computed from records that already exist. Two
 * distinctions the page keeps explicit, because mixing them up is how a number
 * gets misread:
 *
 *   - **Revenue** is money received inside the period; **total due** is
 *     everything owed right now, whatever the period.
 *   - The fee-type filter applies to the money figures only, never to the
 *     student, performance or attendance ones.
 */
export default async function AdminCoachingAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  return (
    <AdminPage active="coaching_analytics" route="/admin/coaching-analytics" level="super" title="">
      {async ({ t }) => {
        const filters = await resolveStudent(canFilters(params));
        const data = await canData(filters);

        const [courses, batches] = await Promise.all([
          prisma.course
            .findMany({
              orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
              select: { id: true, name: true, name_bn: true },
            })
            .catch(() => []),
          prisma.batch
            .findMany({
              orderBy: [{ course_id: 'asc' }, { sort_order: 'asc' }, { name: 'asc' }],
              select: { id: true, name: true, name_bn: true, course_id: true },
            })
            .catch(() => []),
        ]);

        const months = filters.months;
        const monthLabels = months.map((month) => t.monthLabel(month));

        const revenueSeries = [
          {
            name: t.t('can.revenue'),
            values: months.map((month) => data.revenue.months[month]?.revenue ?? 0),
            colour: COLOURS.revenue,
          },
        ];
        const growthSeries = [
          {
            name: t.t('can.new_students'),
            values: months.map((month) => data.growth.months[month] ?? 0),
            colour: COLOURS.students,
          },
        ];
        const performanceSeries = [
          {
            name: t.t('can.avg_performance'),
            values: months.map((month) => data.performance.months[month]?.pct ?? 0),
            colour: COLOURS.marks,
          },
        ];
        const attendanceSeries = [
          {
            name: t.t('can.attendance_title'),
            values: months.map((month) => data.attendance.months[month]?.pct ?? 0),
            colour: COLOURS.revenue,
          },
        ];

        const inferred = FEE_TYPES.reduce(
          (sum, type) => sum + data.breakdown[type].inferred,
          0
        );

        const exportQuery = canQuery(filters);

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-ink-heading">{t.t('can.title')}</h1>
                <p className="mt-1 text-sm text-ink-muted">{t.t('can.sub')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`/api/export/coaching?${exportQuery}`}
                  className="rounded-orbit bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700"
                >
                  <i className="bi bi-filetype-csv me-1" aria-hidden /> CSV
                </a>
              </div>
            </div>

            <Card>
              <form
                method="get"
                role="search"
                aria-label={t.t('can.filters')}
                className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-6"
              >
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('can.period')}</span>
                  <select
                    name="range"
                    defaultValue={filters.range}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    {RANGES.map((value) => (
                      <option key={value} value={value}>
                        {t.t(`can.range_${value}`)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('can.from')}</span>
                  <input
                    type="date"
                    name="from"
                    defaultValue={filters.range === 'custom' ? filters.from : ''}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('can.to')}</span>
                  <input
                    type="date"
                    name="to"
                    defaultValue={filters.range === 'custom' ? filters.to : ''}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('can.course')}</span>
                  <select
                    name="course"
                    defaultValue={String(filters.courseId || '')}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="">{t.t('can.all')}</option>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {t.pick(course, 'name')}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('can.batch')}</span>
                  <select
                    name="batch"
                    defaultValue={String(filters.batchId || '')}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="">{t.t('can.all')}</option>
                    {batches.map((batch) => (
                      <option key={batch.id} value={batch.id}>
                        {t.pick(batch, 'name')}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('can.type')}</span>
                  <select
                    name="type"
                    defaultValue={filters.type}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="">{t.t('can.all')}</option>
                    {FEE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {t.t(`can.type_${type}`)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-sm lg:col-span-2">
                  <span className="text-ink-muted">{t.t('can.student')}</span>
                  <input
                    name="student"
                    maxLength={30}
                    defaultValue={filters.student}
                    placeholder={t.t('can.student_ph')}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  />
                </label>

                <div className="flex items-end lg:col-span-4">
                  <button
                    type="submit"
                    className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                  >
                    {t.t('can.apply')}
                  </button>
                </div>

                <p className="text-[11px] text-ink-muted sm:col-span-2 lg:col-span-6">
                  {t.t('can.filters_note')}
                </p>
              </form>
            </Card>

            {!filters.studentFound && (
              <Alert tone="warning">
                {t.t('can.student_not_found', { id: filters.student })}
              </Alert>
            )}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                [t.t('can.total_revenue'), t.money(data.revenue.total.revenue)],
                [t.t('can.this_month_revenue'), t.money(data.recent.thisMonth)],
                [t.t('can.last_month_revenue'), t.money(data.recent.lastMonth)],
                [
                  t.t('can.total_due'),
                  t.money(data.outstanding.due),
                  t.t('can.due_students', { count: t.digits(data.outstanding.students) }),
                ],
                [t.t('can.paying_students'), t.digits(data.revenue.total.students)],
                [t.t('can.active_students'), t.digits(data.growth.active)],
                [
                  t.t('can.new_this_month'),
                  t.digits(data.growth.newThis),
                  t.t('can.in_period_count', { count: t.digits(data.growth.period) }),
                ],
                [t.t('can.new_last_month'), t.digits(data.growth.newLast)],
              ].map(([title, value, note]) => (
                <div key={title} className="rounded-orbit border border-line bg-surface p-4">
                  <span className="block text-xl font-bold text-ink-heading">{value}</span>
                  <span className="block text-sm text-ink-muted">{title}</span>
                  {note !== undefined && (
                    <span className="block text-xs text-ink-muted">{note}</span>
                  )}
                </div>
              ))}
            </div>

            <Card>
              <CardHeader title={t.t('can.revenue_title')} icon="bi-cash-stack" />
              <CardBody>
                <ChartLegend series={revenueSeries} />
                <LineChart
                  labels={monthLabels}
                  series={revenueSeries}
                  ariaLabel={t.t('can.revenue_title')}
                />
              </CardBody>

              <TableWrap>
                <Table>
                  <Thead>
                    <Tr>
                      <Th>{t.t('can.period')}</Th>
                      <Th alignment="end">{t.t('can.revenue')}</Th>
                      <Th alignment="end">{t.t('can.records')}</Th>
                      <Th alignment="end">{t.t('can.paying_students')}</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {months.map((month) => {
                      const row = data.revenue.months[month];
                      return (
                        <Tr key={month}>
                          <Td>{t.monthLabel(month)}</Td>
                          <Td alignment="end" numeric>
                            {t.money(row?.revenue ?? 0)}
                          </Td>
                          <Td alignment="end" numeric>
                            {t.digits(row?.payments ?? 0)}
                          </Td>
                          <Td alignment="end" numeric>
                            {t.digits(row?.students ?? 0)}
                          </Td>
                        </Tr>
                      );
                    })}
                  </Tbody>
                </Table>
              </TableWrap>
            </Card>

            <Card>
              <CardHeader title={t.t('can.breakdown_title')} icon="bi-pie-chart" />
              <TableWrap>
                <Table>
                  <Thead>
                    <Tr>
                      <Th>{t.t('can.type')}</Th>
                      <Th alignment="end">{t.t('can.revenue')}</Th>
                      <Th alignment="end">{t.t('can.records')}</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {FEE_TYPES.map((type) => (
                      <Tr key={type}>
                        <Td>{t.t(`can.type_${type}`)}</Td>
                        <Td alignment="end" numeric>
                          {t.money(data.breakdown[type].revenue)}
                        </Td>
                        <Td alignment="end" numeric>
                          {t.digits(data.breakdown[type].payments)}
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </TableWrap>
              {inferred > 0 && (
                <CardBody className="text-xs text-ink-muted">
                  {t.t('can.inferred_note', { count: t.digits(inferred) })}
                </CardBody>
              )}
            </Card>

            <Card>
              <CardHeader title={t.t('can.growth_title')} icon="bi-people" />
              <CardBody>
                <ChartLegend series={growthSeries} />
                <LineChart
                  labels={monthLabels}
                  series={growthSeries}
                  ariaLabel={t.t('can.growth_title')}
                />
              </CardBody>
              <TableWrap>
                <Table>
                  <Thead>
                    <Tr>
                      <Th>{t.t('can.period')}</Th>
                      <Th alignment="end">{t.t('can.new_students')}</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {months.map((month) => (
                      <Tr key={`growth-${month}`}>
                        <Td>{t.monthLabel(month)}</Td>
                        <Td alignment="end" numeric>
                          {t.digits(data.growth.months[month] ?? 0)}
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </TableWrap>
            </Card>

            <Card>
              <CardHeader
                title={t.t('can.performance_title')}
                subtitle={
                  data.performance.overall !== null
                    ? t.t('can.overall', { value: `${t.number(data.performance.overall, 2)}%` })
                    : undefined
                }
                icon="bi-graph-up-arrow"
              />
              <CardBody>
                <ChartLegend series={performanceSeries} />
                <LineChart
                  labels={monthLabels}
                  series={performanceSeries}
                  ariaLabel={t.t('can.performance_title')}
                />
              </CardBody>
              <TableWrap>
                <Table>
                  <Thead>
                    <Tr>
                      <Th>{t.t('can.period')}</Th>
                      <Th alignment="end">{t.t('can.avg_performance')}</Th>
                      <Th alignment="end">{t.t('can.students_assessed')}</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {months.map((month) => {
                      const row = data.performance.months[month];
                      return (
                        <Tr key={`perf-${month}`}>
                          <Td>{t.monthLabel(month)}</Td>
                          <Td alignment="end" numeric>
                            {row?.pct !== null && row?.pct !== undefined
                              ? `${t.number(row.pct, 2)}%`
                              : '—'}
                          </Td>
                          <Td alignment="end" numeric>
                            {t.digits(row?.students ?? 0)}
                          </Td>
                        </Tr>
                      );
                    })}
                  </Tbody>
                </Table>
              </TableWrap>
              <CardBody className="text-xs text-ink-muted">
                {t.t('can.performance_note')}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title={t.t('can.attendance_title')}
                subtitle={
                  data.attendance.overall !== null
                    ? t.t('can.overall', { value: `${t.number(data.attendance.overall, 2)}%` })
                    : undefined
                }
                icon="bi-calendar-check"
              />
              <CardBody>
                <ChartLegend series={attendanceSeries} />
                <LineChart
                  labels={monthLabels}
                  series={attendanceSeries}
                  ariaLabel={t.t('can.attendance_title')}
                />
              </CardBody>
              <TableWrap>
                <Table>
                  <Thead>
                    <Tr>
                      <Th>{t.t('can.period')}</Th>
                      <Th alignment="end">{t.t('attendance.present')}</Th>
                      <Th alignment="end">{t.t('attendance.absent')}</Th>
                      <Th alignment="end">{t.t('attendance.late')}</Th>
                      <Th alignment="end">{t.t('attendance.half_day')}</Th>
                      <Th alignment="end">%</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {months.map((month) => {
                      const row = data.attendance.months[month];
                      return (
                        <Tr key={`att-${month}`}>
                          <Td>{t.monthLabel(month)}</Td>
                          <Td alignment="end" numeric>
                            {t.digits(row?.present ?? 0)}
                          </Td>
                          <Td alignment="end" numeric>
                            {t.digits(row?.absent ?? 0)}
                          </Td>
                          <Td alignment="end" numeric>
                            {t.digits(row?.late ?? 0)}
                          </Td>
                          <Td alignment="end" numeric>
                            {t.digits(row?.halfDay ?? 0)}
                          </Td>
                          <Td alignment="end" numeric>
                            {row?.pct !== null && row?.pct !== undefined
                              ? `${t.number(row.pct, 2)}%`
                              : '—'}
                          </Td>
                        </Tr>
                      );
                    })}
                  </Tbody>
                </Table>
              </TableWrap>
            </Card>
          </div>
        );
      }}
    </AdminPage>
  );
}
