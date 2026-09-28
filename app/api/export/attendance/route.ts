import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/prisma';
import { getTranslator } from '@/lib/i18n';
import { XlsxBook, xlsxHeaders, makeCsv, csvHeaders } from '@/lib/export/xlsx';
import {
  reportFilters,
  reportWhere,
  reportCount,
  reportRecords,
  studentSummaries,
} from '@/lib/attendance/report';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The attendance export, from admin/export_attendance.php.
 *
 * Same filters as the report screen, two formats:
 *
 *   xlsx (default) — a workbook with a **Records** sheet and a **Summary** sheet
 *   csv            — the records only, UTF-8 with a BOM so Excel shows Bangla
 *
 * The 100,000-record ceiling is the original's, and it is a real limit rather
 * than a guess: past it the request holds a database cursor and a few hundred MB
 * of strings for long enough to matter. The report screen tells the admin to
 * narrow the range.
 */
const MAX_RECORDS = 100_000;

/** A student's ID, or a stable stand-in so an export row always identifies someone. */
function displayId(idNo: string | null, id: number): string {
  const clean = (idNo ?? '').trim();
  return clean !== '' ? clean : `STU-${String(id).padStart(5, '0')}`;
}

export async function GET(request: NextRequest) {
  // Exports leave the building, so the guard runs before anything is read.
  await requireAdmin();

  const t = await getTranslator();
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const filters = await reportFilters(params);
  const where = await reportWhere(filters);

  if ((await reportCount(where)) > MAX_RECORDS) {
    return new NextResponse(t.t('att.export_too_many'), { status: 413 });
  }

  const [records, summaries] = await Promise.all([
    reportRecords(where, MAX_RECORDS),
    studentSummaries(where),
  ]);

  // Which batch each record belongs to, resolved once for the whole export.
  const batchIds = [...new Set(records.map((row) => row.batch_id).filter((id) => id > 0))];
  const courseIds = [
    ...new Set(records.map((row) => row.course_id).filter((id): id is number => !!id)),
  ];
  const [batches, courses] = await Promise.all([
    batchIds.length > 0
      ? prisma.batch
          .findMany({ where: { id: { in: batchIds } }, select: { id: true, name: true } })
          .catch(() => [])
      : [],
    courseIds.length > 0
      ? prisma.course
          .findMany({ where: { id: { in: courseIds } }, select: { id: true, name: true } })
          .catch(() => [])
      : [],
  ]);
  const batchName = new Map(batches.map((batch) => [batch.id, batch.name]));
  const courseName = new Map(courses.map((course) => [course.id, course.name]));

  const statusLabels = {
    present: t.t('attendance.present'),
    late: t.t('attendance.late'),
    half_day: t.t('attendance.half_day'),
    absent: t.t('attendance.absent'),
  };

  const period =
    filters.from !== '' || filters.to !== ''
      ? `${filters.from !== '' ? t.date(filters.from, 'd M Y') : '…'} – ${
          filters.to !== '' ? t.date(filters.to, 'd M Y') : '…'
        }`
      : t.t('att.all_dates');

  const recordRows = records.map((row) => [
    displayId(row.student.student_id_no, row.student.id),
    t.pick(row.student, 'name'),
    // The linked course, else the free text on the student record.
    (row.course_id ? courseName.get(row.course_id) : undefined) ?? row.student.course ?? '',
    row.batch_id > 0 ? (batchName.get(row.batch_id) ?? '') : t.t('att.unassigned'),
    row.attendance_date,
    row.class_label ?? '',
    row.status ?? '',
    row.note ?? '',
  ]);

  const filename = `attendance-${new Date().toISOString().slice(0, 10)}`;

  if ((params.format ?? 'xlsx') === 'csv') {
    const csv = makeCsv([
      [
        t.t('common.student_id'),
        t.t('common.student'),
        t.t('common.course'),
        t.t('common.batch'),
        t.t('common.date'),
        t.t('att.class_label'),
        t.t('common.status'),
        t.t('common.note'),
      ],
      ...recordRows.map((row) => [
        row[0] as string,
        row[1] as string,
        row[2] as string,
        row[3] as string,
        row[4] instanceof Date ? (row[4] as Date).toISOString().slice(0, 10) : String(row[4] ?? ''),
        row[5] as string,
        // The CSV carries the readable label, not the stored key.
        statusLabels[row[6] as keyof typeof statusLabels] ?? String(row[6] ?? ''),
        row[7] as string,
      ]),
    ]);

    return new NextResponse(new Uint8Array(csv), {
      headers: csvHeaders(`${filename}.csv`, csv.length),
    });
  }

  const book = new XlsxBook(t.t('att.export_title'));

  book.addSheet(
    t.t('att.records'),
    [
      { header: t.t('common.student_id'), width: 18 },
      { header: t.t('common.student'), width: 26 },
      { header: t.t('common.course'), width: 22 },
      { header: t.t('common.batch'), width: 20 },
      { header: t.t('common.date'), width: 14, type: 'date' },
      { header: t.t('att.class_label'), width: 22 },
      { header: t.t('common.status'), width: 12, type: 'status', labels: statusLabels },
      { header: t.t('common.note'), width: 28 },
    ],
    recordRows,
    {
      title: t.t('att.export_title'),
      subtitle: `${t.t('att.export_period', { period })} · ${t.t('att.export_generated', {
        date: t.date(new Date(), 'd M Y, h:i A'),
      })}`,
    }
  );

  book.addSheet(
    t.t('att.summary'),
    [
      { header: t.t('common.student_id'), width: 18 },
      { header: t.t('common.student'), width: 26 },
      { header: t.t('common.course'), width: 22 },
      { header: t.t('common.batch'), width: 20 },
      { header: t.t('att.records'), width: 12, type: 'integer' },
      { header: t.t('attendance.present'), width: 10, type: 'integer' },
      { header: t.t('attendance.late'), width: 10, type: 'integer' },
      { header: t.t('attendance.half_day'), width: 10, type: 'integer' },
      { header: t.t('attendance.absent'), width: 10, type: 'integer' },
      { header: t.t('att.percentage'), width: 14, type: 'percent' },
    ],
    summaries.map((row) => [
      displayId(row.studentIdNo, row.studentId),
      row.name,
      row.courses.join(', '),
      row.batches.join(', '),
      row.totals.total,
      row.totals.present,
      row.totals.late,
      row.totals.half_day,
      row.totals.absent,
      Math.round(row.totals.rate * 100) / 100,
    ]),
    {
      title: t.t('att.export_title'),
      subtitle: t.t('att.export_period', { period }),
    }
  );

  const bytes = book.build();
  return new NextResponse(new Uint8Array(bytes), {
    headers: xlsxHeaders(`${filename}.xlsx`, bytes.length),
  });
}
