import 'server-only';
import { cache } from 'react';
import { Prisma, type AdmissionStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { translate, type Lang } from '@/lib/i18n';
import {
  formatDate,
  formatMoney,
  formatNumber,
  monthLabel,
  pickLocalized,
  toLocalDigits,
} from '@/lib/i18n/format';
import { formatMark } from '@/lib/results/grades';
import { examResults, monthlyExam } from '@/lib/results/exam';
import { enrollmentState } from '@/lib/enrollment/list';
import { feeLabel } from '@/lib/fees/core';
import { studentsInBatch, studentsInCourse, studentSearch } from './students';
import {
  REPORT_LIMIT,
  RESULT_CODES,
  methodLabel,
  studentCode,
  ymd,
  type CellValue,
  type ReportColumn,
  type ReportFilters,
  type ReportRow,
  type ReportStat,
  type ReportSummary,
  type ReportType,
} from './core';

/**
 * The five reports themselves, from includes/report_lib.php.
 *
 * Each one answers two questions with the same filters: the summary (how many
 * rows, the headline figures, the totals line) and the rows for a page, a print
 * run or an export. Keeping them side by side is what stops the figure at the
 * top disagreeing with the table underneath.
 */

async function safe<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

/* ------------------------------------------------------------- lookups */

export const reportCourses = cache(async () =>
  safe(
    () =>
      prisma.course.findMany({
        orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, name_bn: true },
      }),
    []
  )
);

export const reportBatches = cache(async () =>
  safe(
    () =>
      prisma.batch.findMany({
        orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
        select: { id: true, course_id: true, name: true, name_bn: true, batch_type: true },
      }),
    []
  )
);

export const reportExams = cache(async () =>
  safe(
    () =>
      prisma.monthlyExam.findMany({
        orderBy: [{ exam_month: 'desc' }, { id: 'desc' }],
        select: { id: true, title: true, title_bn: true, exam_month: true, status: true },
      }),
    []
  )
);

export function examLabel(
  exam: { title: string; title_bn: string | null; exam_month: string },
  lang: Lang
): string {
  return `${pickLocalized(exam, 'title', lang)} — ${monthLabel(exam.exam_month, lang)}`;
}

/** A person's name in the reader's language. */
function personName(name: string, nameBn: string | null, lang: Lang): string {
  return pickLocalized({ name, name_bn: nameBn ?? '' }, 'name', lang);
}

/** "Morning (Online)" with the word translated, as the applicant's label stores it. */
function batchDisplay(
  row: { batch_label: string | null; batch_type: string | null },
  lang: Lang
): string {
  const label = (row.batch_label ?? '').trim();
  const type = row.batch_type ?? '';
  if (label === '' || (type !== 'online' && type !== 'offline')) return label;

  const suffix = type === 'online' ? ' (Online)' : ' (Offline)';
  if (!label.endsWith(suffix)) return label;
  return `${label.slice(0, -suffix.length)} (${translate(lang, `course.type_${type}`)})`;
}

function stat(icon: string, color: string, value: string, label: string): ReportStat {
  return { icon, color, value, label };
}

/**
 * The course and batch to print for a student row.
 *
 * The filter wins when there is one — the student matched it, so that is the
 * course this report is about — then the batch on the record, then the latest
 * active enrolment, and only then the free-text columns a pre-enrolment record
 * still carries.
 */
interface PlacementRow {
  id: number;
  batch_id: number | null;
  legacy_course: string;
  legacy_batch: string;
  enr_course_id: number | null;
  enr_batch_id: number | null;
}

async function placementFor(
  rows: PlacementRow[],
  filters: ReportFilters,
  lang: Lang
): Promise<Map<number, { course: string; batch: string }>> {
  const [courses, batches] = await Promise.all([reportCourses(), reportBatches()]);
  const courseById = new Map(courses.map((course) => [course.id, course]));
  const batchById = new Map(batches.map((batch) => [batch.id, batch]));

  const out = new Map<number, { course: string; batch: string }>();

  for (const row of rows) {
    const batchId = filters.batch > 0 ? filters.batch : (row.batch_id ?? row.enr_batch_id ?? 0);

    let courseId: number;
    if (filters.course > 0) {
      courseId = filters.course;
    } else if (filters.batch > 0 && batchById.has(batchId)) {
      courseId = batchById.get(batchId)?.course_id ?? 0;
    } else {
      // students.batch_id carries no foreign key, so the batch's course comes
      // from the cached batch list rather than from a join.
      courseId =
        (row.batch_id !== null ? (batchById.get(row.batch_id)?.course_id ?? 0) : 0) ||
        (row.enr_course_id ?? 0);
      if (courseId === 0 && batchById.has(batchId)) {
        courseId = batchById.get(batchId)?.course_id ?? 0;
      }
    }

    const course = courseById.get(courseId);
    const batch = batchById.get(batchId);

    out.set(row.id, {
      course: course ? pickLocalized(course, 'name', lang) : row.legacy_course.trim(),
      batch: batch ? pickLocalized(batch, 'name', lang) : row.legacy_batch.trim(),
    });
  }

  return out;
}

