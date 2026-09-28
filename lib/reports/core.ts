import type { Lang } from '@/lib/i18n';
import { translate } from '@/lib/i18n';
import { formatDate, formatMoney, formatNumber, toLocalDigits } from '@/lib/i18n/format';
import { formatMark } from '@/lib/results/grades';

/**
 * The reports hub's shared vocabulary, from includes/report_lib.php.
 *
 * A report is described **once** — its columns, its raw rows, its headline
 * figures and its totals row — and every medium renders that same description.
 * That is what keeps the screen, the CSV, the workbook and the print view
 * showing the same filtered data instead of four slightly different answers.
 *
 * Row values stay raw here — plain numbers, `Y-m-d` strings, status codes — and
 * are formatted per medium: money and dates in the reader's language on screen,
 * ISO dates and ungrouped numbers in CSV, real typed cells in Excel.
 */

export const REPORT_TYPES = {
  students: { icon: 'bi-people-fill', color: 'green' },
  enrollments: { icon: 'bi-person-check-fill', color: 'yellow' },
  payments: { icon: 'bi-cash-stack', color: 'green' },
  dues: { icon: 'bi-exclamation-diamond-fill', color: 'red' },
  results: { icon: 'bi-award-fill', color: 'yellow' },
  attendance: { icon: 'bi-calendar-check-fill', color: 'blue' },
} as const;

export type ReportType = keyof typeof REPORT_TYPES;

export function isReportType(value: unknown): value is ReportType {
  return typeof value === 'string' && value in REPORT_TYPES;
}

/** Row caps for a screen page, the print view, a PDF and a spreadsheet. */
export const REPORT_LIMIT = { page: 25, print: 5000, pdf: 1000, export: 50000 } as const;

export const PAYMENT_METHODS = ['cash', 'bkash', 'nagad', 'bank'] as const;
export const RESULT_CODES = ['pass', 'fail', 'incomplete', 'not_entered'] as const;

/* ---------------------------------------------------------------- input */

