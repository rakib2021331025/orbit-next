import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { settingLocalized, setting } from '@/lib/settings';
import type { Lang } from '@/lib/i18n';

/**
 * The PDF foundation, replacing includes/pdf_lib.php (mPDF).
 *
 * **PDFKit with Hind Siliguri embedded as a subset**, which is the decision
 * measured in `docs/BENGALI_PDF_DECISION.md`. The reason is GSUB shaping: a
 * library that maps characters to glyphs one-to-one still produces a PDF, but
 * `ক্ষ` comes out as three separate marks. PDFKit hands every string to fontkit,
 * which applies the font's own GSUB/GPOS tables, and the proof in
 * `tools/pdf-proof/` reads the glyphs back out to confirm it.
 *
 * Two consequences worth knowing:
 *
 *   - the route must run on **nodejs**, not edge: the font is read from disk;
 *   - the font is registered **once per document** and always by name, so a
 *     Bangla string can never fall back to Helvetica (which has no Bangla at
 *     all and would silently print nothing).
 */

export const FONT_REGULAR = 'hind';
export const FONT_BOLD = 'hind-bold';

/** A4 in points, as every document in the original uses. */
export const A4: [number, number] = [595.28, 841.89];

const FONT_DIR = path.join(process.cwd(), 'assets', 'fonts', 'hind-siliguri');

let cachedRegular: Buffer | null = null;
let cachedBold: Buffer | null = null;

/** The two font files, read once per process. */
async function fonts(): Promise<{ regular: Buffer; bold: Buffer }> {
  if (cachedRegular === null || cachedBold === null) {
    [cachedRegular, cachedBold] = await Promise.all([
      readFile(path.join(FONT_DIR, 'HindSiliguri-Regular.ttf')),
      readFile(path.join(FONT_DIR, 'HindSiliguri-Bold.ttf')),
    ]);
  }
  return { regular: cachedRegular, bold: cachedBold };
}

export interface PdfOptions {
  /** 'portrait' (default) or 'landscape'. */
  orientation?: 'portrait' | 'landscape';
  margin?: number;
  title?: string;
  author?: string;
  /**
   * false when the document adds its own first page — an ID card is 85.6 × 54 mm,
   * and an A4 page opened automatically would print as a blank sheet in front of
   * it.
   */
  firstPage?: boolean;
}

/**
 * A new document with the Bangla fonts registered and `hind` selected.
 *
 * Nothing is drawn here; each document module draws its own layout.
 */
export async function newPdf(options: PdfOptions = {}): Promise<PDFKit.PDFDocument> {
  const { regular, bold } = await fonts();

  const doc = new PDFDocument({
    size: 'A4',
    layout: options.orientation ?? 'portrait',
    margin: options.margin ?? 36,
    autoFirstPage: options.firstPage !== false,
    info: {
      Title: options.title ?? 'Orbit',
      Author: options.author ?? 'Orbit Private Care',
      Creator: 'Orbit',
    },
    // The document starts in Hind Siliguri itself. \`undefined\` here does NOT
    // skip the default: initFonts(defaultFont = 'Helvetica') fills it in, and
    // PDFKit then loads its built-in Helvetica through a package import map
    // (#standard-fonts/*) that the Vercel runtime cannot resolve — every PDF
    // failed there with MODULE_NOT_FOUND while working locally.
    font: regular as unknown as string,
  });

  doc.registerFont(FONT_REGULAR, regular);
  doc.registerFont(FONT_BOLD, bold);
  doc.font(FONT_REGULAR);

  return doc;
}

