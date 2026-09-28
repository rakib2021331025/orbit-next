import { makeZip, type ZipEntry } from './zip';

/**
 * A small, dependency-free Excel (.xlsx / Office Open XML) writer — the port of
 * includes/xlsx_writer.php.
 *
 * It produces a **real spreadsheet**: typed numbers and dates, a styled header
 * row, frozen panes, an auto-filter, column widths, a title block and coloured
 * status cells. A CSV would have been less code and Excel would have
 * reinterpreted every Student ID as a number and every Bangla name as mojibake.
 *
 *   const book = new XlsxBook('Attendance report');
 *   book.addSheet('Records', [
 *     { header: 'Student ID', width: 18 },
 *     { header: 'Date', width: 14, type: 'date' },
 *     { header: 'Status', width: 12, type: 'status', labels: { present: 'Present' } },
 *   ], rows, { title: 'Orbit Private Care', subtitle: 'September 2026' });
 *   const bytes = book.build();
 *
 * Strings are written inline rather than through a shared-strings table: the
 * sheets are read once by a human, and the table would only save bytes.
 */

/** Style ids, in the order `cellXfs` declares them below. */
const S = {
  DEFAULT: 0,
  TITLE: 1,
  SUBTITLE: 2,
  HEADER: 3,
  TEXT: 4,
  INT: 5,
  NUMBER: 6,
  PERCENT: 7,
  DATE: 8,
  PRESENT: 9,
  ABSENT: 10,
  LATE: 11,
  HALF: 12,
  BOLD: 13,
  BOLD_INT: 14,
  BOLD_PCT: 15,
} as const;

export type ColumnType = 'string' | 'integer' | 'number' | 'percent' | 'date' | 'status';

export interface XlsxColumn {
  header: string;
  width?: number;
  type?: ColumnType;
  /** For `status` columns: the label to show for each stored value. */
  labels?: Record<string, string>;
}

export interface SheetOptions {
  title?: string;
  subtitle?: string;
  /** A bold row at the bottom, in the same column order. */
  totals?: XlsxValue[];
  freeze?: boolean;
  autofilter?: boolean;
}

export type XlsxValue = string | number | Date | null | undefined;

interface Sheet {
  name: string;
  columns: XlsxColumn[];
  rows: XlsxValue[][];
  options: SheetOptions;
}

