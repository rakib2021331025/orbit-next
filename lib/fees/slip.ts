import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { setting, settingLocalized } from '@/lib/settings';
import { translate, type Lang } from '@/lib/i18n';
import { formatDate, formatMoney, pickLocalized, toLocalDigits } from '@/lib/i18n/format';
import { formatPhone } from '@/lib/site/url';
import { FONT_BOLD, FONT_REGULAR, brand, drawTable, newPdf, pdfBytes } from '@/lib/pdf/doc';
import { feeLabel, rowDue } from './core';

/**
 * The due slip, from fee_slip.php and fee_student_summary() / fee_slip_html().
 *
 * A slip lists what a student still OWES — unpaid charges and the balance of
 * part-paid ones. It is not a receipt, and says so in red at the bottom: a slip
 * that could pass for a receipt is a document a parent could wave at the office
 * as proof of payment.
 */

export interface SlipItem {
  rootId: number;
  label: string;
  dueDate: Date | null;
  overdue: boolean;
  amount: number;
  discount: number;
  paid: number;
  due: number;
}

export interface SlipSummary {
  items: SlipItem[];
  due: number;
  paid: number;
  overdueDue: number;
  records: number;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Everything one student owes, one item per charge.
 *
 * A charge paid in parts is ONE item: every row whose `parent_payment_id` points
 * at a charge is folded into it, and the due date is that of the latest row still
 * carrying money. Totals match `paymentSummary()` so the slip and the portal never
 * disagree about the amount.
 */
export async function studentFeeSummary(studentId: number, lang: Lang): Promise<SlipSummary> {
  const out: SlipSummary = { items: [], due: 0, paid: 0, overdueDue: 0, records: 0 };

  let rows: Awaited<ReturnType<typeof prisma.payment.findMany>> = [];
  try {
    rows = await prisma.payment.findMany({ where: { student_id: studentId }, orderBy: { id: 'asc' } });
  } catch {
    return out;
  }
  out.records = rows.length;

  const planIds = [...new Set(rows.map((r) => r.installment_plan_id).filter((id): id is number => id !== null))];
  const plans =
    planIds.length > 0
      ? await prisma.installmentPlan
          .findMany({ where: { id: { in: planIds } }, select: { id: true, title: true, installments: true } })
          .catch(() => [])
      : [];
  const planById = new Map(plans.map((plan) => [plan.id, plan]));

  const byId = new Map(rows.map((row) => [row.id, row]));
  const groups = new Map<number, typeof rows>();
  for (const row of rows) {
    const parent = row.parent_payment_id ?? 0;
    const root = parent > 0 && byId.has(parent) ? parent : row.id;
    groups.set(root, [...(groups.get(root) ?? []), row]);
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (const [rootId, list] of groups) {
    let due = 0;
    let paid = 0;
    let collect: (typeof rows)[number] | null = null;
    for (const row of list) {
      const owed = rowDue(row);
      due += owed;
      if (row.payment_status === 'paid') paid += Number(row.amount ?? 0);
      if (owed > 0) collect = row;
    }
    out.due += due;
    out.paid += paid;
    if (due <= 0 || collect === null) continue;

    const root = byId.get(rootId)!;
    const plan = root.installment_plan_id !== null ? planById.get(root.installment_plan_id) : undefined;
    const discount = Number(root.discount_amount ?? 0);
    const dueDate = collect.due_date ?? root.due_date ?? null;
    const overdue = dueDate !== null && dueDate < today;
    if (overdue) out.overdueDue += due;

    out.items.push({
      rootId,
      label: feeLabel(
        { ...root, plan_title: plan?.title ?? null, plan_installments: plan?.installments ?? null },
        lang
      ),
      dueDate,
      overdue,
      amount: round2(paid + due + discount),
      discount,
      paid: round2(paid),
      due: round2(due),
    });
  }

  // Soonest due first; undated charges last.
  out.items.sort((a, b) => {
    const da = a.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const db = b.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return da === db ? a.rootId - b.rootId : da - db;
  });
  out.due = round2(out.due);
  out.paid = round2(out.paid);
  out.overdueDue = round2(out.overdueDue);
  return out;
}

export interface SlipStudent {
  id: number;
  displayId: string;
  name: string;
  course: string;
  batch: string;
  phone: string;
  guardianPhone: string;
}

/** The student as the slip names them, or null when there is no such student. */
export async function slipStudent(studentId: number, lang: Lang): Promise<SlipStudent | null> {
  const student = await prisma.student
    .findUnique({
      where: { id: studentId },
      select: {
        id: true,
        student_id_no: true,
        name: true,
        name_bn: true,
        phone: true,
        guardian_phone: true,
        course: true,
        batch: true,
        batch_id: true,
      },
    })
    .catch(() => null);
  if (!student) return null;

  // The batch on the record (batches carry their course); failing that, the
  // latest active enrolment's placement — the order orbit_report_placement_sql() uses.
  const recordBatch =
    student.batch_id !== null
      ? await prisma.batch
          .findUnique({ where: { id: student.batch_id }, select: { name: true, name_bn: true, course_id: true } })
          .catch(() => null)
      : null;

  const enrolment = recordBatch
    ? null
    : await prisma.enrollment
        .findFirst({
          where: { student_id: studentId, status: 'active' },
          orderBy: { id: 'desc' },
          select: {
            course_name: true,
            batch_name: true,
            course: { select: { name: true, name_bn: true } },
            batch: { select: { name: true, name_bn: true } },
          },
        })
        .catch(() => null);

  const recordCourse =
    recordBatch?.course_id != null
      ? await prisma.course
          .findUnique({ where: { id: recordBatch.course_id }, select: { name: true, name_bn: true } })
          .catch(() => null)
      : null;

  const batchRow = recordBatch ?? enrolment?.batch ?? null;
  const courseRow = recordCourse ?? enrolment?.course ?? null;
  const prefix = await setting('student_id_prefix', 'STU');

  return {
    id: student.id,
    displayId:
      (student.student_id_no ?? '').trim() !== ''
        ? student.student_id_no!.trim()
        : `${prefix}-${String(student.id).padStart(5, '0')}`,
    name: pickLocalized(student, 'name', lang),
    course: courseRow ? pickLocalized(courseRow, 'name', lang) : (enrolment?.course_name ?? student.course ?? '').trim(),
    batch: batchRow ? pickLocalized(batchRow, 'name', lang) : (enrolment?.batch_name ?? student.batch ?? '').trim(),
    phone: (student.phone ?? '').trim(),
    guardianPhone: (student.guardian_phone ?? '').trim(),
  };
}

/** One A4 page per student. */
export async function feeSlipPdf(
  docs: { student: SlipStudent; summary: SlipSummary }[],
  lang: Lang
): Promise<Buffer> {
  const t = (key: string, vars?: Record<string, string>) => translate(lang, key, vars);
  const money = (value: number) => formatMoney(value, lang);

  const [details, tagline, bkash, nagad, instructions] = await Promise.all([
    brand(lang),
    settingLocalized('institute_tagline', '', lang),
    setting('bkash_number', ''),
    setting('nagad_number', ''),
    settingLocalized('payment_instructions', '', lang),
  ]);

  const title = t('fees.slip_title') + (docs.length === 1 ? ` ${docs[0].student.displayId}` : '');
  const doc = await newPdf({ title, author: details.institute });

  docs.forEach(({ student, summary }, index) => {
    if (index > 0) doc.addPage();

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;

    /* --------------------------------------------------- dark header */
    const headerHeight = 76;
    doc.rect(0, 0, doc.page.width, headerHeight).fill('#062c19');
    let textLeft = left;
    if (details.logo !== null) {
      try {
        doc.image(details.logo, left, 14, { fit: [48, 48] });
        textLeft = left + 58;
      } catch {
        // A logo that will not decode must not stop a slip.
      }
    }
    doc.font(FONT_BOLD).fontSize(16).fillColor('#ffffff').text(details.institute, textLeft, 14, {
      width: right - textLeft - 160,
    });
    const contact = [details.address, details.phone !== '' ? formatPhone(details.phone) : '']
      .filter((part) => part.trim() !== '')
      .join(' · ');
    for (const line of [tagline.trim(), contact]) {
      if (line !== '') {
        doc.font(FONT_REGULAR).fontSize(8).fillColor('#d9e8de').text(line, textLeft, doc.y + 1, {
          width: right - textLeft - 160,
        });
      }
    }
    doc.font(FONT_BOLD).fontSize(14).fillColor('#fedc02').text(t('fees.slip_title'), right - 160, 20, {
      width: 160,
      align: 'right',
    });
    doc
      .font(FONT_REGULAR)
      .fontSize(8)
      .fillColor('#d9e8de')
      .text(t('fees.slip_generated', { date: formatDate(new Date(), 'd M Y', lang) }), right - 160, doc.y + 2, {
        width: 160,
        align: 'right',
      });

    /* ------------------------------------------------ the student */
    let y = headerHeight + 16;
    doc.font(FONT_BOLD).fontSize(11).fillColor('#062c19').text(t('rcpt.student'), left, y);
    y = doc.y + 4;

    const pairs: [string, string][] = (
      [
        [t('common.student_id'), student.displayId],
        [t('rcpt.name'), student.name],
        [t('common.course'), student.course],
        [t('common.batch'), student.batch],
        [t('common.mobile'), student.phone],
        [t('fees.guardian_phone'), student.guardianPhone],
      ] as [string, string][]
    ).filter((pair) => pair[1].trim() !== '');

    for (const [label, value] of pairs) {
      doc.rect(left, y, 120, 18).fillAndStroke('#f1f6f2', '#d5e0d8');
      doc.rect(left + 120, y, width - 120, 18).stroke('#d5e0d8');
      doc.font(FONT_REGULAR).fontSize(9).fillColor('#46524b').text(label, left + 6, y + 5, { width: 110, lineBreak: false });
      doc.font(FONT_BOLD).fontSize(9.5).fillColor('#0f1f16').text(value, left + 126, y + 4.5, {
        width: width - 132,
        lineBreak: false,
      });
      y += 18;
    }

    /* ------------------------------------------------ what is owed */
    y += 12;
    doc.font(FONT_BOLD).fontSize(11).fillColor('#062c19').text(t('fees.slip_items'), left, y);
    y = doc.y + 4;

    if (summary.items.length === 0) {
      doc.rect(left, y, width, 22).fillAndStroke('#ecfdf3', '#d5e0d8');
      doc.font(FONT_REGULAR).fontSize(9.5).fillColor('#14532d').text(t('fees.no_dues'), left + 8, y + 6);
      y += 30;
    } else {
      y = drawTable(
        doc,
        [
          { header: '#', width: 5, align: 'center' },
          { header: t('fees.col_for'), width: 30 },
          { header: t('fees.col_due_date'), width: 17 },
          { header: t('common.amount'), width: 12, align: 'right' },
          { header: t('fees.col_discount'), width: 12, align: 'right' },
          { header: t('fees.col_paid'), width: 12, align: 'right' },
          { header: t('fees.col_due'), width: 12, align: 'right' },
        ],
        summary.items.map((item, i) => [
          toLocalDigits(i + 1, lang),
          item.label,
          // A table row is one line high, so "overdue" is a mark explained below
          // the table rather than a word that spills out of the cell.
          (item.dueDate ? formatDate(item.dueDate, 'd M Y', lang) : '—') + (item.overdue ? ' *' : ''),
          money(item.amount),
          item.discount > 0 ? money(item.discount) : '—',
          item.paid > 0 ? money(item.paid) : '—',
          money(item.due),
        ]),
        y
      );
      if (summary.items.some((item) => item.overdue)) {
        doc.font(FONT_REGULAR).fontSize(8.5).fillColor('#b91c1c').text(`* ${t('fees.overdue')}`, left, y - 4);
        y = doc.y + 6;
      }
    }

    /* ---------------------------------------------------- the total */
    const boxHeight = summary.overdueDue > 0 ? 44 : 34;
    doc.rect(left, y, width, boxHeight).lineWidth(1.4).fillAndStroke('#fff7e6', '#b45309');
    doc.font(FONT_BOLD).fontSize(10.5).fillColor('#7c2d12').text(t('fees.total_due'), left + 12, y + 10);
    if (summary.overdueDue > 0) {
      doc
        .font(FONT_REGULAR)
        .fontSize(9)
        .fillColor('#b91c1c')
        .text(t('fees.overdue_part', { amount: money(summary.overdueDue) }), left + 12, y + 25);
    }
    doc.font(FONT_BOLD).fontSize(18).fillColor('#7c2d12').text(money(summary.due), left, y + 7, {
      width: width - 12,
      align: 'right',
    });
    y += boxHeight + 14;

    /* ------------------------------------------------ how to pay */
    const payLines: [string, string][] = (
      [
        [t('enroll.bkash'), bkash.trim()],
        [t('enroll.nagad'), nagad.trim()],
      ] as [string, string][]
    ).filter((line) => line[1] !== '');
    if (payLines.length > 0 || instructions.trim() !== '') {
      doc.font(FONT_BOLD).fontSize(11).fillColor('#062c19').text(t('fees.how_to_pay'), left, y);
      y = doc.y + 4;
      for (const [label, value] of payLines) {
        doc.font(FONT_REGULAR).fontSize(9).fillColor('#46524b').text(`${label}: `, left, y, { continued: true });
        doc.font(FONT_BOLD).fontSize(10).fillColor('#0f1f16').text(value);
        y = doc.y + 2;
      }
      if (instructions.trim() !== '') {
        doc.font(FONT_REGULAR).fontSize(9).fillColor('#46524b').text(instructions.trim(), left, y, { width });
        y = doc.y + 4;
      }
    }

    /* ------------------------------------------------- the warning */
    y += 18;
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.6).strokeColor('#d5e0d8').stroke();
    doc.font(FONT_BOLD).fontSize(9).fillColor('#b91c1c').text(t('fees.slip_not_receipt'), left, y + 6, {
      width,
      align: 'center',
    });
    doc
      .font(FONT_REGULAR)
      .fontSize(8.5)
      .fillColor('#5b6961')
      .text(t('fees.slip_printed', { date: formatDate(new Date(), 'd M Y, h:i A', lang) }), left, doc.y + 2, {
        width,
        align: 'center',
      });
  });

  return pdfBytes(doc);
}
