import { NextResponse, type NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { guardOr403 } from '@/lib/security/api';
import { getLang, translate } from '@/lib/i18n';
import { monthLabel } from '@/lib/i18n/format';
import { csvHeaders, makeCsv } from '@/lib/export/xlsx';
import { csvSafe } from '@/lib/reports/core';
import { FEE_TYPES, canData, canFilters, resolveStudent } from '@/lib/analytics/coaching';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Coaching analytics as CSV, from the `output=csv` branch of
 * admin/coaching_analytics.php.
 *
 * One file with every block the page shows, in the same order, so the numbers
 * can be checked against the screen line by line.
 */
export async function GET(request: NextRequest) {
  // A branch admin gets a 403, not the 500 an uncaught ForbiddenError becomes.
  const gate = await guardOr403(requireSuperAdmin);
  if (!gate.ok) return gate.response;
  const lang = await getLang();
  const t = (key: string, vars?: Record<string, string>) => translate(lang, key, vars);

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const filters = await resolveStudent(canFilters(params));
  const data = await canData(filters);

  const lines: (string | number)[][] = [
    [csvSafe(t('can.report_title'))],
    [csvSafe(t('can.period')), `${filters.from} – ${filters.to}`],
    [],
    [csvSafe(t('can.total_revenue')), data.revenue.total.revenue],
    [csvSafe(t('can.this_month_revenue')), data.recent.thisMonth],
    [csvSafe(t('can.last_month_revenue')), data.recent.lastMonth],
    [csvSafe(t('can.total_due')), data.outstanding.due],
    [csvSafe(t('can.paying_students')), data.revenue.total.students],
    [csvSafe(t('can.active_students')), data.growth.active],
    [],
    [csvSafe(t('can.revenue_title'))],
    [
      csvSafe(t('can.period')),
      csvSafe(t('can.revenue')),
      csvSafe(t('can.records')),
      csvSafe(t('can.paying_students')),
      csvSafe(t('can.new_students')),
      csvSafe(t('can.avg_performance')),
      csvSafe(t('can.attendance_title')),
    ],
    ...filters.months.map((month) => [
      monthLabel(month, lang),
      data.revenue.months[month]?.revenue ?? 0,
      data.revenue.months[month]?.payments ?? 0,
      data.revenue.months[month]?.students ?? 0,
      data.growth.months[month] ?? 0,
      data.performance.months[month]?.pct ?? '',
      data.attendance.months[month]?.pct ?? '',
    ]),
    [],
    [csvSafe(t('can.breakdown_title'))],
    [csvSafe(t('can.type')), csvSafe(t('can.revenue')), csvSafe(t('can.records'))],
    ...FEE_TYPES.map((type) => [
      csvSafe(t(`can.type_${type}`)),
      data.breakdown[type].revenue,
      data.breakdown[type].payments,
    ]),
  ];

  const bytes = makeCsv(lines);
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  return new NextResponse(new Uint8Array(bytes), {
    headers: csvHeaders(`orbit_coaching_analytics_${stamp}.csv`, bytes.length),
  });
}
