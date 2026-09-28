import { NextResponse, type NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { guardOr403 } from '@/lib/security/api';
import { getLang, translate } from '@/lib/i18n';
import { toLocalDigits } from '@/lib/i18n/format';
import { csvHeaders, makeCsv } from '@/lib/export/xlsx';
import { csvSafe } from '@/lib/reports/core';
import { pageLabel } from '@/lib/analytics/labels';
import {
  addMonths,
  breakdown,
  courseTitles,
  daily,
  firstDate,
  hourly,
  monthStart,
  months,
  stats,
  todayIso,
  topPages,
} from '@/lib/analytics/read';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Visitor analytics as CSV, from the `?csv=` branches of
 * admin/visitor_analytics.php.
 *
 * Two shapes: the period on screen (figures, the daily or hourly breakdown, top
 * pages, devices and browsers in one file, as the original writes it), or the
 * whole month-by-month history.
 */
export async function GET(request: NextRequest) {
  // Super admins only: admin/visitor_analytics.php is not on orbit_branch_admin_allowed_scripts(),
  // and this export is not narrowed by branch.
  const gate = await guardOr403(requireSuperAdmin);
  if (!gate.ok) return gate.response;
  const lang = await getLang();
  const t = (key: string, vars?: Record<string, string>) => translate(lang, key, vars);

  const params = request.nextUrl.searchParams;
  const stamp = todayIso().replace(/-/g, '');

  /* ------------------------------------------------- the whole history */
  if (params.get('scope') === 'months') {
    const first = await firstDate();
    const rows =
      first === null ? [] : await months(monthStart(first), monthStart(todayIso()));

    const titles = await courseTitles(
      rows.map((row) => row.top_page ?? '').filter((path) => path !== '')
    );

    const lines: (string | number)[][] = [
      [
        t('va.r_month'),
        t('va.r_total'),
        t('va.r_unique'),
        t('va.r_views'),
        t('va.stat_new'),
        t('va.r_avg'),
        t('va.r_peak'),
        t('va.r_peak_visits'),
        t('va.r_top'),
        t('va.r_top_views'),
        t('va.col_status'),
      ].map(csvSafe),
      ...rows.map((row) => [
        row.month_start.slice(0, 7),
        row.visits,
        row.unique_visitors,
        row.page_views,
        row.new_visitors,
        row.avg_daily_visits,
        row.peak_date ?? '',
        row.peak_visits,
        csvSafe(row.top_page !== null ? pageLabel(row.top_page, lang, titles) : ''),
        row.top_page_views,
        t(row.is_live ? 'va.status_live' : 'va.status_final'),
      ]),
    ];

    const bytes = makeCsv(lines);
    return new NextResponse(new Uint8Array(bytes), {
      headers: csvHeaders(`orbit_visitors_months_${stamp}.csv`, bytes.length),
    });
  }

  /* ----------------------------------------------------- one period */
  const valid = (value: string | null) =>
    value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;

  const today = todayIso();
  const from = valid(params.get('from')) ?? addMonths(today, -1);
  const to = valid(params.get('to')) ?? today;
  const singleDay = from === to;

  const [figures, series, pages, devices, browsers] = await Promise.all([
    stats(from, to),
    singleDay ? hourly(from) : daily(from, to),
    topPages(from, to, 50),
    breakdown('device_type', from, to),
    breakdown('browser', from, to),
  ]);

  const titles = await courseTitles(pages.map((page) => page.page_url));

  const lines: (string | number)[][] = [
    [csvSafe(t('va.csv_period')), `${from} – ${to}`],
    [],
    [csvSafe(t('va.stat_visits')), figures.visits],
    [csvSafe(t('va.stat_unique')), figures.unique_visitors],
    [csvSafe(t('va.stat_views')), figures.page_views],
    [csvSafe(t('va.stat_new')), figures.new_visitors],
    [csvSafe(t('va.col_date')), figures.active_days],
    [],
    [csvSafe(t(singleDay ? 'va.csv_hourly' : 'va.csv_daily'))],
    [
      csvSafe(t(singleDay ? 'va.col_hour' : 'va.col_date')),
      csvSafe(t('va.col_visits')),
      csvSafe(t('va.col_unique')),
      csvSafe(t('va.col_views')),
    ],
    ...series.map((row) => [row.date, row.visits, row.unique_visitors, row.page_views]),
    [],
    [csvSafe(t('va.top_pages'))],
    [
      csvSafe(t('va.col_page')),
      csvSafe(t('va.col_path')),
      csvSafe(t('va.col_views')),
      csvSafe(t('va.col_unique')),
    ],
    ...pages.map((page) => [
      csvSafe(pageLabel(page.page_url, lang, titles)),
      csvSafe(page.page_url),
      page.views,
      page.visitors,
    ]),
    [],
    [csvSafe(t('va.devices'))],
    ...devices.map((row) => [csvSafe(t(`va.device.${row.name}`)), row.visits]),
    [],
    [csvSafe(t('va.browsers'))],
    ...browsers.map((row) => [csvSafe(row.name), row.visits]),
  ];

  // The file is read in a spreadsheet, so the figures stay plain numbers; only
  // the period line carries localised digits.
  lines[0][1] = `${toLocalDigits(from, lang)} – ${toLocalDigits(to, lang)}`;

  const bytes = makeCsv(lines);
  return new NextResponse(new Uint8Array(bytes), {
    headers: csvHeaders(`orbit_visitors_${from}_${to}.csv`, bytes.length),
  });
}
