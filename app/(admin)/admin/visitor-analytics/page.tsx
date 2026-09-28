import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert, Badge } from '@/components/ui/Feedback';
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { ChartLegend, LineChart } from '@/components/analytics/LineChart';
import { getLang, translate } from '@/lib/i18n';
import { pageLabel } from '@/lib/analytics/labels';
import {
  addDays,
  addMonths,
  breakdown,
  courseTitles,
  daily,
  finalizeMonths,
  firstDate,
  hourly,
  monthEnd,
  monthStart,
  months,
  online,
  stats,
  todayIso,
  topPages,
  totals,
  type DayRow,
} from '@/lib/analytics/read';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'va.title'),
    robots: { index: false, follow: false },
  };
}

const RANGES = ['today', 'yesterday', '7d', '30d', 'this_month', 'prev_month', 'custom'] as const;
type Range = (typeof RANGES)[number];

const COLOURS = { visits: '#15803d', unique: '#f59e0b' };

/** A strict `Y-m-d`, or null. */
function validDate(value: string | undefined): string | null {
  const text = (value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || text < '2000-01-01') return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : null;
}

/**
 * Visitor analytics, from admin/visitor_analytics.php.
 *
 * Read-only: the one write is the monthly snapshot, which only ever inserts a
 * figure for a month that has finished. Shared hosting has no cron, so it
 * happens when an admin opens the page.
 *
 * No IP address and nothing personal is stored — the note on the page says so,
 * and `visitor_logs` holds only hashed cookie ids.
 */