/** Collects a finished document into one buffer. */
export function pdfBytes(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

/** A file name safe for a Content-Disposition header. */
export function pdfFilename(name: string): string {
  const clean = name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return clean !== '' ? clean : 'document.pdf';
}

/**
 * Response headers for a PDF.
 *
 * `inline` shows it in the browser's viewer, which is what a "print" link wants;
 * `download` saves it, which is what a receipt button wants.
 */
export function pdfHeaders(
  filename: string,
  bytes: number,
  mode: 'inline' | 'download' = 'inline'
): Record<string, string> {
  return {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `${mode === 'download' ? 'attachment' : 'inline'}; filename="${pdfFilename(filename)}"`,
    'Content-Length': String(bytes),
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
  };
}

export interface Brand {
  institute: string;
  address: string;
  phone: string;
  email: string;
  logo: Buffer | null;
}

/** The institute's own details and logo, for every document's header. */
export async function brand(lang: Lang): Promise<Brand> {
  const [institute, address, phone, email, logoPath] = await Promise.all([
    settingLocalized('institute_name', 'Orbit Private Care', lang),
    settingLocalized('institute_address', '', lang),
    setting('contact_phone', ''),
    setting('institute_email', ''),
    setting('logo_path', ''),
  ]);

  let logo: Buffer | null = null;
  try {
    if (logoPath !== '') {
      const { getFile } = await import('@/lib/storage/store');
      logo = await getFile(logoPath);
    }
    if (logo === null) {
      // The built-in badge, which is what the original falls back to.
      logo = await readFile(
        path.join(process.cwd(), 'public', 'assets', 'brand', 'orbit-logo-320.png')
      );
    }
  } catch {
    logo = null;
  }

  return { institute, address, phone, email, logo };
}

/**
 * The letterhead: logo left, institute and contact details beside it, a rule
 * under both.
 *
 * Returns the y to carry on drawing from.
 */
export function drawLetterhead(
  doc: PDFKit.PDFDocument,
  details: Brand,
  subtitle: string
): number {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const top = doc.page.margins.top;

  let textLeft = left;
  if (details.logo !== null) {
    try {
      doc.image(details.logo, left, top, { fit: [52, 52] });
      textLeft = left + 62;
    } catch {
      // A logo that will not decode is not worth failing a marksheet for.
    }
  }

  doc
    .font(FONT_BOLD)
    .fontSize(16)
    .fillColor('#062c19')
    .text(details.institute, textLeft, top + 2, { width: right - textLeft });

  const contact = [details.address, details.phone, details.email]
    .filter((part) => part.trim() !== '')
    .join(' · ');

  if (contact !== '') {
    doc
      .font(FONT_REGULAR)
      .fontSize(8.5)
      .fillColor('#5b6961')
      .text(contact, textLeft, doc.y + 1, { width: right - textLeft });
  }

  if (subtitle !== '') {
    doc
      .font(FONT_BOLD)
      .fontSize(12)
      .fillColor('#0f5132')
      .text(subtitle, textLeft, doc.y + 3, { width: right - textLeft });
  }

  const ruleY = Math.max(doc.y + 6, top + 58);
  doc
    .moveTo(left, ruleY)
    .lineTo(right, ruleY)
    .lineWidth(1.5)
    .strokeColor('#062c19')
    .stroke();

  doc.fillColor('#1d2a22').font(FONT_REGULAR).fontSize(10);
  return ruleY + 12;
}

/** A label/value grid, two columns, as the marksheet and receipt both use. */
export function drawPairs(
  doc: PDFKit.PDFDocument,
  pairs: [string, string][],
  startY: number,
  columns = 2
): number {
  const left = doc.page.margins.left;
  const usable = doc.page.width - left - doc.page.margins.right;
  const columnWidth = usable / columns;
  const lineHeight = 16;

  pairs.forEach((pair, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = left + column * columnWidth;
    const y = startY + row * lineHeight;

    doc.font(FONT_REGULAR).fontSize(9).fillColor('#5b6961').text(`${pair[0]}: `, x, y, {
      width: columnWidth - 8,
      continued: true,
    });
    doc.font(FONT_BOLD).fontSize(9.5).fillColor('#1d2a22').text(pair[1], { width: columnWidth - 8 });
  });

  const rows = Math.ceil(pairs.length / columns);
  return startY + rows * lineHeight + 6;
}

export interface TableColumn {
  header: string;
  /** A share of the usable width; the shares are normalised. */
  width: number;
  align?: 'left' | 'right' | 'center';
}

/** A bordered table with a filled header row. Returns the y below it. */
export function drawTable(
  doc: PDFKit.PDFDocument,
  columns: TableColumn[],
  rows: string[][],
  startY: number
): number {
  const left = doc.page.margins.left;
  const usable = doc.page.width - left - doc.page.margins.right;
  const totalShare = columns.reduce((sum, column) => sum + column.width, 0) || 1;
  const widths = columns.map((column) => (column.width / totalShare) * usable);

  const rowHeight = 18;
  let y = startY;

  const cell = (text: string, x: number, width: number, align: TableColumn['align']) => {
    doc.text(text, x + 4, y + 5, {
      width: width - 8,
      align: align === 'right' ? 'right' : align === 'center' ? 'center' : 'left',
      lineBreak: false,
    });
  };

  // Header.
  doc.rect(left, y, usable, rowHeight).fill('#0f5132');
  doc.font(FONT_BOLD).fontSize(9).fillColor('#ffffff');
  let x = left;
  columns.forEach((column, index) => {
    cell(column.header, x, widths[index], column.align);
    x += widths[index];
  });
  y += rowHeight;

  // Body.
  doc.font(FONT_REGULAR).fontSize(9);
  rows.forEach((row, rowIndex) => {
    // A new page keeps the same table geometry; a row is never split.
    if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.page.margins.top;
    }

    if (rowIndex % 2 === 1) {
      doc.rect(left, y, usable, rowHeight).fill('#f3f7f4');
    }

    doc.fillColor('#1d2a22');
    x = left;
    row.forEach((value, index) => {
      if (index >= columns.length) return;
      cell(value, x, widths[index], columns[index].align);
      x += widths[index];
    });

    doc
      .rect(left, y, usable, rowHeight)
      .lineWidth(0.5)
      .strokeColor('#c9d4cc')
      .stroke();
    y += rowHeight;
  });

  return y + 8;
}

/** The footer line: who generated it and when. */
export function drawFooter(doc: PDFKit.PDFDocument, text: string): void {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const bottom = doc.page.margins.bottom;
  const y = doc.page.height - bottom + 8;

  // The footer sits INSIDE the bottom margin, and PDFKit starts a new page for
  // any text placed below it — which printed the footer alone on a blank page 2.
  // Lifting the margin for this one line keeps it on the page it belongs to.
  doc.page.margins.bottom = 0;
  doc
    .font(FONT_REGULAR)
    .fontSize(7.5)
    .fillColor('#8a978f')
    .text(text, left, y, { width: right - left, align: 'center', lineBreak: false });
  doc.page.margins.bottom = bottom;
}