/** `Y-m-d` when the value is a real calendar date, otherwise ''. */
export function validDate(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const date = new Date(`${text}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : '';
}

/** `Y-m` when the value is a real month, otherwise ''. */
export function validMonth(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!/^\d{4}-\d{2}$/.test(text)) return '';
  return validDate(`${text}-01`) !== '' ? text : '';
}

export function validId(value: unknown): number {
  const text = value === undefined || value === null ? '' : String(value).trim();
  return /^\d{1,9}$/.test(text) ? Number(text) : 0;
}

export function validText(value: unknown, max = 100): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).trim().slice(0, max)
    : '';
}

export function pick<T extends string>(value: unknown, allowed: readonly T[]): T | '' {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : '';
}

export interface ReportFilters {
  course: number;
  batch: number;
  status: string;
  state: string;
  method: string;
  month: string;
  from: string;
  to: string;
  exam: number;
  result: string;
  q: string;
}

const NO_FILTERS: ReportFilters = {
  course: 0,
  batch: 0,
  status: '',
  state: '',
  method: '',
  month: '',
  from: '',
  to: '',
  exam: 0,
  result: '',
  q: '',
};

/** Swaps from/to when they were entered the wrong way round. */
function orderDates(filters: ReportFilters): ReportFilters {
  if (filters.from !== '' && filters.to !== '' && filters.from > filters.to) {
    return { ...filters, from: filters.to, to: filters.from };
  }
  return filters;
}

/** Which keys a report actually reads, so the rest are dropped from links. */
export const FILTER_KEYS: Record<ReportType, (keyof ReportFilters)[]> = {
  students: ['course', 'batch', 'status', 'q'],
  enrollments: ['state', 'method', 'course', 'from', 'to', 'q'],
  payments: ['month', 'from', 'to', 'status', 'method', 'course', 'q'],
  dues: ['course', 'batch', 'q'],
  results: ['exam', 'result'],
  attendance: [],
};

export function reportFilters(
  type: ReportType,
  query: Record<string, string | undefined>
): ReportFilters {
  switch (type) {
    case 'students':
      return {
        ...NO_FILTERS,
        course: validId(query.course),
        batch: validId(query.batch),
        status: pick(query.status, ['Active', 'Inactive'] as const),
        q: validText(query.q),
      };

    case 'enrollments':
      return orderDates({
        ...NO_FILTERS,
        state: pick(query.state, ['pending', 'approved', 'rejected'] as const),
        method: pick(query.method, ['bkash', 'nagad', 'none'] as const),
        course: validId(query.course),
        from: validDate(query.from),
        to: validDate(query.to),
        q: validText(query.q),
      });

    case 'payments': {
      const month = validMonth(query.month);
      const filters: ReportFilters = {
        ...NO_FILTERS,
        month,
        from: validDate(query.from),
        to: validDate(query.to),
        status: pick(query.status, ['paid', 'unpaid'] as const),
        method: pick(query.method, PAYMENT_METHODS),
        course: validId(query.course),
        q: validText(query.q),
      };
      // A month is a shorthand for its own range, and wins over one typed by hand.
      if (month !== '') {
        filters.from = `${month}-01`;
        const [year, mon] = month.split('-').map(Number);
        filters.to = new Date(Date.UTC(year, mon, 0)).toISOString().slice(0, 10);
      }
      return orderDates(filters);
    }

    case 'dues':
      return {
        ...NO_FILTERS,
        course: validId(query.course),
        batch: validId(query.batch),
        q: validText(query.q),
      };

    case 'results':
      return {
        ...NO_FILTERS,
        exam: validId(query.exam),
        result: pick(query.result, RESULT_CODES),
      };

    default:
      return { ...NO_FILTERS };
  }
}

/** The filters as a query string, for export links and the print view. */
export function reportQuery(
  type: ReportType,
  filters: ReportFilters,
  extra: Record<string, string> = {}
): string {
  const query = new URLSearchParams({ report: type });

  for (const key of FILTER_KEYS[type]) {
    // The month already says which range it is; repeating it as from/to would
    // make a link that no longer round-trips to the same filter.
    if (type === 'payments' && (key === 'from' || key === 'to') && filters.month !== '') continue;
    const value = filters[key];
    if (value === '' || value === 0) continue;
    query.set(key, String(value));
  }
  for (const [key, value] of Object.entries(extra)) query.set(key, value);

  return query.toString();
}

/** True when anything other than the exam picker is narrowing the report. */
export function isFiltered(type: ReportType, filters: ReportFilters): boolean {
  return FILTER_KEYS[type].some(
    (key) => key !== 'exam' && filters[key] !== '' && filters[key] !== 0
  );
}

/**
 * Where an old `reports.php?type=…` link (the FPDF version) should go.
 *
 * The dashboard and old bookmarks still point at these, and a dead link is a
 * worse answer than the report the person meant.
 */
export function legacyReportUrl(query: Record<string, string | undefined>): string {
  switch (query.type) {
    case 'monthly_collection': {
      const month = validMonth(query.month) || new Date().toISOString().slice(0, 7);
      return `/admin/reports?report=payments&month=${month}&status=paid`;
    }
    case 'due_list':
      return '/admin/reports?report=dues';
    case 'student_list':
      return '/admin/reports?report=students';
    case 'attendance': {
      const date = validDate(query.date) || new Date().toISOString().slice(0, 10);
      return `/admin/attendance-report?from=${date}&to=${date}`;
    }
  }
  return '/admin/reports';
}

/* -------------------------------------------------------------- columns */

export type CellType =
  | 'text'
  | 'code'
  | 'money'
  | 'int'
  | 'marks'
  | 'gpa'
  | 'percent'
  | 'date'
  | 'status';

export interface ReportColumn {
  key: string;
  label: string;
  type: CellType;
  width: number;
  /** A status column's label per stored value. */
  labels?: Record<string, string>;
  /** A status column's badge tone per stored value. */
  tones?: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'>;
  /** True when the cell should link to the student's profile. */
  link?: boolean;
}

export type CellValue = string | number | null;
export type ReportRow = Record<string, CellValue> & { _sid?: number };

export function isNumericType(type: CellType): boolean {
  return type === 'money' || type === 'int' || type === 'marks' || type === 'gpa' || type === 'percent';
}

export interface ReportStat {
  icon: string;
  color: string;
  /** Already formatted. */
  value: string;
  label: string;
}

export interface ReportSummary {
  count: number;
  stats: ReportStat[];
  /** The totals row, keyed like a data row; null when the report has none. */
  footer: Record<string, CellValue> | null;
}

/** The issued Student ID, or the STU-00001 fallback other admin pages use. */
export function studentCode(idNo: string | null | undefined, id: number): string {
  const text = (idNo ?? '').trim();
  return text !== '' ? text : `STU-${String(id).padStart(5, '0')}`;
}

export function methodLabel(method: string | null | undefined, lang: Lang): string {
  const key = (method ?? '').trim().toLowerCase();
  return (PAYMENT_METHODS as readonly string[]).includes(key)
    ? translate(lang, `arep.method_${key}`)
    : (method ?? '').trim();
}

/** The `Y-m-d` part of a date, or null — never a zero date. */
export function ymd(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(text) || text.startsWith('0000-00-00')) return null;
  return text.slice(0, 10);
}

/* ------------------------------------------------------------ formatting */

/** Display text in the reader's language — screen and print. */
export function cellText(column: ReportColumn, value: CellValue, lang: Lang): string {
  if (value === null || value === '') return '';

  switch (column.type) {
    case 'money':
      return formatMoney(Number(value), lang);
    case 'int':
      return toLocalDigits(Math.round(Number(value)), lang);
    case 'marks':
      return formatMark(Number(value), (v) => toLocalDigits(v, lang));
    case 'gpa':
      return formatNumber(Number(value), 2, lang);
    case 'percent':
      return `${formatMark(Math.round(Number(value) * 100) / 100, (v) => toLocalDigits(v, lang))}%`;
    case 'date':
      return formatDate(String(value), 'd M Y', lang);
    case 'status':
      return column.labels?.[String(value)] ?? String(value);
    default:
      return String(value);
  }
}

/** A totals-row cell: numbers by column type, labels as they are. */
export function footerText(column: ReportColumn, value: CellValue, lang: Lang): string {
  if (value === null) return '';
  return isNumericType(column.type) && typeof value === 'number'
    ? cellText(column, value, lang)
    : String(value);
}

/** "1500", "1500.5", "12.25" — no grouping, no currency sign. */
export function plainNumber(value: CellValue): string {
  const number = Math.round(Number(value) * 100) / 100;
  if (!Number.isFinite(number)) return '';
  return Number.isInteger(number) ? String(number) : String(number);
}

/** A CSV value: plain numbers, ISO dates, translated status labels. */
export function cellPlain(column: ReportColumn, value: CellValue, lang: Lang): string {
  if (value === null) return '';

  switch (column.type) {
    case 'money':
    case 'marks':
    case 'percent':
      return plainNumber(value);
    case 'gpa':
      return Number(value).toFixed(2);
    case 'int':
      return String(Math.round(Number(value)));
    case 'date':
      return ymd(String(value)) ?? '';
    case 'status':
      return column.labels?.[String(value)] ?? String(value);
    default:
      // The catalogue is already in the reader's language; `lang` is only
      // needed by the branches above.
      void lang;
      return String(value);
  }
}

/**
 * Neutralises spreadsheet formulas.
 *
 * A cell starting with `=` `+` `-` `@` tab or carriage return is prefixed with
 * a quote, so Excel shows a phone number as text instead of running a name
 * somebody chose as a formula.
 */
export function csvSafe(value: string): string {
  return value !== '' && '=+-@\t\r'.includes(value[0]) ? `'${value}` : value;
}

/** The Excel column type for one report column. */
export function xlsxType(type: CellType): 'string' | 'integer' | 'number' | 'percent' | 'date' {
  switch (type) {
    case 'money':
    case 'marks':
    case 'gpa':
      return 'number';
    case 'percent':
      return 'percent';
    case 'int':
      return 'integer';
    case 'date':
      return 'date';
    default:
      return 'string';
  }
}

/** An Excel value: real numbers for numeric columns, Y-m-d for dates. */
export function cellXlsx(
  column: ReportColumn,
  value: CellValue,
  lang: Lang
): string | number | null {
  if (value === null || value === '') return null;

  switch (column.type) {
    case 'money':
    case 'marks':
    case 'gpa':
    case 'percent':
      return Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) / 100 : String(value);
    case 'int':
      return Number.isFinite(Number(value)) ? Math.round(Number(value)) : String(value);
    case 'date':
      return ymd(String(value)) ?? String(value);
    case 'status':
      return column.labels?.[String(value)] ?? String(value);
    default:
      void lang;
      return String(value);
  }
}
