import { NextResponse, type NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { guardOr403 } from '@/lib/security/api';
import { getLang, translate } from '@/lib/i18n';
import { settingLocalized } from '@/lib/settings';
import { XlsxBook, csvHeaders, makeCsv, xlsxHeaders, type XlsxValue } from '@/lib/export/xlsx';
import {
  REPORT_LIMIT,
  cellPlain,
  cellXlsx,
  csvSafe,
  isNumericType,
  isReportType,
  reportFilters,
  reportQuery,
  xlsxType,
} from '@/lib/reports/core';
import {
  reportColumns,
  reportExams,
  reportMeta,
  reportRows,
  reportSummary,
} from '@/lib/reports/data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A report as a file, from the download half of admin/reports.php.
 *
 * The export is capped at 50,000 rows and refuses past that instead of trying:
 * a request that runs out of memory halfway leaves the person with a truncated
 * file they have no way to spot. Refusing tells them to narrow the filters.
 *
 * Super admins only, like the hub itself.
 */
export async function GET(request: NextRequest) {
  // A branch admin gets a 403, not the 500 an uncaught ForbiddenError becomes.
  const gate = await guardOr403(requireSuperAdmin);
  if (!gate.ok) return gate.response;
  const lang = await getLang();

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  if (!isReportType(params.report) || params.report === 'attendance') {
    return NextResponse.json({ error: translate(lang, 'arep.no_rows') }, { status: 404 });
  }

  const report = params.report;
  const format = params.output === 'xlsx' ? 'xlsx' : 'csv';
  const filters = reportFilters(report, params);

  if (report === 'results' && filters.exam === 0) {
    const exams = await reportExams();
    if (exams.length > 0) filters.exam = exams[0].id;
  }

  const summary = await reportSummary(report, filters, lang);
  const back = `/admin/reports?${reportQuery(report, filters)}`;

  if (summary.count > REPORT_LIMIT.export) {
    // The message belongs on the page the person came from, not in a downloaded
    // file they would have to open to read it.
    const url = new URL(back, request.nextUrl.origin);
    url.searchParams.set(
      'error',
      translate(lang, 'arep.too_many', { count: summary.count.toLocaleString('en-US') })
    );
    return NextResponse.redirect(url, 303);
  }

  const institute = await settingLocalized('institute_name', 'Orbit Private Care', lang);
  const [columns, meta, rows] = await Promise.all([
    reportColumns(report, filters, lang),
    reportMeta(report, filters, lang, institute),
    reportRows(report, filters, lang),
  ]);

  if (format === 'csv') {
    const lines = [
      columns.map((column) => csvSafe(column.label)),
      ...rows.map((row) =>
        columns.map((column) => {
          const plain = cellPlain(column, row[column.key] ?? null, lang);
          // A number never needs the formula guard, and quoting it would make
          // the spreadsheet read it as text.
          return isNumericType(column.type) ? plain : csvSafe(plain);
        })
      ),
    ];
    const bytes = makeCsv(lines);
    return new NextResponse(new Uint8Array(bytes), {
      headers: csvHeaders(`${meta.filename}.csv`, bytes.length),
    });
  }

  const sheetColumns = columns.map((column) => ({
    header: column.label,
    width: column.width,
    type: xlsxType(column.type),
  }));
  const data: XlsxValue[][] = rows.map((row) =>
    columns.map((column) => cellXlsx(column, row[column.key] ?? null, lang))
  );

  // The totals row only makes sense under rows; on an empty sheet it reads as
  // data.
  const totals: XlsxValue[] | undefined =
    summary.footer && rows.length > 0
      ? columns.map((column) => {
          const value = summary.footer![column.key] ?? null;
          return typeof value === 'string' && !Number.isFinite(Number(value))
            ? value
            : cellXlsx(column, value, lang);
        })
      : undefined;

  const title = `${meta.institute} — ${meta.title}`;
  const bytes = new XlsxBook(title)
    .addSheet(meta.title, sheetColumns, data, {
      title,
      subtitle: `${meta.filters.join(' · ')} · ${meta.generated}`,
      totals,
    })
    .build();

  return new NextResponse(new Uint8Array(bytes), {
    headers: xlsxHeaders(`${meta.filename}.xlsx`, bytes.length),
  });
}