/** The select that feeds placementFor(), for one student row. */
const PLACEMENT_SELECT = {
  batch_id: true,
  course: true,
  batch: true,
  enrollment_student: {
    where: { status: 'active' },
    orderBy: [{ enrolled_at: 'desc' }, { id: 'desc' }],
    take: 1,
    select: { course_id: true, batch_id: true },
  },
} satisfies Prisma.StudentSelect;

type PlacementSource = {
  id: number;
  batch_id: number | null;
  course: string;
  batch: string | null;
  enrollment_student: { course_id: number | null; batch_id: number | null }[];
};

function placementRow(row: PlacementSource): PlacementRow {
  const enrolled = row.enrollment_student[0];
  return {
    id: row.id,
    batch_id: row.batch_id,
    legacy_course: row.course ?? '',
    legacy_batch: row.batch ?? '',
    enr_course_id: enrolled?.course_id ?? null,
    enr_batch_id: enrolled?.batch_id ?? null,
  };
}

/* ------------------------------------------------------------ students */

async function studentsWhere(filters: ReportFilters): Promise<Record<string, unknown>> {
  const and: Record<string, unknown>[] = [];

  if (filters.course > 0) {
    const scope = await studentsInCourse(filters.course);
    // A course that no longer exists must narrow to nothing rather than to
    // everything.
    and.push(scope ?? { id: -1 });
  }
  if (filters.batch > 0) and.push(studentsInBatch(filters.batch) ?? { id: -1 });
  if (filters.status !== '') and.push({ student_status: filters.status });

  const search = studentSearch(filters.q);
  if (search) and.push(search);

  return { status: 'approved', ...(and.length > 0 ? { AND: and } : {}) };
}

async function studentsSummary(filters: ReportFilters, lang: Lang): Promise<ReportSummary> {
  const where = await studentsWhere(filters);
  const [count, active] = await Promise.all([
    safe(() => prisma.student.count({ where }), 0),
    safe(() => prisma.student.count({ where: { ...where, student_status: 'Active' } }), 0),
  ]);

  return {
    count,
    stats: [
      stat('bi-people-fill', 'blue', toLocalDigits(count, lang), translate(lang, 'arep.stat_students')),
      stat('bi-person-check-fill', 'green', toLocalDigits(active, lang), translate(lang, 'status.active')),
      stat('bi-person-dash-fill', 'red', toLocalDigits(count - active, lang), translate(lang, 'status.inactive')),
    ],
    footer: null,
  };
}

async function studentsRows(
  filters: ReportFilters,
  lang: Lang,
  limit: number | null,
  offset: number
): Promise<ReportRow[]> {
  const where = await studentsWhere(filters);
  const rows = await safe(
    () =>
      prisma.student.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        ...(limit !== null ? { take: limit, skip: offset } : {}),
        select: {
          id: true,
          student_id_no: true,
          name: true,
          name_bn: true,
          phone: true,
          guardian_phone: true,
          student_status: true,
          created_at: true,
          ...PLACEMENT_SELECT,
        },
      }),
    []
  );

  const placement = await placementFor(rows.map(placementRow), filters, lang);

  return rows.map((row) => {
    const place = placement.get(row.id);
    return {
      _sid: row.id,
      id_no: studentCode(row.student_id_no, row.id),
      name: personName(row.name, row.name_bn, lang),
      course: place?.course ?? '',
      batch: place?.batch ?? '',
      phone: (row.phone ?? '').trim(),
      guardian_phone: (row.guardian_phone ?? '').trim(),
      status: row.student_status === 'Inactive' ? 'Inactive' : 'Active',
      joined: ymd(row.created_at),
    };
  });
}

/* --------------------------------------------------------- enrollments */

const STATE_STATUSES: Record<string, AdmissionStatus[]> = {
  pending: ['pending', 'under_review', 'payment_verified'],
  approved: ['approved'],
  rejected: ['rejected', 'payment_rejected'],
};