/** Strips the control characters XML forbids, then escapes. */
function xml(value: unknown): string {
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 0 → A, 25 → Z, 26 → AA. */
function columnName(index: number): string {
  let n = index + 1;
  let name = '';
  while (n > 0) {
    const mod = (n - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    n = Math.floor((n - mod) / 26);
  }
  return name;
}

/** Excel's day number: days since 1899-12-30, which is the 25569 offset. */
function dateSerial(value: Date | string): number | null {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor(date.getTime() / 86400000) + 25569;
}

const STATUS_STYLE: Record<string, number> = {
  present: S.PRESENT,
  absent: S.ABSENT,
  late: S.LATE,
  half_day: S.HALF,
};

export class XlsxBook {
  private sheets: Sheet[] = [];

  constructor(private readonly title = 'Report') {}

  addSheet(name: string, columns: XlsxColumn[], rows: XlsxValue[][], options: SheetOptions = {}): this {
    // Excel refuses these characters in a sheet name, and truncates at 31.
    const cleaned = name.replace(/[[\]:*?/\\]/g, ' ').trim();
    this.sheets.push({
      name: (cleaned !== '' ? cleaned : `Sheet${this.sheets.length + 1}`).slice(0, 31),
      columns,
      rows,
      options,
    });
    return this;
  }

  build(): Buffer {
    if (this.sheets.length === 0) this.addSheet('Sheet1', [{ header: '' }], []);

    const entries: ZipEntry[] = [
      { name: '[Content_Types].xml', content: this.contentTypes() },
      { name: '_rels/.rels', content: this.rootRels() },
      { name: 'docProps/app.xml', content: this.appProps() },
      { name: 'docProps/core.xml', content: this.coreProps() },
      { name: 'xl/workbook.xml', content: this.workbook() },
      { name: 'xl/_rels/workbook.xml.rels', content: this.workbookRels() },
      { name: 'xl/styles.xml', content: this.styles() },
      ...this.sheets.map((sheet, index) => ({
        name: `xl/worksheets/sheet${index + 1}.xml`,
        content: this.sheetXml(sheet),
      })),
    ];

    return makeZip(entries);
  }

  /* ------------------------------------------------------------- parts */

  private contentTypes(): string {
    const sheets = this.sheets
      .map(
        (_, index) =>
          `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
      )
      .join('');

    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      sheets +
      '</Types>'
    );
  }

  private rootRels(): string {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
      '</Relationships>'
    );
  }

  private appProps(): string {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
      '<Application>Orbit Private Care</Application></Properties>'
    );
  }

  private coreProps(): string {
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      `<dc:title>${xml(this.title)}</dc:title><dc:creator>Orbit Private Care</dc:creator>` +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>` +
      `<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>` +
      '</cp:coreProperties>'
    );
  }

  private workbook(): string {
    const sheets = this.sheets
      .map(
        (sheet, index) =>
          `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
      )
      .join('');

    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="28800" windowHeight="15000"/></bookViews>' +
      `<sheets>${sheets}</sheets></workbook>`
    );
  }

  private workbookRels(): string {
    const rels =
      this.sheets
        .map(
          (_, index) =>
            `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
        )
        .join('') +
      `<Relationship Id="rId${this.sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;

    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`
    );
  }

  private styles(): string {
    const border =
      '<border><left style="thin"><color rgb="FFD7E0D9"/></left><right style="thin"><color rgb="FFD7E0D9"/></right>' +
      '<top style="thin"><color rgb="FFD7E0D9"/></top><bottom style="thin"><color rgb="FFD7E0D9"/></bottom><diagonal/></border>';

    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="2"><numFmt numFmtId="164" formatCode="0.00&quot;%&quot;"/><numFmt numFmtId="165" formatCode="dd\\-mmm\\-yyyy"/></numFmts>' +
      '<fonts count="9">' +
      '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
      '<font><b/><sz val="15"/><color rgb="FF062C19"/><name val="Calibri"/><family val="2"/></font>' +
      '<font><i/><sz val="10"/><color rgb="FF5B6961"/><name val="Calibri"/><family val="2"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FF166534"/><name val="Calibri"/><family val="2"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FF991B1B"/><name val="Calibri"/><family val="2"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FF9A3412"/><name val="Calibri"/><family val="2"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FF075985"/><name val="Calibri"/><family val="2"/></font>' +
      '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
      '</fonts>' +
      '<fills count="8">' +
      '<fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF0F5132"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFFEE2E2"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFFFEDD5"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFE0F2FE"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFEEF3EE"/><bgColor indexed="64"/></patternFill></fill>' +
      '</fills>' +
      `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>${border}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="16">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
      '<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
      '<xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>' +
      '<xf numFmtId="4" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>' +
      '<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>' +
      '<xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>' +
      '<xf numFmtId="0" fontId="5" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>' +
      '<xf numFmtId="0" fontId="6" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>' +
      '<xf numFmtId="0" fontId="7" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>' +
      '<xf numFmtId="0" fontId="8" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
      '<xf numFmtId="1" fontId="8" fillId="7" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>' +
      '<xf numFmtId="164" fontId="8" fillId="7" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>' +
      '</cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>'
    );
  }

  private cell(ref: string, value: XlsxValue, column: XlsxColumn, bold = false): string {
    const type = column.type ?? 'string';

    if (value === null || value === undefined || value === '') {
      return `<c r="${ref}" s="${bold ? S.BOLD : S.TEXT}"/>`;
    }

    if (type === 'integer' || type === 'number' || type === 'percent') {
      const numeric = typeof value === 'number' ? value : Number(value);
      if (!Number.isNaN(numeric)) {
        const style =
          type === 'percent'
            ? bold
              ? S.BOLD_PCT
              : S.PERCENT
            : type === 'integer'
              ? bold
                ? S.BOLD_INT
                : S.INT
              : bold
                ? S.BOLD
                : S.NUMBER;
        return `<c r="${ref}" s="${style}"><v>${numeric}</v></c>`;
      }
    }

    if (type === 'date' && (value instanceof Date || typeof value === 'string')) {
      const serial = dateSerial(value);
      // A real date cell sorts and filters as a date in Excel; a string does not.
      if (serial !== null) return `<c r="${ref}" s="${S.DATE}"><v>${serial}</v></c>`;
    }

    if (type === 'status') {
      const key = String(value);
      const label = column.labels?.[key] ?? key;
      const style = STATUS_STYLE[key] ?? S.TEXT;
      return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(label)}</t></is></c>`;
    }

    const text = value instanceof Date ? value.toISOString().slice(0, 10) : value;
    return `<c r="${ref}" s="${bold ? S.BOLD : S.TEXT}" t="inlineStr"><is><t xml:space="preserve">${xml(text)}</t></is></c>`;
  }

  private sheetXml(sheet: Sheet): string {
    const columns = sheet.columns.length > 0 ? sheet.columns : [{ header: '' }];
    const lastCol = columnName(columns.length - 1);
    const merges: string[] = [];
    let rowsXml = '';
    let r = 0;

    if (sheet.options.title) {
      r++;
      rowsXml += `<row r="${r}" ht="24" customHeight="1"><c r="A${r}" s="${S.TITLE}" t="inlineStr"><is><t xml:space="preserve">${xml(sheet.options.title)}</t></is></c></row>`;
      merges.push(`A${r}:${lastCol}${r}`);
    }
    if (sheet.options.subtitle) {
      r++;
      rowsXml += `<row r="${r}"><c r="A${r}" s="${S.SUBTITLE}" t="inlineStr"><is><t xml:space="preserve">${xml(sheet.options.subtitle)}</t></is></c></row>`;
      merges.push(`A${r}:${lastCol}${r}`);
    }
    // A blank spacer row between the title block and the header.
    if (r > 0) {
      r++;
      rowsXml += `<row r="${r}"/>`;
    }

    r++;
    const headerRow = r;
    rowsXml += `<row r="${r}" ht="22" customHeight="1">`;
    columns.forEach((column, index) => {
      rowsXml += `<c r="${columnName(index)}${r}" s="${S.HEADER}" t="inlineStr"><is><t xml:space="preserve">${xml(column.header)}</t></is></c>`;
    });
    rowsXml += '</row>';

    for (const row of sheet.rows) {
      r++;
      rowsXml += `<row r="${r}">`;
      columns.forEach((column, index) => {
        rowsXml += this.cell(`${columnName(index)}${r}`, row[index], column);
      });
      rowsXml += '</row>';
    }

    if (sheet.options.totals && sheet.options.totals.length > 0) {
      r++;
      rowsXml += `<row r="${r}">`;
      columns.forEach((column, index) => {
        rowsXml += this.cell(`${columnName(index)}${r}`, sheet.options.totals?.[index], column, true);
      });
      rowsXml += '</row>';
    }

    const colsXml = `<cols>${columns
      .map(
        (column, index) =>
          `<col min="${index + 1}" max="${index + 1}" width="${column.width ?? 16}" customWidth="1"/>`
      )
      .join('')}</cols>`;

    // The header stays on screen while scrolling a long register.
    const freeze =
      sheet.options.freeze !== false
        ? `<pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${headerRow + 1}" sqref="A${headerRow + 1}"/>`
        : '';

    const lastDataRow = headerRow + Math.max(1, sheet.rows.length);
    const filter =
      sheet.options.autofilter !== false && sheet.rows.length > 0
        ? `<autoFilter ref="A${headerRow}:${lastCol}${lastDataRow}"/>`
        : '';

    const mergeXml =
      merges.length > 0
        ? `<mergeCells count="${merges.length}">${merges
            .map((ref) => `<mergeCell ref="${ref}"/>`)
            .join('')}</mergeCells>`
        : '';

    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      `<sheetViews><sheetView workbookViewId="0">${freeze}</sheetView></sheetViews>` +
      '<sheetFormatPr defaultRowHeight="15"/>' +
      colsXml +
      `<sheetData>${rowsXml}</sheetData>` +
      mergeXml +
      filter +
      '</worksheet>'
    );
  }
}

/** The headers that make a browser download a workbook rather than show it. */
export function xlsxHeaders(filename: string, bytes: number): Record<string, string> {
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, '_');
  return {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${safe}"`,
    'Content-Length': String(bytes),
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
  };
}

/**
 * A CSV file, **with a UTF-8 BOM**.
 *
 * The BOM is not decoration: without it Excel on Windows reads the file in the
 * system code page and every Bangla name becomes mojibake.
 */
export function makeCsv(rows: (string | number | null | undefined)[][]): Buffer {
  const escape = (value: string | number | null | undefined) => {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const body = rows.map((row) => row.map(escape).join(',')).join('\r\n');
  return Buffer.concat([Buffer.from('﻿', 'utf8'), Buffer.from(body, 'utf8')]);
}

export function csvHeaders(filename: string, bytes: number): Record<string, string> {
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, '_');
  return {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${safe}"`,
    'Content-Length': String(bytes),
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
  };
}
