import { NextResponse, type NextRequest } from 'next/server';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { currentUser, adminBranchLock } from '@/lib/auth/guards';
import { getLang, isLang, translate, type Lang } from '@/lib/i18n';
import { instituteName } from '@/lib/settings';
import { getFile } from '@/lib/storage/store';
import { FONT_BOLD, FONT_REGULAR, newPdf, pdfBytes, pdfHeaders } from '@/lib/pdf/doc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One printable document on A4, from admin/printable_document_print.php.
 *
 *   /api/printable/<id>?orientation=auto|portrait|landscape&fit=fit|fill|original&header=0
 *
 * "auto" follows the image's own shape, which is what makes a wide periodic
 * table come out landscape without anybody choosing. The heading can be turned
 * off for a document that already has its own.
 *
 * Admins always; a student only when the document is marked visible to students.
 * Teachers and guardians have no printables page, so they get nothing. A branch
 * admin is treated like a student here: admin/printable_document_print.php is
 * not on the branch-admin allow-list, so only the student-visible documents
 * (which their students can already open) are theirs to print.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const documentId = /^\d+$/.test(id) ? Number(id) : 0;

  const user = await currentUser();
  if (!user) notFound();

  const document =
    documentId > 0
      ? await prisma.printableDocument.findUnique({ where: { id: documentId } }).catch(() => null)
      : null;
  if (!document) notFound();

  if (user.role !== 'admin' && user.role !== 'student') notFound();

  // A document not marked for students is staff-only — and all-branch staff
  // only. adminBranchLock() also re-checks the admin row is still active.
  const staff = user.role === 'admin' && (await adminBranchLock()) === 0;
  if (!staff && !document.student_visible) notFound();

  const query = request.nextUrl.searchParams;
  const asked = query.get('lang');
  const lang: Lang = isLang(asked) ? asked : await getLang();
  const t = (key: string) => translate(lang, key);

  const orientationAsked = query.get('orientation') ?? 'auto';
  const fit = ['fit', 'fill', 'original'].includes(query.get('fit') ?? '')
    ? (query.get('fit') as 'fit' | 'fill' | 'original')
    : 'fit';
  const showHeader = query.get('header') !== '0';

  const landscape =
    orientationAsked === 'landscape' ||
    (orientationAsked === 'auto' && document.image_width > document.image_height);

  const image = await getFile(document.image_path);
  if (image === null) {
    return NextResponse.json({ error: t('pdoc.image_missing') }, { status: 404 });
  }

  const institute = await instituteName(lang);

  const doc = await newPdf({
    orientation: landscape ? 'landscape' : 'portrait',
    margin: 28,
    title: document.title,
    author: institute,
  });

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  let top = doc.page.margins.top;

  if (showHeader) {
    doc
      .font(FONT_BOLD)
      .fontSize(15)
      .fillColor('#062c19')
      .text(institute, left, top, { width: right - left, align: 'center' });
    doc
      .font(FONT_REGULAR)
      .fontSize(12)
      .fillColor('#1d2a22')
      .text(document.title, left, doc.y + 2, { width: right - left, align: 'center' });

    const ruleY = doc.y + 5;
    doc
      .moveTo(left, ruleY)
      .lineTo(right, ruleY)
      .lineWidth(1.2)
      .strokeColor('#062c19')
      .stroke();
    top = ruleY + 10;
  }

  const boxWidth = right - left;
  const boxHeight = doc.page.height - doc.page.margins.bottom - top;

  try {
    if (fit === 'original' && document.image_width > 0) {
      // 96 dpi, the same assumption the browser's print view makes.
      const scale = 72 / 96;
      doc.image(image, left, top, {
        width: Math.min(document.image_width * scale, boxWidth),
      });
    } else if (fit === 'fill') {
      // Fill enlarges a small image to the page; `cover` would crop it, so the
      // box is used as the target size instead.
      doc.image(image, left, top, { fit: [boxWidth, boxHeight], align: 'center', valign: 'center' });
    } else {
      doc.image(image, left, top, {
        fit: [boxWidth, boxHeight],
        align: 'center',
        valign: 'center',
      });
    }
  } catch {
    return NextResponse.json({ error: t('pdoc.pdf_failed') }, { status: 500 });
  }

  const bytes = await pdfBytes(doc);

  const slug = document.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);

  return new NextResponse(new Uint8Array(bytes), {
    headers: pdfHeaders(
      `orbit_printable_${document.id}${slug !== '' ? `_${slug}` : ''}.pdf`,
      bytes.length,
      'inline'
    ),
  });
}
