import { NextResponse, type NextRequest } from 'next/server';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import {
  currentUser,
  guardianChildren,
  requireAdmin,
  requireGuardian,
  requireRecordBranch,
} from '@/lib/auth/guards';
import { getLang, isLang, translate, type Lang } from '@/lib/i18n';
import { formatDate, formatMoney, monthLabel, pickLocalized } from '@/lib/i18n/format';
import { formatPhone } from '@/lib/site/url';
import { feeMethodLabel } from '@/lib/fees/core';
import {
  A4,
  FONT_BOLD,
  FONT_REGULAR,
  brand,
  drawPairs,
  newPdf,
  pdfBytes,
  pdfHeaders,
} from '@/lib/pdf/doc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A payment receipt as a PDF, from generate_payslip.php.
 *
 * Who may open one:
 *   - an admin: any receipt in their branch (a branch admin, only their own),
 *   - a student: only their own,
 *   - a guardian: only those of an active child linked to their account.
 *
 * Anything else is a **404, never a 403** — a "forbidden" would confirm that the
 * receipt exists, and its number is guessable.
 *
 * Only a payment that has actually been received gets a receipt.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const paymentId = /^\d+$/.test(id) ? Number(id) : 0;

  const user = await currentUser();
  if (!user) notFound();

  const payment =
    paymentId > 0
      ? await prisma.payment
          .findUnique({
            where: { id: paymentId },
            include: {
              student: {
                select: {
                  id: true,
                  name: true,
                  name_bn: true,
                  phone: true,
                  student_id_no: true,
                  roll_number: true,
                  course: true,
                  batch: true,
                },
              },
            },
          })
          .catch(() => null)
      : null;

  if (!payment) notFound();

  // Who is asking, and whether this receipt is theirs to see.
  if (user.role === 'student' && payment.student_id !== user.uid) notFound();
  if (user.role === 'admin') {
    // The live admin row, not just the cookie, and the payment's branch.
    await requireAdmin();
    try {
      await requireRecordBranch('payments', payment.id);
    } catch {
      notFound();
    }
  }
  if (user.role === 'guardian') {
    await requireGuardian();
    const children = await guardianChildren(user.uid).catch(() => []);
    if (!children.some((child) => child.id === payment.student_id)) notFound();
  }
  if (user.role === 'teacher') notFound();

  if (payment.payment_status !== 'paid') {
    const lang = await getLang();
    return NextResponse.json(
      {
        error: translate(lang, 'rcpt.unpaid_title'),
        detail: translate(lang, 'rcpt.unpaid_body'),
      },
      { status: 409 }
    );
  }

  const asked = request.nextUrl.searchParams.get('lang');
  const lang: Lang = isLang(asked) ? asked : await getLang();
  const t = (key: string, vars?: Record<string, string>) => translate(lang, key, vars);

  const details = await brand(lang);

  // The enrolment's names win over the student record's free text, as the
  // original reads them.
  const enrolment =
    payment.enrollment_id !== null
      ? await prisma.enrollment
          .findUnique({
            where: { id: payment.enrollment_id },
            select: { course_name: true, batch_name: true },
          })
          .catch(() => null)
      : null;

  const receiptNo =
    (payment.receipt_number ?? '').trim() !== ''
      ? payment.receipt_number!.trim()
      : `REC-${String(payment.id).padStart(6, '0')}`;

  const studentNo =
    (payment.student.student_id_no ?? '').trim() !== ''
      ? payment.student.student_id_no!.trim()
      : (payment.student.roll_number ?? '').trim() !== ''
        ? payment.student.roll_number!.trim()
        : `STU-${String(payment.student_id).padStart(5, '0')}`;

  const name = pickLocalized(payment.student, 'name', lang);
  const course = (enrolment?.course_name ?? payment.student.course ?? '').trim();
  const batch = (enrolment?.batch_name ?? payment.student.batch ?? '').trim();

  // What it was for: "Admission", a month, or free text such as "June 2026".
  const forWhat = (payment.payment_month ?? '').trim();
  const forLabel =
    forWhat.toLowerCase() === 'admission'
      ? t('student.pay.admission')
      : /^\d{4}-\d{2}$/.test(forWhat)
        ? monthLabel(forWhat, lang)
        : forWhat;

  const method = (payment.payment_method ?? '').trim();
  const methodLabel = ['cash', 'bank'].includes(method.toLowerCase())
    ? t(`rcpt.method_${method.toLowerCase()}`)
    : feeMethodLabel(method, lang);

  const doc = await newPdf({ title: `${t('rcpt.title')} ${receiptNo}`, author: details.institute });

  /* --------------------------------------------------- the dark header */
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const headerHeight = 76;

  doc.rect(0, 0, doc.page.width, headerHeight).fill('#062c19');

  let textLeft = left;
  if (details.logo !== null) {
    try {
      doc.image(details.logo, left, 14, { fit: [48, 48] });
      textLeft = left + 58;
    } catch {
      // A logo that will not decode must not stop a receipt.
    }
  }

  doc
    .font(FONT_BOLD)
    .fontSize(17)
    .fillColor('#ffffff')
    .text(details.institute, textLeft, 16, { width: right - textLeft - 150 });

  const contact = [
    details.address,
    details.phone !== '' ? formatPhone(details.phone) : '',
    details.email,
  ]
    .filter((part) => part.trim() !== '')
    .join(' · ');

  if (contact !== '') {
    doc
      .font(FONT_REGULAR)
      .fontSize(8)
      .fillColor('#d9e8de')
      .text(contact, textLeft, doc.y + 1, { width: right - textLeft - 150 });
  }

  doc
    .font(FONT_BOLD)
    .fontSize(14)
    .fillColor('#fedc02')
    .text(t('rcpt.title'), right - 150, 24, { width: 150, align: 'right' });

  /* ------------------------------------------------------- the boxes */
  let y = headerHeight + 18;
  const boxWidth = (right - left) / 3;

  const boxes: [string, string, string][] = [
    [t('rcpt.receipt_no'), receiptNo, '#1d2a22'],
    [
      t('rcpt.date'),
      payment.payment_date !== null ? formatDate(payment.payment_date, 'd M Y', lang) : '',
      '#1d2a22',
    ],
    [t('rcpt.status'), t('status.paid'), '#15803d'],
  ];

  boxes.forEach((box, index) => {
    const x = left + index * boxWidth;
    doc.rect(x, y, boxWidth, 40).fillAndStroke('#f1f6f2', '#d5e0d8');
    doc.font(FONT_REGULAR).fontSize(8).fillColor('#46524b').text(box[0], x + 6, y + 6, {
      width: boxWidth - 12,
    });
    doc.font(FONT_BOLD).fontSize(11).fillColor(box[2]).text(box[1], x + 6, y + 19, {
      width: boxWidth - 12,
    });
  });

  y += 56;

  /* ------------------------------------------------ student and payment */
  doc.font(FONT_BOLD).fontSize(11).fillColor('#062c19').text(t('rcpt.student'), left, y);
  y = drawPairs(
    doc,
    (
      [
        [t('rcpt.name'), name],
        [t('common.student_id'), studentNo],
        [t('common.course'), course],
        [t('common.batch'), batch],
        [t('common.phone'), formatPhone(payment.student.phone ?? '')],
      ] as [string, string][]
    ).filter((pair) => pair[1].trim() !== ''),
    y + 16
  );

  doc.font(FONT_BOLD).fontSize(11).fillColor('#062c19').text(t('rcpt.payment'), left, y + 6);
  y = drawPairs(
    doc,
    (
      [
        [t('rcpt.for'), forLabel],
        [t('rcpt.method'), methodLabel],
        [t('rcpt.trx'), (payment.transaction_id ?? '').trim()],
        [t('rcpt.due'), Number(payment.due_amount ?? 0) > 0 ? formatMoney(Number(payment.due_amount), lang) : ''],
        [t('rcpt.notes'), (payment.notes ?? '').trim()],
      ] as [string, string][]
    ).filter((pair) => pair[1].trim() !== ''),
    y + 22
  );

  /* ------------------------------------------------------ the total box */
  y += 10;
  doc.rect(left, y, right - left, 44).fillAndStroke('#0f5132', '#0f5132');
  doc
    .font(FONT_REGULAR)
    .fontSize(9.5)
    .fillColor('#d9e8de')
    .text(t('rcpt.total_box'), left + 12, y + 9);
  doc
    .font(FONT_BOLD)
    .fontSize(18)
    .fillColor('#ffffff')
    .text(formatMoney(Number(payment.amount), lang), left + 12, y + 20, {
      width: right - left - 24,
      align: 'right',
    });

  y += 66;

  /* --------------------------------------------------------- signatures */
  const half = (right - left) / 2;
  [t('rcpt.sign_student'), t('rcpt.sign_office')].forEach((label, index) => {
    const x = left + index * half;
    doc
      .moveTo(x + 10, y + 26)
      .lineTo(x + half - 10, y + 26)
      .lineWidth(0.6)
      .strokeColor('#8a978f')
      .stroke();
    doc
      .font(FONT_REGULAR)
      .fontSize(8.5)
      .fillColor('#46524b')
      .text(label, x + 10, y + 30, { width: half - 20, align: 'center' });
  });

  y += 56;
  doc
    .font(FONT_REGULAR)
    .fontSize(9)
    .fillColor('#46524b')
    .text(t('rcpt.thanks', { institute: details.institute }), left, y, {
      width: right - left,
      align: 'center',
    });

  doc
    .font(FONT_REGULAR)
    .fontSize(7.5)
    .fillColor('#8a978f')
    .text(
      t('rcpt.generated', { date: formatDate(new Date(), 'd M Y, h:i A', lang) }),
      left,
      doc.page.height - doc.page.margins.bottom - 10,
      { width: right - left, align: 'center' }
    );

  const bytes = await pdfBytes(doc);
  // The A4 size is fixed by the layout above; this keeps the intent visible.
  void A4;

  return new NextResponse(new Uint8Array(bytes), {
    headers: pdfHeaders(
      `Receipt-${receiptNo}.pdf`,
      bytes.length,
      request.nextUrl.searchParams.get('mode') === 'print' ? 'inline' : 'download'
    ),
  });
}