export default async function AdminVisitorAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  return (
    <AdminPage active="visitor_analytics" route="/admin/visitor-analytics" title="">
      {async ({ t }) => {
        const today = todayIso();
        const first = await firstDate();

        if (first === null) {
          return (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-ink-heading">{t.t('va.title')}</h1>
                <p className="mt-1 text-sm text-ink-muted">{t.t('va.sub')}</p>
              </div>
              <Card>
                <CardBody className="text-sm text-ink-muted">{t.t('va.card_total_none')}</CardBody>
              </Card>
              <Card>
                <CardBody className="text-xs text-ink-muted">{t.t('va.definitions')}</CardBody>
              </Card>
            </div>
          );
        }

        // Completed months are snapshotted here, because there is no cron.
        await finalizeMonths();

        const range: Range = RANGES.includes(params.range as Range)
          ? (params.range as Range)
          : '30d';

        let from = addDays(today, -29);
        let to = today;
        let clamped = false;
        let invalid = false;

        if (range === 'today') {
          from = today;
        } else if (range === 'yesterday') {
          from = addDays(today, -1);
          to = from;
        } else if (range === '7d') {
          from = addDays(today, -6);
        } else if (range === 'this_month') {
          from = monthStart(today);
        } else if (range === 'prev_month') {
          const previous = addMonths(monthStart(today), -1);
          from = previous;
          to = monthEnd(previous);
        } else if (range === 'custom') {
          const start = validDate(params.from);
          const end = validDate(params.to);
          if (start === null || end === null) {
            invalid = true;
          } else {
            from = start <= end ? start : end;
            to = start <= end ? end : start;
            // Two years at most: a wider range is a report nobody can read and a
            // query nobody should run.
            const limit = addDays(to, -730);
            if (from < limit) {
              from = limit;
              clamped = true;
            }
            if (to > today) to = today;
          }
        }

        const singleDay = from === to;

        const [figures, series, pages, devices, browsers, allTotals, liveOnline] = await Promise.all([
          stats(from, to),
          singleDay ? hourly(from) : daily(from, to),
          topPages(from, to, 10),
          breakdown('device_type', from, to),
          breakdown('browser', from, to),
          totals(),
          online(),
        ]);

        const [todayStats, monthStats, trend] = await Promise.all([
          stats(today, today),
          stats(monthStart(today), today),
          months(addMonths(monthStart(today), -11), monthStart(today)),
        ]);

        const titles = await courseTitles(pages.map((page) => page.page_url));
        const label = (path: string) => pageLabel(path, t.lang, titles);

        const chartSeries = [
          {
            name: t.t('va.series_visits'),
            values: series.map((row: DayRow) => row.visits),
            colour: COLOURS.visits,
          },
          {
            name: t.t('va.series_unique'),
            values: series.map((row: DayRow) => row.unique_visitors),
            colour: COLOURS.unique,
          },
        ];

        const trendOldestFirst = [...trend].reverse();
        const trendSeries = [
          {
            name: t.t('va.series_visits'),
            values: trendOldestFirst.map((row) => row.visits),
            colour: COLOURS.visits,
          },
          {
            name: t.t('va.series_unique'),
            values: trendOldestFirst.map((row) => row.unique_visitors),
            colour: COLOURS.unique,
          },
        ];

        const periodLabel =
          range === 'custom' || singleDay
            ? t.t('va.period_between', {
                from: t.date(from, 'd M Y'),
                to: t.date(to, 'd M Y'),
              })
            : t.t(`va.range.${range}`);

        const perVisit =
          figures.visits > 0 ? (figures.page_views / figures.visits).toFixed(1) : '0';

        const exportQuery = new URLSearchParams({ range, from, to }).toString();

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-ink-heading">{t.t('va.title')}</h1>
                <p className="mt-1 text-sm text-ink-muted">{t.t('va.sub')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`/api/export/visitors?${exportQuery}`}
                  className="rounded-orbit bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700"
                >
                  <i className="bi bi-filetype-csv me-1" aria-hidden />
                  {t.t('va.export_period_csv')}
                </a>
                <a
                  href="/api/export/visitors?scope=months"
                  className="rounded-orbit border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-2"
                >
                  <i className="bi bi-filetype-csv me-1" aria-hidden />
                  {t.t('va.export_history')}
                </a>
              </div>
            </div>

            {invalid && <Alert tone="warning">{t.t('va.range_invalid')}</Alert>}
            {clamped && <Alert tone="info">{t.t('va.range_clamped')}</Alert>}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-orbit border border-line bg-surface p-4">
                <span className="block text-xl font-bold text-ink-heading">
                  {t.digits(allTotals.visitors)}
                </span>
                <span className="block text-sm text-ink-muted">{t.t('va.card_total')}</span>
                <span className="block text-xs text-ink-muted">
                  {t.t('va.card_total_sub', {
                    views: t.digits(allTotals.views),
                    date: t.date(first, 'd M Y'),
                  })}
                </span>
              </div>

              <div className="rounded-orbit border border-line bg-surface p-4">
                <span className="block text-xl font-bold text-ink-heading">
                  {t.digits(monthStats.visits)}
                </span>
                <span className="block text-sm text-ink-muted">{t.t('va.card_month')}</span>
                <span className="block text-xs text-ink-muted">
                  {t.t('va.card_month_sub', { count: t.digits(monthStats.unique_visitors) })}
                </span>
              </div>

              <div className="rounded-orbit border border-line bg-surface p-4">
                <span className="block text-xl font-bold text-ink-heading">
                  {t.digits(todayStats.visits)}
                </span>
                <span className="block text-sm text-ink-muted">{t.t('va.card_today')}</span>
                <span className="block text-xs text-ink-muted">
                  {t.t('va.card_today_sub', { count: t.digits(todayStats.new_visitors) })}
                </span>
              </div>

              <div className="rounded-orbit border border-line bg-surface p-4">
                <span className="block text-xl font-bold text-ink-heading">
                  {t.digits(todayStats.unique_visitors)}
                </span>
                <span className="block text-sm text-ink-muted">{t.t('va.card_unique')}</span>
                <span className="block text-xs text-ink-muted">{t.t('va.card_unique_sub')}</span>
              </div>

              <div className="rounded-orbit border border-line bg-surface p-4">
                <span className="block text-xl font-bold text-ink-heading">
                  {t.digits(todayStats.page_views)}
                </span>
                <span className="block text-sm text-ink-muted">{t.t('va.card_views')}</span>
                <span className="block text-xs text-ink-muted">
                  {t.t('va.card_views_sub', {
                    count:
                      todayStats.visits > 0
                        ? t.digits((todayStats.page_views / todayStats.visits).toFixed(1))
                        : t.digits(0),
                  })}
                </span>
              </div>

              <div className="rounded-orbit border border-line bg-surface p-4">
                <span className="block text-xl font-bold text-ink-heading">
                  {t.digits(liveOnline)}
                </span>
                <span className="block text-sm text-ink-muted">{t.t('va.card_online')}</span>
                <span className="block text-xs text-ink-muted">
                  {t.t('va.card_online_sub', { minutes: t.digits(5) })}
                </span>
              </div>
            </div>

            <Card>
              <CardHeader
                title={t.t('va.trend_title')}
                subtitle={t.t('va.trend_sub')}
                icon="bi-graph-up"
              />
              <CardBody>
                <ChartLegend series={trendSeries} />
                <LineChart
                  labels={trendOldestFirst.map((row) => t.monthLabel(row.month_start.slice(0, 7)))}
                  series={trendSeries}
                  ariaLabel={t.t('va.chart_aria', { title: t.t('va.trend_title') })}
                />
              </CardBody>

              <TableWrap>
                <Table>
                  <Thead>
                    <Tr>
                      <Th>{t.t('va.col_month')}</Th>
                      <Th alignment="end">{t.t('va.col_visits')}</Th>
                      <Th alignment="end">{t.t('va.col_unique')}</Th>
                      <Th alignment="end">{t.t('va.col_views')}</Th>
                      <Th>{t.t('va.col_status')}</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {trend.map((row) => (
                      <Tr key={row.month_start}>
                        <Td>{t.monthLabel(row.month_start.slice(0, 7))}</Td>
                        <Td alignment="end" numeric>
                          {t.digits(row.visits)}
                        </Td>
                        <Td alignment="end" numeric>
                          {t.digits(row.unique_visitors)}
                        </Td>
                        <Td alignment="end" numeric>
                          {t.digits(row.page_views)}
                        </Td>
                        <Td>
                          <Badge tone={row.is_live ? 'info' : 'neutral'}>
                            {t.t(row.is_live ? 'va.status_live' : 'va.status_final')}
                          </Badge>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </TableWrap>
            </Card>

            <Card>
              <form method="get" className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('va.filter_label')}</span>
                  <select
                    name="range"
                    defaultValue={range}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    {RANGES.map((value) => (
                      <option key={value} value={value}>
                        {t.t(`va.range.${value}`)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('va.from')}</span>
                  <input
                    type="date"
                    name="from"
                    defaultValue={range === 'custom' ? from : ''}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('va.to')}</span>
                  <input
                    type="date"
                    name="to"
                    defaultValue={range === 'custom' ? to : ''}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  />
                </label>

                <div className="flex items-end">
                  <button
                    type="submit"
                    className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                  >
                    {t.t('va.apply')}
                  </button>
                </div>
              </form>
            </Card>

            <Card>
              <CardHeader
                title={t.t('va.period_title', { period: periodLabel })}
                icon="bi-calendar-range"
              />

              <CardBody className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {[
                  [t.t('va.stat_visits'), t.digits(figures.visits)],
                  [t.t('va.stat_unique'), t.digits(figures.unique_visitors)],
                  [t.t('va.stat_views'), t.digits(figures.page_views)],
                  [t.t('va.stat_new'), t.digits(figures.new_visitors)],
                  [t.t('va.stat_ppv'), t.digits(perVisit)],
                  [
                    t.t('va.stat_avg'),
                    t.digits(
                      figures.active_days > 0
                        ? (figures.visits / figures.active_days).toFixed(1)
                        : 0
                    ),
                  ],
                ].map(([title, value]) => (
                  <div key={title} className="rounded-orbit border border-line-soft p-3">
                    <span className="block text-lg font-bold text-ink-heading">{value}</span>
                    <span className="block text-xs text-ink-muted">{title}</span>
                  </div>
                ))}
              </CardBody>

              {figures.page_views === 0 ? (
                <CardBody className="text-sm text-ink-muted">{t.t('va.no_data')}</CardBody>
              ) : (
                <>
                  <CardBody>
                    <p className="mb-2 text-sm font-semibold text-ink-heading">
                      {t.t(singleDay ? 'va.hourly_title' : 'va.daily_title')}
                    </p>
                    <ChartLegend series={chartSeries} />
                    <LineChart
                      labels={series.map((row: DayRow) =>
                        singleDay ? t.digits(row.date) : t.date(row.date, 'd M')
                      )}
                      series={chartSeries}
                      ariaLabel={t.t('va.chart_aria', {
                        title: t.t(singleDay ? 'va.hourly_title' : 'va.daily_title'),
                      })}
                    />
                  </CardBody>

                  <TableWrap>
                    <Table>
                      <Thead>
                        <Tr>
                          <Th>{t.t(singleDay ? 'va.col_hour' : 'va.col_date')}</Th>
                          <Th alignment="end">{t.t('va.col_visits')}</Th>
                          <Th alignment="end">{t.t('va.col_unique')}</Th>
                          <Th alignment="end">{t.t('va.col_views')}</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {series.map((row: DayRow) => (
                          <Tr key={row.date}>
                            <Td>
                              {singleDay
                                ? t.t('va.hour_range', {
                                    from: `${row.date}:00`,
                                    to: `${row.date}:59`,
                                  })
                                : t.date(row.date, 'd M Y')}
                            </Td>
                            <Td alignment="end" numeric>
                              {t.digits(row.visits)}
                            </Td>
                            <Td alignment="end" numeric>
                              {t.digits(row.unique_visitors)}
                            </Td>
                            <Td alignment="end" numeric>
                              {t.digits(row.page_views)}
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </TableWrap>
                </>
              )}
            </Card>

            <div className="grid gap-6 xl:grid-cols-3">
              <div className="xl:col-span-2">
                <Card>
                  <CardHeader
                    title={t.t('va.top_pages')}
                    subtitle={t.t('va.top_pages_sub')}
                    icon="bi-file-earmark-text"
                  />
                  {pages.length === 0 ? (
                    <CardBody className="text-sm text-ink-muted">{t.t('va.no_data')}</CardBody>
                  ) : (
                    <TableWrap>
                      <Table>
                        <Thead>
                          <Tr>
                            <Th>{t.t('va.col_page')}</Th>
                            <Th>{t.t('va.col_path')}</Th>
                            <Th alignment="end">{t.t('va.col_views')}</Th>
                            <Th alignment="end">{t.t('va.col_unique')}</Th>
                          </Tr>
                        </Thead>
                        <Tbody>
                          {pages.map((page) => (
                            <Tr key={page.page_url}>
                              <Td>{label(page.page_url)}</Td>
                              <Td className="font-mono text-xs text-ink-muted">{page.page_url}</Td>
                              <Td alignment="end" numeric>
                                {t.digits(page.views)}
                              </Td>
                              <Td alignment="end" numeric>
                                {t.digits(page.visitors)}
                              </Td>
                            </Tr>
                          ))}
                        </Tbody>
                      </Table>
                    </TableWrap>
                  )}
                </Card>
              </div>

              <div className="space-y-6 xl:col-span-1">
                {[
                  { title: t.t('va.devices'), rows: devices, device: true },
                  { title: t.t('va.browsers'), rows: browsers, device: false },
                ].map((block) => {
                  const total = block.rows.reduce((sum, row) => sum + row.visits, 0);
                  return (
                    <Card key={block.title}>
                      <CardHeader title={block.title} icon="bi-pie-chart" />
                      {block.rows.length === 0 ? (
                        <CardBody className="text-sm text-ink-muted">{t.t('va.no_data')}</CardBody>
                      ) : (
                        <ul className="divide-y divide-line-soft">
                          {block.rows.map((row) => (
                            <li
                              key={row.name}
                              className="flex items-center justify-between gap-3 px-5 py-2 text-sm"
                            >
                              <span className="text-ink">
                                {block.device ? t.t(`va.device.${row.name}`) : row.name}
                              </span>
                              <span className="text-ink-muted">
                                {t.t('va.share_count', {
                                  count: t.digits(row.visits),
                                  share: t.digits(
                                    total > 0 ? Math.round((row.visits / total) * 100) : 0
                                  ),
                                })}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Card>
                  );
                })}
              </div>
            </div>

            <Card>
              <CardHeader
                title={t.t('va.history_title')}
                subtitle={t.t('va.history_sub')}
                icon="bi-calendar3"
              />
              <TableWrap>
                <Table>
                  <Thead>
                    <Tr>
                      <Th>{t.t('va.r_month')}</Th>
                      <Th alignment="end">{t.t('va.r_total')}</Th>
                      <Th alignment="end">{t.t('va.r_unique')}</Th>
                      <Th alignment="end">{t.t('va.r_views')}</Th>
                      <Th alignment="end">{t.t('va.r_avg')}</Th>
                      <Th>{t.t('va.r_peak')}</Th>
                      <Th>{t.t('va.r_top')}</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {trend.map((row) => (
                      <Tr key={`history-${row.month_start}`}>
                        <Td>
                          {t.monthLabel(row.month_start.slice(0, 7))}
                          {row.is_live && (
                            <span className="ms-1 text-xs text-ink-muted">
                              {t.t('va.in_progress')}
                            </span>
                          )}
                        </Td>
                        <Td alignment="end" numeric>
                          {t.digits(row.visits)}
                        </Td>
                        <Td alignment="end" numeric>
                          {t.digits(row.unique_visitors)}
                        </Td>
                        <Td alignment="end" numeric>
                          {t.digits(row.page_views)}
                        </Td>
                        <Td alignment="end" numeric>
                          {t.number(row.avg_daily_visits, 2)}
                        </Td>
                        <Td className="text-xs">
                          {row.peak_date
                            ? t.t('va.peak_value', {
                                date: t.date(row.peak_date, 'd M Y'),
                                count: t.digits(row.peak_visits),
                              })
                            : t.t('va.none')}
                        </Td>
                        <Td className="text-xs">
                          {row.top_page !== null
                            ? t.t('va.top_value', {
                                page: label(row.top_page),
                                count: t.digits(row.top_page_views),
                              })
                            : t.t('va.none')}
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </TableWrap>
            </Card>

            <Card>
              <CardBody className="space-y-2 text-xs text-ink-muted">
                <p>{t.t('va.definitions')}</p>
                <p>
                  <Link href="/admin/coaching-analytics" className="text-primary hover:underline">
                    {t.t('can.title')}
                  </Link>
                </p>
              </CardBody>
            </Card>
          </div>
        );
      }}
    </AdminPage>
  );
}
