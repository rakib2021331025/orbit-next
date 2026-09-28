import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { getLang, isLang, translate, type Lang } from '@/lib/i18n';
import { formatDate, formatNumber, pickLocalized, toLocalDigits } from '@/lib/i18n/format';
import { GRADE_SCALE, formatMark, gradeForPercentage } from '@/lib/results/grades';
import { ensureStudentId } from '@/lib/students/id';
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
  pdfHeaders,
} from './doc';

/**
 * The name-based marksheet, from the second half of admin/marksheet.php.
 *
 * `exam_results` rows that predate monthly exams carry an `exam_name` and no
 * `monthly_exam_id`, so a sheet is built by **grouping on that name** and
 * totalling, which is the same arithmetic the student's own results page does.
 *
 * Two rules from the original are easy to lose:
 *
 *   - **A stored grade is shown exactly as it was entered.** A row without one
 *     is graded for display only, on the same scale monthly exams use.
 *   - **Any F makes the GPA 0.00**, which is the local convention these sheets
 *     were always printed against.
 *
 * Nothing is written back except a Student ID for a student who predates them,
 * so the sheet never shows a blank identifier.
 */

/** The grade point of a letter somebody typed, or null when it is off the scale. */
function pointForGrade(grade: string): number | null {
  const key = grade.trim().toUpperCase();
  const band = GRADE_SCALE.find((row) => row[1] === key);
  return band ? band[2] : null;
}

export async function legacyMarksheet(
  request: NextRequest,
  studentId: number
): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const asked = params.get('lang');
  const lang: Lang = isLang(asked) ? asked : await getLang();
  const t = (key: string, vars?: Record<string, string>) => translate(lang, key, vars);
  const digits = (value: string | number) => toLocalDigits(value, lang);

  const student = await prisma.student
    .findUnique({ where: { id: studentId } })
    .catch(() => null);
  if (!student) notFound();

  // students.batch_id carries no foreign key, so the batch is a second read.
  const batchRow =
    student.batch_id !== null
      ? await prisma.batch
          .findUnique({
            where: { id: student.batch_id },
            select: { name: true, name_bn: true, course: { select: { name: true, name_bn: true } } },
          })
          .catch(() => null)
      : null;

  let idNo = (student.student_id_no ?? '').trim();
  if (idNo === '') {
    try {
      idNo = await ensureStudentId(student.id);
    } catch {
      idNo = `STU-${String(student.id).padStart(5, '0')}`;
    }
  }

  // Which examinations this student has results for, newest first.
  const grouped = await prisma.examResult
    .groupBy({
      by: ['exam_name'],
      where: { student_id: studentId },
      _max: { exam_date: true },
      _count: { _all: true },
    })
    .catch(() => []);

  if (grouped.length === 0) {
    return NextResponse.json({ error: t('ms.not_available') }, { status: 404 });
  }

  grouped.sort((a, b) => {
    const left = a._max.exam_date?.getTime() ?? 0;
    const right = b._max.exam_date?.getTime() ?? 0;
    return right - left || a.exam_name.localeCompare(b.exam_name);
  });

  const wanted = (params.get('name') ?? '').trim();
  // A name this student has no results for falls back to the most recent.
  const chosen = grouped.find((row) => row.exam_name === wanted) ?? grouped[0];

  const rows = await prisma.examResult
    .findMany({
      where: { student_id: studentId, exam_name: chosen.exam_name },
      orderBy: { subject: 'asc' },
    })
    .catch(() => []);

  if (rows.length === 0) {
    return NextResponse.json({ error: t('ms.not_available') }, { status: 404 });
  }

  let totalFull = 0;
  let totalObtained = 0;
  let failed = false;
  let points = 0;
  let counted = 0;

  const table = rows.map((row, index) => {
    const full = Number(row.total_marks);
    const obtained = row.is_absent ? 0 : Number(row.marks_obtained);
    const percentage = full > 0 ? (obtained / full) * 100 : 0;

    totalFull += full;
    totalObtained += obtained;

    const stored = (row.grade ?? '').trim();
    const display = row.is_absent ? 'F' : stored !== '' ? stored : gradeForPercentage(percentage).grade;
    if (display.toUpperCase() === 'F') failed = true;

    const point = pointForGrade(display);
    if (point !== null) {
      points += point;
      counted += 1;
    }

    return [
      digits(index + 1),
      row.subject,
      formatMark(full, digits),
      row.is_absent ? t('result.absent') : formatMark(obtained, digits),
      `${formatNumber(Math.round(percentage * 10) / 10, 1, lang)}%`,
      display,
    ];
  });

  const overall = totalFull > 0 ? (totalObtained / totalFull) * 100 : 0;
  // Any F is a zero GPA, whatever the other subjects say.
  const gpa = failed ? 0 : counted > 0 ? Math.round((points / counted) * 100) / 100 : null;

  table.push([
    '',
    t('result.total'),
    formatMark(totalFull, digits),
    formatMark(totalObtained, digits),
    `${formatNumber(Math.round(overall * 10) / 10, 1, lang)}%`,
    gpa !== null ? formatNumber(gpa, 2, lang) : '—',
  ]);

  const details = await brand(lang);
  const doc = await newPdf({
    title: `${t('ms.title')} — ${student.name}`,
    author: details.institute,
  });

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;

  let y = drawLetterhead(doc, details, t('ms.title'));

  const course =
    batchRow?.course !== null && batchRow?.course !== undefined
      ? pickLocalized(batchRow.course, 'name', lang)
      : (student.course ?? '');
  const batch = batchRow !== null ? pickLocalized(batchRow, 'name', lang) : (student.batch ?? '');

  y = drawPairs(
    doc,
    (
      [
        [t('ms.student_name'), pickLocalized(student, 'name', lang)],
        [t('ms.student_id'), idNo],
        [t('ms.roll'), (student.roll_number ?? '').trim()],
        [t('ms.course'), course],
        [t('ms.batch'), batch],
        [t('ms.exam'), chosen.exam_name],
        [
          t('ms.exam_date'),
          chosen._max.exam_date !== null
            ? formatDate(chosen._max.exam_date, 'd M Y', lang)
            : '',
        ],
      ] as [string, string][]
    ).filter((pair) => pair[1].trim() !== ''),
    y
  );

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
    table,
    y + 4
  );

  const summary: [string, string][] = [
    [t('result.total_marks'), formatMark(totalFull, digits)],
    [t('result.obtained'), formatMark(totalObtained, digits)],
    [t('result.percentage'), `${formatNumber(Math.round(overall * 10) / 10, 1, lang)}%`],
    [t('result.gpa'), gpa !== null ? formatNumber(gpa, 2, lang) : '—'],
    [t('result.result'), failed ? t('result.fail') : t('result.pass')],
  ];

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

  y += Math.ceil(summary.length / 3) * 40 + 10;

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
    })}`
  );

  const bytes = await pdfBytes(doc);

  return new NextResponse(new Uint8Array(bytes), {
    headers: pdfHeaders(
      `Marksheet-${idNo}-${chosen.exam_name}.pdf`,
      bytes.length,
      params.get('format') === 'pdf' ? 'download' : 'inline'
    ),
  });
}