async function enrollmentsWhere(filters: ReportFilters): Promise<Record<string, unknown>> {
  const and: Record<string, unknown>[] = [];

  if (filters.state !== '') and.push({ status: { in: STATE_STATUSES[filters.state] } });

  if (filters.method === 'none') {
    and.push({ payment_method: null });
  } else if (filters.method !== '') {
    and.push({ payment_method: filters.method });
  }

  if (filters.course > 0) {
    const course = await safe(
      () => prisma.course.findUnique({ where: { id: filters.course }, select: { name: true } }),
      null
    );
    and.push({
      OR: [
        { course_id: filters.course },
        ...(course ? [{ course_id: null, course: course.name }] : []),
      ],
    });
  }

  if (filters.from !== '') and.push({ created_at: { gte: new Date(`${filters.from}T00:00:00.000Z`) } });
  if (filters.to !== '') and.push({ created_at: { lte: new Date(`${filters.to}T23:59:59.999Z`) } });

  if (filters.q !== '') {
    and.push({
      OR: [
        { fullname: { contains: filters.q, mode: 'insensitive' } },
        { fullname_bn: { contains: filters.q, mode: 'insensitive' } },
        { mobile: { contains: filters.q } },
        { application_no: { contains: filters.q, mode: 'insensitive' } },
        { transaction_id: { contains: filters.q, mode: 'insensitive' } },
      ],
    });
  }

  return and.length > 0 ? { AND: and } : {};
}

async function enrollmentsSummary(filters: ReportFilters, lang: Lang): Promise<ReportSummary> {
  const where = await enrollmentsWhere(filters);

  const [count, totals, approvedTotals, pending, approved, rejected] = await Promise.all([
    safe(() => prisma.admission.count({ where }), 0),
    safe(() => prisma.admission.aggregate({ where, _sum: { payment_amount: true } }), {
      _sum: { payment_amount: null },
    }),
    safe(
      () =>
        prisma.admission.aggregate({
          where: { ...where, status: 'approved' },
          _sum: { payment_amount: true },
        }),
      { _sum: { payment_amount: null } }
    ),
    safe(
      () =>
        prisma.admission.count({
          where: { ...where, status: { in: STATE_STATUSES.pending } },
        }),
      0
    ),
    safe(() => prisma.admission.count({ where: { ...where, status: 'approved' } }), 0),
    safe(
      () =>
        prisma.admission.count({
          where: { ...where, status: { in: STATE_STATUSES.rejected } },
        }),
      0
    ),
  ]);

  const amount = Number(totals._sum.payment_amount ?? 0);
  const approvedAmount = Number(approvedTotals._sum.payment_amount ?? 0);

  return {
    count,
    stats: [
      stat('bi-inboxes-fill', 'blue', toLocalDigits(count, lang), translate(lang, 'arep.stat_applications')),
      stat('bi-hourglass-split', 'yellow', toLocalDigits(pending, lang), translate(lang, 'status.pending')),
      stat('bi-check-circle-fill', 'green', toLocalDigits(approved, lang), translate(lang, 'status.approved')),
      stat('bi-x-circle-fill', 'red', toLocalDigits(rejected, lang), translate(lang, 'status.rejected')),
      stat('bi-wallet2', 'yellow', formatMoney(amount, lang), translate(lang, 'arep.stat_amount')),
      stat('bi-cash-stack', 'green', formatMoney(approvedAmount, lang), translate(lang, 'arep.stat_approved_amount')),
    ],
    footer: { app_no: translate(lang, 'common.total'), amount },
  };
}

async function enrollmentsRows(
  filters: ReportFilters,
  lang: Lang,
  limit: number | null,
  offset: number
): Promise<ReportRow[]> {
  const where = await enrollmentsWhere(filters);
  const rows = await safe(
    () =>
      prisma.admission.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        ...(limit !== null ? { take: limit, skip: offset } : {}),
        select: {
          id: true,
          application_no: true,
          fullname: true,
          fullname_bn: true,
          mobile: true,
          course: true,
          course_id: true,
          batch_label: true,
          batch_type: true,
          payment_method: true,
          transaction_id: true,
          payment_amount: true,
          status: true,
          created_at: true,
          student_id: true,
        },
      }),
    []
  );

  const courses = await reportCourses();
  const courseById = new Map(courses.map((course) => [course.id, course]));

  return rows.map((row) => {
    const course = row.course_id ? courseById.get(row.course_id) : undefined;
    return {
      _sid: row.student_id ?? 0,
      app_no: (row.application_no ?? '').trim() !== '' ? row.application_no!.trim() : `#${row.id}`,
      name: personName(row.fullname, row.fullname_bn, lang),
      mobile: (row.mobile ?? '').trim(),
      course: course ? pickLocalized(course, 'name', lang) : (row.course ?? '').trim(),
      batch: batchDisplay(row, lang),
      method: row.payment_method
        ? methodLabel(row.payment_method, lang)
        : translate(lang, 'arep.method_none'),
      trx: (row.transaction_id ?? '').trim(),
      amount: row.payment_amount === null ? null : Number(row.payment_amount),
      status: enrollmentState(row.status),
      submitted: ymd(row.created_at),
    };
  });
}

/* ------------------------------------------------------------- payments */

