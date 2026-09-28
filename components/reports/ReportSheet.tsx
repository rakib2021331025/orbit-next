import {
  cellText,
  footerText,
  isNumericType,
  type ReportColumn,
  type ReportRow,
  type ReportSummary,
} from '@/lib/reports/core';
import type { ReportMeta } from '@/lib/reports/data';
import type { Lang } from '@/lib/i18n';
import { toLocalDigits } from '@/lib/i18n/format';

/**
 * The printable sheet, from orbit_report_sheet_html().
 *
 * Deliberately plain: a header table, the filter line, the figures, the table
 * and its totals. It is the same markup the PDF phase will render, so it stays
 * to constructs that print the same way everywhere — no grid, no flex, nothing
 * that a print engine has to interpret.
 *
 * Always light. Paper is white in both themes.
 */
export function ReportSheet({
  columns,
  rows,
  summary,
  meta,
  lang,
  note = '',
  emptyText,
}: {
  columns: ReportColumn[];
  rows: ReportRow[];
  summary: ReportSummary;
  meta: ReportMeta;
  lang: Lang;
  note?: string;
  emptyText: string;
}) {
  return (
    <>
      <table className="rp-head">
        <tbody>
          <tr>
            <td className="rp-head-logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/brand/orbit-logo-320.png" alt="" className="rp-logo" />
            </td>
            <td>
              <div className="rp-inst">{meta.institute}</div>
              <div className="rp-title">{meta.title}</div>
            </td>
            <td className="rp-head-meta">{meta.generated}</td>
          </tr>
        </tbody>
      </table>

      <div className="rp-filters">{meta.filters.join(' · ')}</div>

      {summary.stats.length > 0 && (
        <table className="rp-stats">
          <tbody>
            <tr>
              {summary.stats.map((stat) => (
                <td key={stat.label}>
                  <div className="rp-stat-label">{stat.label}</div>
                  <div className="rp-stat-value">{stat.value}</div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      )}

      {note !== '' && <p className="rp-note">{note}</p>}

      {rows.length === 0 ? (
        <p className="rp-empty">{emptyText}</p>
      ) : (
        <div className="rp-table-wrap">
          <table className="rp-table">
            <thead>
              <tr>
                <th className="num">#</th>
                {columns.map((column) => (
                  <th key={column.key} className={isNumericType(column.type) ? 'num' : undefined}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row._sid ?? 'r'}-${index}`}>
                  <td className="num">{toLocalDigits(index + 1, lang)}</td>
                  {columns.map((column) => {
                    const text = cellText(column, row[column.key] ?? null, lang);
                    return (
                      <td
                        key={column.key}
                        className={isNumericType(column.type) ? 'num' : undefined}
                      >
                        {text === '' ? '—' : text}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            {summary.footer && (
              <tfoot>
                <tr>
                  <td />
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={isNumericType(column.type) ? 'num' : undefined}
                    >
                      {footerText(column, summary.footer![column.key] ?? null, lang)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </>
  );
}

/** The shared print styles, from orbit_report_sheet_css(). */
export const REPORT_SHEET_CSS = `
.rp-sheet, .rp-sheet table { font-family: 'Hind Siliguri', 'Inter', 'Noto Sans Bengali', system-ui, sans-serif; color: #1d2a22; }
.rp-head { width: 100%; border-collapse: collapse; border-bottom: 2px solid #062c19; margin-bottom: 6px; }
.rp-head td { vertical-align: middle; padding: 0 0 6px; }
.rp-head-logo { width: 1%; padding-right: 10px !important; }
.rp-logo { height: 46px; width: auto; display: block; }
.rp-inst { font-size: 17px; font-weight: 700; color: #062c19; }
.rp-title { font-size: 14px; font-weight: 700; color: #0f5132; }
.rp-head-meta { text-align: right; font-size: 11px; color: #5b6961; white-space: nowrap; }
.rp-filters { font-size: 11.5px; color: #3d4b43; margin: 0 0 8px; }
.rp-stats { border-collapse: separate; border-spacing: 6px 0; margin: 0 -6px 10px; }
.rp-stats td { border: 1px solid #d7e0d9; border-radius: 6px; padding: 4px 10px; vertical-align: top; }
.rp-stat-label { display: block; font-size: 10.5px; color: #5b6961; }
.rp-stat-value { display: block; font-size: 14px; font-weight: 700; color: #062c19; }
.rp-note { font-size: 11px; color: #9a3412; margin: 0 0 6px; }
.rp-empty { font-size: 13px; color: #5b6961; padding: 16px 0; }
.rp-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.rp-table th, .rp-table td { border: 1px solid #c9d4cc; padding: 3px 5px; text-align: left; vertical-align: top; }
.rp-table thead th { background: #0f5132; color: #ffffff; font-weight: 700; }
.rp-table tbody tr:nth-child(even) td { background: #f3f7f4; }
.rp-table tfoot td { background: #e6efe8; font-weight: 700; }
.rp-table .num { text-align: right; white-space: nowrap; }
`;
