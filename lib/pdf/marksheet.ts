import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { translate, type Lang } from '@/lib/i18n';
import {
  formatDate,
  formatNumber,
  monthLabel,
  pickLocalized,
  toLocalDigits,
} from '@/lib/i18n/format';
import { formatMark } from '@/lib/results/grades';
import { examResults, type monthlyExam } from '@/lib/results/exam';
import { setting, settingFlag } from '@/lib/settings';
import {
  FONT_BOLD,
  FONT_REGULAR,
  brand,
  drawFooter,
  drawLetterhead,
  drawPairs,
  drawTable,
  newPdf,
  pdfBytes,
} from './doc';

type Exam = NonNullable<Awaited<ReturnType<typeof monthlyExam>>>;

/**
 * One student's marksheet for one monthly exam, as PDF bytes — from
 * includes/marksheet_lib.php.
 *
 * Shared by /api/marksheet (a signed-in student, guardian or admin) and the
 * WhatsApp share link (a signed token). It does NOT authorise: each caller has
 * already decided the reader may see this student's result, and whether a draft
 * exam is allowed. Null means there is nothing to print — a student with no
 * marks has no marksheet, as the original returns nothing rather than a sheet
 * of dashes.
 */
export async function marksheetPdf(
  exam: Exam,
  studentId: number,
  lang: Lang
): Promise<{ bytes: Buffer; filename: string } | null> {
  const examId = exam.id;
  const computation = await examResults(examId);
  const result = computation?.students.get(studentId);
  if (!computation || !result || !result.hasMarks) return null;

  const student = await prisma.student
    .findUnique({ where: { id: studentId } })
    .catch(() => null);
  if (!student) return null;

  const t = (key: string, vars?: Record<string, string>) => translate(lang, key, vars);
  const digits = (value: string | number) => toLocalDigits(value, lang);

  const [details, showAttendance, idPrefix] = await Promise.all([
    brand(lang),
    settingFlag('marksheet_show_attendance', true),
    setting('student_id_prefix', 'STU'),
  ]);

  const [course, batch] = await Promise.all([
    exam.course_id !== null
      ? prisma.course
          .findUnique({ where: { id: exam.course_id }, select: { name: true, name_bn: true } })
          .catch(() => null)
      : null,
    exam.batch_id !== null
      ? prisma.batch
          .findUnique({ where: { id: exam.batch_id }, select: { name: true, name_bn: true } })
          .catch(() => null)
      : null,
  ]);

  // The exam's own course/batch, then the student's record — the original walks
  // the same fallback so a course-wide exam still prints a class.
  const courseName = course ? pickLocalized(course, 'name', lang) : (student.course ?? '');
  const batchName = batch ? pickLocalized(batch, 'name', lang) : (student.batch ?? '');

  const studentNo =
    (student.student_id_no ?? '').trim() !== ''
      ? student.student_id_no!.trim()
      : `${idPrefix}-${String(student.id).padStart(5, '0')}`;

  /* ------------------------------------------- attendance for the month */
  let attendanceLine = '';
  if (showAttendance) {
    const from = new Date(`${exam.exam_month}-01T00:00:00.000Z`);
    const to = new Date(
      Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0, 23, 59, 59, 999)
    );

    const rows = await prisma.attendance
      .findMany({
        where: { student_id: studentId, attendance_date: { gte: from, lte: to } },
        select: { status: true },
      })
      .catch(() => []);

    if (rows.length > 0) {
      const present = rows.filter((row) => row.status === 'present' || row.status === 'late').length;
      const half = rows.filter((row) => row.status === 'half_day').length;
      const share = Math.round(((present + half * 0.5) / rows.length) * 1000) / 10;
      attendanceLine = `${digits(present + half)} / ${digits(rows.length)} · ${formatNumber(share, 1, lang)}%`;
    }
  }

  /* ----------------------------------------------------------- the PDF */
  const doc = await newPdf({
    title: `${t('ms.title')} — ${student.name}`,
    author: details.institute,
  });

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;

  let y = drawLetterhead(doc, details, t('ms.title'));

  const examLabel = `${pickLocalized(exam, 'title', lang)} — ${monthLabel(exam.exam_month, lang)}`;

  y = drawPairs(
    doc,
    (
      [
        [t('ms.student_name'), pickLocalized(student, 'name', lang)],
        [t('ms.student_id'), studentNo],
        [t('ms.roll'), (student.roll_number ?? '').trim()],
        [t('ms.course'), courseName],
        [t('ms.batch'), batchName],
        [t('ms.father'), (student.father_name ?? '').trim()],
        [t('ms.mother'), (student.mother_name ?? '').trim()],
        [t('ms.exam'), examLabel],
        [
          t('ms.exam_date'),
          exam.exam_date !== null ? formatDate(exam.exam_date, 'd M Y', lang) : '',
        ],
        [
          t('ms.attendance', { month: monthLabel(exam.exam_month, lang) }),
          attendanceLine,
        ],
      ] as [string, string][]
    ).filter((pair) => pair[1].trim() !== ''),
    y
  );

  /* --------------------------------------------------------- the marks */
  const rows = result.subjects.map((cell, index) => [
    digits(index + 1),
    pickLocalized(
      { name: cell.subject.subject_name, name_bn: cell.subject.subject_name_bn ?? '' },
      'name',
      lang
    ),
    formatMark(cell.full, digits),
    cell.absent ? t('result.absent') : formatMark(cell.obtained ?? 0, digits),
    cell.percentage !== null ? `${formatNumber(cell.percentage, 1, lang)}%` : '—',
    cell.grade !== '' ? cell.grade : '—',
  ]);

  // The totals line closes the table, as the original's <tfoot> does.
  rows.push([
    '',
    t('result.total'),
    formatMark(result.totalFull, digits),
    formatMark(result.totalObtained, digits),
    `${formatNumber(result.percentage, 1, lang)}%`,
    result.gpa !== null ? formatNumber(result.gpa, 2, lang) : '—',
  ]);

  y = drawTable(
    doc,
    [
      { header: t('ms.sl'), width: 8, align: 'center' },
      { header: t('result.subject'), width: 37 },
      { header: t('result.full_marks'), width: 15, align: 'right' },
      { header: t('result.obtained'), width: 15, align: 'right' },
      { header: '%', width: 13, align: 'right' },
      { header: t('result.grade'), width: 12, align: 'center' },
    ],
    rows,
    y + 4
  );

  /* ------------------------------------------------------- the summary */
  const summary: [string, string][] = [
    [t('result.total_marks'), formatMark(result.totalFull, digits)],
    [t('result.obtained'), formatMark(result.totalObtained, digits)],
    [t('result.percentage'), `${formatNumber(result.percentage, 1, lang)}%`],
    [t('result.gpa'), result.gpa !== null ? formatNumber(result.gpa, 2, lang) : '—'],
    [t('result.grade'), result.grade !== '' ? result.grade : '—'],
    [
      t('result.result'),
      result.failedSubjects > 0
        ? t('result.fail')
        : t(result.complete ? 'result.pass' : 'result.incomplete'),
    ],
  ];

  // The position is printed only when the exam says to show it and the student
  // is actually ranked.
  if (exam.show_position && result.hasPosition && result.position !== null) {
    summary.push([t('result.position'), digits(result.position)]);
  }

  const boxWidth = (right - left) / 3;
  summary.forEach((item, index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x = left + column * boxWidth;
    const boxY = y + row * 40;

    doc.rect(x, boxY, boxWidth - 4, 34).fillAndStroke('#f1f6f2', '#d5e0d8');
    doc.font(FONT_REGULAR).fontSize(8).fillColor('#46524b').text(item[0], x + 6, boxY + 5, {
      width: boxWidth - 16,
    });
    doc.font(FONT_BOLD).fontSize(11).fillColor('#062c19').text(item[1], x + 6, boxY + 17, {
      width: boxWidth - 16,
    });
  });

  y += Math.ceil(summary.length / 3) * 40 + 8;

  if ((exam.remarks ?? '').trim() !== '') {
    doc.font(FONT_REGULAR).fontSize(9).fillColor('#46524b').text(`${t('ms.remarks')}: `, left, y, {
      continued: true,
    });
    doc.font(FONT_REGULAR).fontSize(9).fillColor('#1d2a22').text(exam.remarks!.trim(), {
      width: right - left,
    });
    y = doc.y + 10;
  }

  /* -------------------------------------------------------- signatures */
  const third = (right - left) / 3;
  [t('ms.sign_teacher'), t('ms.sign_controller'), t('ms.sign_director')].forEach(
    (label, index) => {
      const x = left + index * third;
      doc
        .moveTo(x + 12, y + 30)
        .lineTo(x + third - 12, y + 30)
        .lineWidth(0.6)
        .strokeColor('#8a978f')
        .stroke();
      doc
        .font(FONT_REGULAR)
        .fontSize(8)
        .fillColor('#46524b')
        .text(label, x + 12, y + 34, { width: third - 24, align: 'center' });
    }
  );

  drawFooter(
    doc,
    `${t('ms.computer_generated')} · ${t('ms.issued', {
      date: formatDate(new Date(), 'd M Y', lang),
    })} · ${t('ms.reference', { ref: `${exam.id}-${student.id}` })}`
  );

  const bytes = await pdfBytes(doc);
  return { bytes, filename: `Marksheet-${studentNo}-${exam.exam_month}.pdf` };
}