async function paymentsWhere(filters: ReportFilters): Promise<Record<string, unknown>> {
  const and: Record<string, unknown>[] = [];

  if (filters.from !== '') and.push({ payment_date: { gte: new Date(`${filters.from}T00:00:00.000Z`) } });
  if (filters.to !== '') and.push({ payment_date: { lte: new Date(`${filters.to}T23:59:59.999Z`) } });
  if (filters.status !== '') and.push({ payment_status: filters.status });

  if (filters.method === 'cash') {
    // A row saved without a method was money taken at the office, which is cash.
    and.push({
      OR: [
        { payment_method: null },
        { payment_method: '' },
        { payment_method: { equals: 'cash', mode: 'insensitive' } },
      ],
    });
  } else if (filters.method !== '') {
    and.push({ payment_method: { equals: filters.method, mode: 'insensitive' } });
  }

  if (filters.course > 0) {
    // A payment counts for the course either through the enrolment it was taken
    // against or through the student's own placement.
    const [scope, enrollments] = await Promise.all([
      studentsInCourse(filters.course),
      safe(
        () =>
          prisma.enrollment.findMany({
            where: { course_id: filters.course },
            select: { id: true },
          }),
        []
      ),
    ]);
    and.push({
      OR: [
        ...(enrollments.length > 0
          ? [{ enrollment_id: { in: enrollments.map((row) => row.id) } }]
          : []),
        ...(scope ? [{ student: scope }] : []),
      ],
    });
  }

  if (filters.q !== '') {
    and.push({
      OR: [
        { student: { name: { contains: filters.q, mode: 'insensitive' } } },
        { student: { name_bn: { contains: filters.q, mode: 'insensitive' } } },
        { student: { student_id_no: { contains: filters.q, mode: 'insensitive' } } },
        { student: { phone: { contains: filters.q } } },
        { receipt_number: { contains: filters.q, mode: 'insensitive' } },
        { transaction_id: { contains: filters.q, mode: 'insensitive' } },
        { payment_month: { contains: filters.q, mode: 'insensitive' } },
      ],
    });
  }

  return and.length > 0 ? { AND: and } : {};
}

async function paymentsSummary(filters: ReportFilters, lang: Lang): Promise<ReportSummary> {
  const where = await paymentsWhere(filters);

  const [count, paid, unpaidSum, unpaid] = await Promise.all([
    safe(() => prisma.payment.count({ where }), 0),
    safe(
      () =>
        prisma.payment.aggregate({
          where: { ...where, payment_status: 'paid' },
          _sum: { amount: true, due_amount: true },
        }),
      { _sum: { amount: null, due_amount: null } }
    ),
    safe(
      () =>
        prisma.payment.aggregate({
          where: { ...where, NOT: { payment_status: 'paid' } },
          _sum: { amount: true },
        }),
      { _sum: { amount: null } }
    ),
    safe(() => prisma.payment.count({ where: { ...where, payment_status: 'unpaid' } }), 0),
  ]);

  const collected = Number(paid._sum.amount ?? 0);
  const due = Number(paid._sum.due_amount ?? 0) + Number(unpaidSum._sum.amount ?? 0);

  return {
    count,
    stats: [
      stat('bi-receipt', 'blue', toLocalDigits(count, lang), translate(lang, 'arep.stat_records')),
      stat('bi-cash-stack', 'green', formatMoney(collected, lang), translate(lang, 'arep.stat_collected')),
      stat('bi-hourglass-split', 'red', formatMoney(due, lang), translate(lang, 'arep.stat_due')),
      stat('bi-exclamation-circle', 'yellow', toLocalDigits(unpaid, lang), translate(lang, 'arep.stat_unpaid')),
    ],
    footer: { date: translate(lang, 'common.total'), paid: collected, due },
  };
}

