import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { activeBranchId } from '@/lib/branch/active';
import { attendanceWeight, ATTENDANCE_STATUSES, isAttendanceStatus } from './register';

/**
 * Attendance reporting, from admin/attendance_report.php and the REPORTS half of
 * includes/attendance_lib.php.
 *
 * Two details in the filters matter more than they look:
 *
 *   1. **A course filter has to reach records made before batches existed.** Those
 *      rows carry no `course_id` at all, so they are matched through the course
 *      NAME on the student record. Without that, an old course's report is empty.
 *   2. **`batch_id = 0` means "not in a batch"**, which is a real filter value and
 *      not the same as "any batch" — hence `'' | number` rather than just a number.
 *
 * The report follows the branch in focus, because attendance belongs to the place
 * the class was held.
 */

export interface ReportFilters {
  courseId: number;
  /** '' = any batch, 0 = students in no batch, n = that batch. */
  batchId: '' | number;
  student: string;
  studentId: number;
  from: string;
  to: string;
  status: string;
  branchId: number;
}

export interface AttendanceTotals {
  present: number;
  late: number;
  half_day: number;
  absent: number;
  total: number;
  attended: number;
  rate: number;
}

async function safe<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

function isDate(value: unknown): boolean {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Validated filters from a query string. */
export async function reportFilters(query: Record<string, string | undefined>): Promise<ReportFilters> {
  const batch = query.batch ?? '';
  let from = isDate(query.from) ? (query.from as string) : '';
  let to = isDate(query.to) ? (query.to as string) : '';

  // A range typed backwards is a typo, not an empty report.
  if (from !== '' && to !== '' && from > to) [from, to] = [to, from];

  return {
    courseId: /^\d+$/.test(query.course ?? '') ? Number(query.course) : 0,
    batchId: /^\d+$/.test(batch) ? Number(batch) : '',
    student: (query.student ?? '').trim().slice(0, 100),
    studentId: /^\d+$/.test(query.student_id ?? '') ? Number(query.student_id) : 0,
    from,
    to,
    status: isAttendanceStatus(query.status) ? query.status : '',
    branchId: await activeBranchId(),
  };
}

/** The same filters as a query object, for export links and pagination. */
export function filtersQuery(filters: ReportFilters): Record<string, string | undefined> {
  return {
    course: filters.courseId > 0 ? String(filters.courseId) : undefined,
    batch: filters.batchId === '' ? undefined : String(filters.batchId),
    student: filters.student !== '' ? filters.student : undefined,
    student_id: filters.studentId > 0 ? String(filters.studentId) : undefined,
    from: filters.from !== '' ? filters.from : undefined,
    to: filters.to !== '' ? filters.to : undefined,
    status: filters.status !== '' ? filters.status : undefined,
  };
}

/** The Prisma `where` for a set of report filters. */
export async function reportWhere(filters: ReportFilters): Promise<Record<string, unknown>> {
  const and: Record<string, unknown>[] = [];

  if (filters.courseId > 0) {
    // Records from before batches existed have no course_id; they are matched by
    // the course name on the student.
    const course = await prisma.course
      .findUnique({ where: { id: filters.courseId }, select: { name: true } })
      .catch(() => null);

    const byBatch = await safe(
      () =>
        prisma.batch.findMany({
          where: { course_id: filters.courseId },
          select: { id: true },
        }),
      []
    );

    and.push({
      OR: [
        { course_id: filters.courseId },
        ...(byBatch.length > 0 ? [{ batch_id: { in: byBatch.map((batch) => batch.id) } }] : []),
        ...(course
          ? [{ AND: [{ course_id: null }, { batch_id: 0 }, { student: { course: course.name } }] }]
          : []),
      ],
    });
  }

  if (filters.batchId !== '') and.push({ batch_id: filters.batchId });

  if (filters.studentId > 0) {
    and.push({ student_id: filters.studentId });
  } else if (filters.student !== '') {
    and.push({
      student: {
        OR: [
          { name: { contains: filters.student, mode: 'insensitive' } },
          { name_bn: { contains: filters.student, mode: 'insensitive' } },
          { student_id_no: { contains: filters.student, mode: 'insensitive' } },
          { phone: { contains: filters.student } },
        ],
      },
    });
  }

  if (filters.from !== '' || filters.to !== '') {
    and.push({
      attendance_date: {
        ...(filters.from !== '' ? { gte: new Date(`${filters.from}T00:00:00.000Z`) } : {}),
        ...(filters.to !== '' ? { lte: new Date(`${filters.to}T00:00:00.000Z`) } : {}),
      },
    });
  }

  if (filters.status !== '') and.push({ status: filters.status });

  // The branch the class was held at, stored on the register itself.
  if (filters.branchId > 0) and.push({ branch_id: filters.branchId });

  return and.length > 0 ? { AND: and } : {};
}

export function summarise(counts: Record<string, number>): AttendanceTotals {
  const present = counts.present ?? 0;
  const late = counts.late ?? 0;
  const halfDay = counts.half_day ?? 0;
  const absent = counts.absent ?? 0;
  const total = present + late + halfDay + absent;
  const attended = present * 1 + late * 1 + halfDay * 0.5;

  return {
    present,
    late,
    half_day: halfDay,
    absent,
    total,
    attended,
    rate: total > 0 ? (attended / total) * 100 : 0,
  };
}

export async function reportTotals(where: Record<string, unknown>): Promise<AttendanceTotals> {
  const grouped = await safe(
    () => prisma.attendance.groupBy({ by: ['status'], where, _count: { _all: true } }),
    []
  );
  const counts: Record<string, number> = {};
  for (const row of grouped) counts[row.status ?? 'absent'] = row._count._all;
  return summarise(counts);
}

export async function reportCount(where: Record<string, unknown>): Promise<number> {
  return safe(() => prisma.attendance.count({ where }), 0);
}

/** The individual records, newest first. */
export async function reportRecords(
  where: Record<string, unknown>,
  take: number,
  skip = 0
) {
  return safe(
    () =>
      prisma.attendance.findMany({
        where,
        orderBy: [{ attendance_date: 'desc' }, { id: 'desc' }],
        take,
        skip,
        select: {
          id: true,
          attendance_date: true,
          status: true,
          class_label: true,
          note: true,
          batch_id: true,
          course_id: true,
          student: {
            select: {
              id: true,
              student_id_no: true,
              name: true,
              name_bn: true,
              phone: true,
              course: true,
            },
          },
        },
      }),
    []
  );
}

export type ReportRecord = Awaited<ReturnType<typeof reportRecords>>[number];

export interface StudentSummaryRow {
  studentId: number;
  studentIdNo: string | null;
  name: string;
  nameBn: string | null;
  courses: string[];
  batches: string[];
  totals: AttendanceTotals;
  firstDate: Date | null;
  lastDate: Date | null;
}

/**
 * One row per student, with their counts and rate over the filtered period.
 *
 * Grouped in the database by student and status — two grouped queries rather than
 * one per student, because a term's report for a large institute is tens of
 * thousands of rows.
 */
export async function studentSummaries(
  where: Record<string, unknown>
): Promise<StudentSummaryRow[]> {
  const grouped = await safe(
    () =>
      prisma.attendance.groupBy({
        by: ['student_id', 'status'],
        where,
        _count: { _all: true },
        _min: { attendance_date: true },
        _max: { attendance_date: true },
      }),
    []
  );
  if (grouped.length === 0) return [];

  const studentIds = [...new Set(grouped.map((row) => row.student_id))];
  const [students, batchLinks] = await Promise.all([
    safe(
      () =>
        prisma.student.findMany({
          where: { id: { in: studentIds } },
          select: { id: true, student_id_no: true, name: true, name_bn: true, course: true },
        }),
      []
    ),
    // Which batches and courses each student's records belong to.
    safe(
      () =>
        prisma.attendance.findMany({
          where,
          distinct: ['student_id', 'batch_id', 'course_id'],
          select: { student_id: true, batch_id: true, course_id: true },
        }),
      []
    ),
  ]);

  const batchIds = [...new Set(batchLinks.map((row) => row.batch_id).filter((id) => id > 0))];
  const courseIds = [...new Set(batchLinks.map((row) => row.course_id).filter((id): id is number => !!id))];

  const [batches, courses] = await Promise.all([
    batchIds.length > 0
      ? safe(
          () => prisma.batch.findMany({ where: { id: { in: batchIds } }, select: { id: true, name: true } }),
          []
        )
      : [],
    courseIds.length > 0
      ? safe(
          () => prisma.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, name: true } }),
          []
        )
      : [],
  ]);

  const batchName = new Map(batches.map((batch) => [batch.id, batch.name]));
  const courseName = new Map(courses.map((course) => [course.id, course.name]));
  const studentById = new Map(students.map((student) => [student.id, student]));

  const rows = new Map<number, StudentSummaryRow>();

  for (const row of grouped) {
    const student = studentById.get(row.student_id);
    if (!student) continue;

    const existing =
      rows.get(row.student_id) ??
      ({
        studentId: student.id,
        studentIdNo: student.student_id_no,
        name: student.name,
        nameBn: student.name_bn,
        courses: [],
        batches: [],
        totals: summarise({}),
        firstDate: null,
        lastDate: null,
      } satisfies StudentSummaryRow);

    const counts: Record<string, number> = {
      present: existing.totals.present,
      late: existing.totals.late,
      half_day: existing.totals.half_day,
      absent: existing.totals.absent,
    };
    counts[row.status ?? 'absent'] = (counts[row.status ?? 'absent'] ?? 0) + row._count._all;
    existing.totals = summarise(counts);

    const first = row._min.attendance_date;
    const last = row._max.attendance_date;
    if (first && (existing.firstDate === null || first < existing.firstDate)) existing.firstDate = first;
    if (last && (existing.lastDate === null || last > existing.lastDate)) existing.lastDate = last;

    rows.set(row.student_id, existing);
  }

  for (const link of batchLinks) {
    const row = rows.get(link.student_id);
    if (!row) continue;

    const batch = link.batch_id > 0 ? batchName.get(link.batch_id) : undefined;
    if (batch && !row.batches.includes(batch)) row.batches.push(batch);

    // The linked course, else the free-text course on the student record.
    const course = link.course_id ? courseName.get(link.course_id) : studentById.get(link.student_id)?.course;
    if (course && course.trim() !== '' && !row.courses.includes(course)) row.courses.push(course);
  }

  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export { ATTENDANCE_STATUSES, attendanceWeight };
