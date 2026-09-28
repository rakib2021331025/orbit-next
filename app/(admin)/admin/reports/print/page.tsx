import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { getLang, translate } from '@/lib/i18n';
import { settingLocalized } from '@/lib/settings';
import { ReportSheet, REPORT_SHEET_CSS } from '@/components/reports/ReportSheet';
import { PrintButton } from './PrintButton';
import {
  REPORT_LIMIT,
  isReportType,
  reportFilters,
  reportQuery,
} from '@/lib/reports/core';
import {
  reportColumns,
  reportExams,
  reportMeta,
  reportRows,
  reportSummary,
} from '@/lib/reports/data';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * The standalone print sheet, from orbit_report_print_document().
 *
 * No admin navigation, always light, and capped at 5,000 rows — a browser
 * asked to lay out more than that stops responding, and a print job nobody can
 * cancel is worse than a truncated one that says so.
 */
export default async function ReportPrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireSuperAdmin();

  const params = await searchParams;
  if (!isReportType(params.report) || params.report === 'attendance') notFound();

  const lang = await getLang();
  const report = params.report;
  const filters = reportFilters(report, params);

  if (report === 'results' && filters.exam === 0) {
    const exams = await reportExams();
    if (exams.length > 0) filters.exam = exams[0].id;
  }

  const institute = await settingLocalized('institute_name', 'Orbit Private Care', lang);
  const [summary, columns, meta] = await Promise.all([
    reportSummary(report, filters, lang),
    reportColumns(report, filters, lang),
    reportMeta(report, filters, lang, institute),
  ]);

  const cap = REPORT_LIMIT.print;
  const rows = await reportRows(report, filters, lang, cap, 0);
  const note =
    summary.count > cap
      ? translate(lang, 'arep.print_truncated', {
          shown: cap.toLocaleString('en-US'),
          total: summary.count.toLocaleString('en-US'),
        })
      : '';

  const backUrl = `/admin/reports?${reportQuery(report, filters)}`;

  return (
    <div className="rp-page" data-theme="light">
      <style>{`
        .rp-page { background: #e9eee9; min-height: 100vh; color: #1d2a22;
                   font-family: 'Inter', 'Hind Siliguri', 'Noto Sans Bengali', system-ui, sans-serif; font-size: 13px; }
        .rp-toolbar { position: sticky; top: 0; z-index: 5; display: flex; flex-wrap: wrap; gap: 8px;
                      align-items: center; justify-content: space-between; padding: 10px 16px;
                      background: #ffffff; border-bottom: 1px solid #d7e0d9; }
        .rp-btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: 8px;
                  border: 1px solid #b9c7bd; background: #ffffff; color: #0f5132; font: inherit;
                  font-weight: 600; text-decoration: none; cursor: pointer; }
        .rp-btn-primary { background: #15803d; border-color: #15803d; color: #ffffff; }
        .rp-btn:focus-visible { outline: 3px solid #fedc02; outline-offset: 2px; }
        .rp-sheet { max-width: 297mm; margin: 16px auto; padding: 12mm; background: #ffffff;
                    box-shadow: 0 4px 22px rgba(0, 0, 0, .10); }
        .rp-table-wrap { overflow-x: auto; }
        ${REPORT_SHEET_CSS}
        @media (max-width: 640px) {
          .rp-sheet { margin: 0; padding: 14px; box-shadow: none; }
          .rp-head-meta { white-space: normal; }
          .rp-stats, .rp-stats tbody, .rp-stats tr { display: block; margin: 0 0 8px; }
          .rp-stats td { display: inline-block; margin: 0 4px 4px 0; }
        }
        @page { size: A4 landscape; margin: 10mm; }
        @media print {
          .rp-page { background: #ffffff; font-size: 11px; }
          .rp-toolbar { display: none !important; }
          .rp-sheet { max-width: none; margin: 0; padding: 0; box-shadow: none; }
          .rp-table-wrap { overflow: visible; }
          .rp-table thead { display: table-header-group; }
          .rp-table tr { page-break-inside: avoid; break-inside: avoid; }
          .rp-table thead th, .rp-table tbody tr:nth-child(even) td, .rp-table tfoot td {
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
        }
      `}</style>

      <div className="rp-toolbar">
        <a className="rp-btn" href={backUrl}>
          ← {translate(lang, 'arep.back_to_report')}
        </a>
        <PrintButton label={translate(lang, 'arep.print_now')} />
      </div>

      <main className="rp-sheet" id="main">
        <ReportSheet
          columns={columns}
          rows={rows}
          summary={summary}
          meta={meta}
          lang={lang}
          note={note}
          emptyText={translate(lang, 'arep.no_rows')}
        />
      </main>
    </div>
  );
}