async function paymentsRows(
  filters: ReportFilters,
  lang: Lang,
  limit: number | null,
  offset: number
): Promise<ReportRow[]> {
  const where = await paymentsWhere(filters);
  const rows = await safe(
    () =>
      prisma.payment.findMany({
        where,
        orderBy: [{ payment_date: 'desc' }, { id: 'desc' }],
        ...(limit !== null ? { take: limit, skip: offset } : {}),
        select: {
          id: true,
          student_id: true,
          amount: true,
          payment_month: true,
          payment_status: true,
          payment_date: true,
          due_amount: true,
          receipt_number: true,
          payment_method: true,
          transaction_id: true,
          fee_type: true,
          installment_no: true,
          student: {
            select: { id: true, student_id_no: true, name: true, name_bn: true, ...PLACEMENT_SELECT },
          },
        },
      }),
    []
  );

  // Only the course matters on a payment row, and the batch filter is not one
  // of this report's filters, so the placement is asked for the course alone.
  const placement = await placementFor(
    rows.map((row) => placementRow({ ...row.student, id: row.student.id })),
    { ...filters, batch: 0 },
    lang
  );

  return rows.map((row) => {
    const paid = row.payment_status === 'paid';
    const due = paid ? Number(row.due_amount ?? 0) : Number(row.amount);

    return {
      _sid: row.student_id,
      date: ymd(row.payment_date),
      receipt: (row.receipt_number ?? '').trim(),
      id_no: studentCode(row.student.student_id_no, row.student_id),
      name: personName(row.student.name, row.student.name_bn, lang),
      course: placement.get(row.student.id)?.course ?? '',
      for: feeLabel({ payment_month: row.payment_month }, lang),
      method: methodLabel(
        (row.payment_method ?? '').trim() !== '' ? row.payment_method : 'cash',
        lang
      ),
      trx: (row.transaction_id ?? '').trim(),
      paid: paid ? Number(row.amount) : 0,
      due,
      status: paid ? (due > 0 ? 'partial' : 'paid') : 'unpaid',
    };
  });
}

/* ----------------------------------------------------------------- dues */

/**
 * Money owed, per student.
 *
 * The original does this as one grouped join; Prisma has no such join, so the
 * totals are grouped in a first query and the students read in a second. The
 * definition of "due" is unchanged: what is left on a paid row plus the whole
 * of an unpaid one.
 */
interface DueTotals {
  studentId: number;
  paid: number;
  due: number;
  unpaid: number;
  lastPaid: Date | null;
}

async function dueTotals(): Promise<DueTotals[]> {
  // Grouped per student AND status in the database — at most a few rows per
  // student — instead of reading every payment ever taken and folding it here.
  // Each group contributes exactly what its rows used to one by one.
  const rows = await safe(
    () =>
      prisma.payment.groupBy({
        by: ['student_id', 'payment_status'],
        _sum: { amount: true, due_amount: true },
        _count: { _all: true },
        _max: { payment_date: true },
      }),
    []
  );

  const byStudent = new Map<number, DueTotals>();
  for (const row of rows) {
    const entry =
      byStudent.get(row.student_id) ??
      { studentId: row.student_id, paid: 0, due: 0, unpaid: 0, lastPaid: null };

    if (row.payment_status === 'paid') {
      entry.paid += Number(row._sum.amount ?? 0);
      entry.due += Number(row._sum.due_amount ?? 0);
      const latest = row._max.payment_date;
      if (latest && (entry.lastPaid === null || latest > entry.lastPaid)) {
        entry.lastPaid = latest;
      }
    } else {
      entry.due += Number(row._sum.amount ?? 0);
      entry.unpaid += row._count._all;
    }

    byStudent.set(row.student_id, entry);
  }

  return [...byStudent.values()].filter((entry) => entry.due > 0);
}

async function duesList(filters: ReportFilters, lang: Lang): Promise<ReportRow[]> {
  const totals = await dueTotals();
  if (totals.length === 0) return [];

  const and: Record<string, unknown>[] = [{ id: { in: totals.map((row) => row.studentId) } }];
  if (filters.course > 0) and.push((await studentsInCourse(filters.course)) ?? { id: -1 });
  if (filters.batch > 0) and.push(studentsInBatch(filters.batch) ?? { id: -1 });
  const search = studentSearch(filters.q);
  if (search) and.push(search);

  const students = await safe(
    () =>
      prisma.student.findMany({
        where: { AND: and },
        select: {
          id: true,
          student_id_no: true,
          name: true,
          name_bn: true,
          phone: true,
          guardian_phone: true,
          ...PLACEMENT_SELECT,
        },
      }),
    []
  );

  const placement = await placementFor(students.map(placementRow), filters, lang);
  const totalsById = new Map(totals.map((row) => [row.studentId, row]));

  const rows: ReportRow[] = students.map((student) => {
    const owed = totalsById.get(student.id)!;
    const place = placement.get(student.id);

    return {
      _sid: student.id,
      id_no: studentCode(student.student_id_no, student.id),
      name: personName(student.name, student.name_bn, lang),
      course: place?.course ?? '',
      batch: place?.batch ?? '',
      phone: (student.phone ?? '').trim(),
      guardian_phone: (student.guardian_phone ?? '').trim(),
      unpaid: owed.unpaid,
      last_paid: ymd(owed.lastPaid),
      paid: owed.paid,
      due: owed.due,
      _name: student.name,
    };
  });

  // Biggest debt first, then by name — the order somebody would chase them in.
  rows.sort(
    (a, b) =>
      Number(b.due) - Number(a.due) ||
      String(a._name).localeCompare(String(b._name)) ||
      Number(a._sid) - Number(b._sid)
  );

  return rows.map(({ _name, ...row }) => {
    void _name;
    return row;
  });
}

async function duesSummaryReport(filters: ReportFilters, lang: Lang): Promise<ReportSummary> {
  const rows = await duesList(filters, lang);
  const due = rows.reduce((sum, row) => sum + Number(row.due), 0);
  const paid = rows.reduce((sum, row) => sum + Number(row.paid), 0);

  return {
    count: rows.length,
    stats: [
      stat('bi-people-fill', 'blue', toLocalDigits(rows.length, lang), translate(lang, 'arep.stat_due_students')),
      stat('bi-exclamation-diamond-fill', 'red', formatMoney(due, lang), translate(lang, 'arep.stat_due')),
      stat('bi-cash-stack', 'green', formatMoney(paid, lang), translate(lang, 'arep.stat_paid_so_far')),
    ],
    footer: { id_no: translate(lang, 'common.total'), paid, due },
  };
}

/* -------------------------------------------------------------- results */

/** pass | fail | incomplete | not_entered — as the marks page words it. */
function resultCode(result: {
  hasMarks: boolean;
  failedSubjects: number;
  complete: boolean;
}): string {
  if (!result.hasMarks) return 'not_entered';
  if (result.failedSubjects > 0) return 'fail';
  return result.complete ? 'pass' : 'incomplete';
}

async function resultsList(filters: ReportFilters) {
  const computation = filters.exam > 0 ? await examResults(filters.exam) : null;
  if (!computation) return [];

  const list = [...computation.students.values()]
    .map((result) => ({ ...result, code: resultCode(result) }))
    .filter((result) => filters.result === '' || result.code === filters.result);

  // Merit order, with the unranked last and then by name — never by id, which
  // would look arbitrary to anyone reading the sheet.
  list.sort(
    (a, b) =>
      (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) ||
      a.student.name.localeCompare(b.student.name, undefined, { sensitivity: 'base' })
  );

  return list;
}

async function resultsSummary(filters: ReportFilters, lang: Lang): Promise<ReportSummary> {
  const computation = filters.exam > 0 ? await examResults(filters.exam) : null;
  const list = await resultsList(filters);
  const digits = (value: string | number) => toLocalDigits(value, lang);

  return {
    count: list.length,
    stats: computation
      ? [
          stat('bi-people-fill', 'blue', digits(computation.stats.roster), translate(lang, 'arep.stat_examinees')),
          stat(
            'bi-trophy-fill',
            'green',
            `${digits(computation.stats.passed)} / ${digits(computation.stats.failed)}`,
            `${translate(lang, 'result.pass')} / ${translate(lang, 'result.fail')}`
          ),
          stat('bi-graph-up', 'yellow', `${formatMark(computation.stats.passRate, digits)}%`, translate(lang, 'result.pass_rate')),
          stat('bi-star-fill', 'green', formatMark(computation.stats.highest, digits), translate(lang, 'result.class_highest')),
          stat('bi-bar-chart-fill', 'blue', formatMark(computation.stats.average, digits), translate(lang, 'result.class_average')),
        ]
      : [],
    footer: null,
  };
}

async function resultsRows(
  filters: ReportFilters,
  lang: Lang,
  limit: number | null,
  offset: number
): Promise<ReportRow[]> {
  const list = await resultsList(filters);
  const page = limit === null ? list : list.slice(offset, offset + limit);

  return page.map((result) => ({
    _sid: result.student.id,
    position: result.position,
    id_no: studentCode(result.student.student_id_no, result.student.id),
    name: personName(result.student.name, result.student.name_bn, lang),
    total: result.hasMarks ? result.totalObtained : null,
    percent: result.hasMarks ? result.percentage : null,
    gpa: result.gpa,
    grade: result.grade !== '' ? result.grade : null,
    result: result.code,
  }));
}

/* ------------------------------------------------------------- dispatch */

export async function reportSummary(
  type: ReportType,
  filters: ReportFilters,
  lang: Lang
): Promise<ReportSummary> {
  switch (type) {
    case 'students':
      return studentsSummary(filters, lang);
    case 'enrollments':
      return enrollmentsSummary(filters, lang);
    case 'payments':
      return paymentsSummary(filters, lang);
    case 'dues':
      return duesSummaryReport(filters, lang);
    case 'results':
      return resultsSummary(filters, lang);
    default:
      return { count: 0, stats: [], footer: null };
  }
}

export async function reportRows(
  type: ReportType,
  filters: ReportFilters,
  lang: Lang,
  limit: number | null = null,
  offset = 0
): Promise<ReportRow[]> {
  switch (type) {
    case 'students':
      return studentsRows(filters, lang, limit, offset);
    case 'enrollments':
      return enrollmentsRows(filters, lang, limit, offset);
    case 'payments':
      return paymentsRows(filters, lang, limit, offset);
    case 'dues': {
      const rows = await duesList(filters, lang);
      return limit === null ? rows : rows.slice(offset, offset + limit);
    }
    case 'results':
      return resultsRows(filters, lang, limit, offset);
    default:
      return [];
  }
}

/* -------------------------------------------------------------- columns */

export async function reportColumns(
  type: ReportType,
  filters: ReportFilters,
  lang: Lang
): Promise<ReportColumn[]> {
  const t = (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars);

  const studentStatus = {
    labels: { Active: t('status.active'), Inactive: t('status.inactive') },
    tones: { Active: 'success' as const, Inactive: 'neutral' as const },
  };

  switch (type) {
    case 'students':
      return [
        { key: 'id_no', label: t('common.student_id'), type: 'code', width: 18 },
        { key: 'name', label: t('common.name'), type: 'text', width: 26, link: true },
        { key: 'course', label: t('common.course'), type: 'text', width: 28 },
        { key: 'batch', label: t('common.batch'), type: 'text', width: 20 },
        { key: 'phone', label: t('common.phone'), type: 'code', width: 16 },
        { key: 'guardian_phone', label: t('arep.col_guardian_phone'), type: 'code', width: 16 },
        { key: 'status', label: t('common.status'), type: 'status', width: 12, ...studentStatus },
        { key: 'joined', label: t('arep.col_joined'), type: 'date', width: 14 },
      ];

    case 'enrollments':
      return [
        { key: 'app_no', label: t('arep.col_app_no'), type: 'code', width: 18 },
        { key: 'name', label: t('arep.col_applicant'), type: 'text', width: 26, link: true },
        { key: 'mobile', label: t('common.mobile'), type: 'code', width: 16 },
        { key: 'course', label: t('common.course'), type: 'text', width: 28 },
        { key: 'batch', label: t('common.batch'), type: 'text', width: 22 },
        { key: 'method', label: t('arep.col_method'), type: 'text', width: 12 },
        { key: 'trx', label: t('arep.col_trx'), type: 'code', width: 18 },
        { key: 'amount', label: t('common.amount'), type: 'money', width: 13 },
        {
          key: 'status',
          label: t('common.status'),
          type: 'status',
          width: 12,
          labels: {
            pending: t('status.pending'),
            approved: t('status.approved'),
            rejected: t('status.rejected'),
          },
          tones: { pending: 'warning', approved: 'success', rejected: 'danger' },
        },
        { key: 'submitted', label: t('arep.col_submitted'), type: 'date', width: 14 },
      ];

    case 'payments':
      return [
        { key: 'date', label: t('common.date'), type: 'date', width: 14 },
        { key: 'receipt', label: t('arep.col_receipt'), type: 'code', width: 20 },
        { key: 'id_no', label: t('common.student_id'), type: 'code', width: 18 },
        { key: 'name', label: t('common.name'), type: 'text', width: 26, link: true },
        { key: 'course', label: t('common.course'), type: 'text', width: 26 },
        { key: 'for', label: t('arep.col_for'), type: 'text', width: 16 },
        { key: 'method', label: t('arep.col_method'), type: 'text', width: 12 },
        { key: 'trx', label: t('arep.col_trx'), type: 'code', width: 16 },
        { key: 'paid', label: t('arep.col_paid'), type: 'money', width: 13 },
        { key: 'due', label: t('arep.col_due'), type: 'money', width: 13 },
        {
          key: 'status',
          label: t('common.status'),
          type: 'status',
          width: 12,
          labels: { paid: t('status.paid'), partial: t('status.partial'), unpaid: t('status.unpaid') },
          tones: { paid: 'success', partial: 'warning', unpaid: 'danger' },
        },
      ];

    case 'dues':
      return [
        { key: 'id_no', label: t('common.student_id'), type: 'code', width: 18 },
        { key: 'name', label: t('common.name'), type: 'text', width: 26, link: true },
        { key: 'course', label: t('common.course'), type: 'text', width: 28 },
        { key: 'batch', label: t('common.batch'), type: 'text', width: 20 },
        { key: 'phone', label: t('common.phone'), type: 'code', width: 16 },
        { key: 'guardian_phone', label: t('arep.col_guardian_phone'), type: 'code', width: 16 },
        { key: 'unpaid', label: t('arep.col_unpaid_records'), type: 'int', width: 12 },
        { key: 'last_paid', label: t('arep.col_last_paid'), type: 'date', width: 14 },
        { key: 'paid', label: t('arep.col_paid'), type: 'money', width: 13 },
        { key: 'due', label: t('arep.col_due'), type: 'money', width: 13 },
      ];

    case 'results': {
      const computation = filters.exam > 0 ? await examResults(filters.exam) : null;
      const full = computation ? computation.stats.totalFull : 0;

      return [
        { key: 'position', label: t('result.position'), type: 'int', width: 10 },
        { key: 'id_no', label: t('common.student_id'), type: 'code', width: 18 },
        { key: 'name', label: t('common.name'), type: 'text', width: 26, link: true },
        {
          key: 'total',
          label: t('arep.col_total_of', {
            full: formatMark(full, (value) => toLocalDigits(value, lang)),
          }),
          type: 'marks',
          width: 14,
        },
        { key: 'percent', label: t('result.percentage'), type: 'percent', width: 12 },
        { key: 'gpa', label: t('result.gpa'), type: 'gpa', width: 9 },
        { key: 'grade', label: t('result.grade'), type: 'code', width: 9 },
        {
          key: 'result',
          label: t('result.result'),
          type: 'status',
          width: 14,
          labels: {
            pass: t('result.pass'),
            fail: t('result.fail'),
            incomplete: t('result.incomplete'),
            not_entered: t('result.not_entered'),
          },
          tones: {
            pass: 'success',
            fail: 'danger',
            incomplete: 'warning',
            not_entered: 'neutral',
          },
        },
      ];
    }

    default:
      return [];
  }
}

/* ----------------------------------------------------------------- meta */

export interface ReportMeta {
  institute: string;
  title: string;
  filters: string[];
  generated: string;
  filename: string;
}

/** One "Label: value" line per active filter, for the print sheet and exports. */
export async function filterLines(
  type: ReportType,
  filters: ReportFilters,
  lang: Lang
): Promise<string[]> {
  const t = (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars);
  const lines: string[] = [];

  if (type === 'results') {
    const exam = filters.exam > 0 ? await monthlyExam(filters.exam) : null;
    if (exam) {
      const [courses, batches] = await Promise.all([reportCourses(), reportBatches()]);
      const course = courses.find((row) => row.id === exam.course_id);
      const batch = batches.find((row) => row.id === exam.batch_id);
      const scope = [
        course ? pickLocalized(course, 'name', lang) : '',
        batch ? pickLocalized(batch, 'name', lang) : '',
      ].filter((part) => part !== '');

      lines.push(
        `${t('result.exam')}: ${examLabel(exam, lang)}${scope.length > 0 ? ` (${scope.join(', ')})` : ''}`
      );
    }
    if (filters.result !== '') lines.push(`${t('result.result')}: ${t(`result.${filters.result}`)}`);
    return lines;
  }

  const [courses, batches] = await Promise.all([reportCourses(), reportBatches()]);

  if (filters.month !== '') {
    lines.push(`${t('common.month')}: ${monthLabel(filters.month, lang)}`);
  } else if (filters.from !== '' || filters.to !== '') {
    const from = filters.from !== '' ? formatDate(filters.from, 'd M Y', lang) : '…';
    const to = filters.to !== '' ? formatDate(filters.to, 'd M Y', lang) : '…';
    lines.push(`${t('arep.period')}: ${from} – ${to}`);
  }

  const course = courses.find((row) => row.id === filters.course);
  if (course) lines.push(`${t('common.course')}: ${pickLocalized(course, 'name', lang)}`);

  const batch = batches.find((row) => row.id === filters.batch);
  if (batch) lines.push(`${t('common.batch')}: ${pickLocalized(batch, 'name', lang)}`);

  if (filters.state !== '') lines.push(`${t('common.status')}: ${t(`status.${filters.state}`)}`);
  if (filters.status !== '') {
    lines.push(`${t('common.status')}: ${t(`status.${filters.status.toLowerCase()}`)}`);
  }
  if (filters.method !== '') {
    lines.push(
      `${t('arep.col_method')}: ${
        filters.method === 'none' ? t('arep.method_none') : methodLabel(filters.method, lang)
      }`
    );
  }
  if (filters.q !== '') lines.push(`${t('common.search')}: “${filters.q}”`);

  return lines;
}

export async function reportMeta(
  type: ReportType,
  filters: ReportFilters,
  lang: Lang,
  institute: string
): Promise<ReportMeta> {
  const lines = await filterLines(type, filters, lang);
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);

  return {
    institute,
    title: translate(lang, `arep.type_${type}`),
    filters: lines.length > 0 ? lines : [translate(lang, 'arep.no_filters')],
    generated: translate(lang, 'arep.generated', {
      date: formatDate(new Date(), 'd M Y, h:i A', lang),
    }),
    // ASCII only: the file name travels through a Content-Disposition header.
    filename:
      `orbit_${type}_report` +
      (filters.month !== '' ? `_${filters.month}` : '') +
      (filters.exam > 0 ? `_exam${filters.exam}` : '') +
      `_${stamp}`,
  };
}

export { REPORT_LIMIT, RESULT_CODES, formatNumber, type CellValue };
