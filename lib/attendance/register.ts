import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { adminBranchLock, branchWhere } from '@/lib/auth/guards';

/**
 * Taking attendance, from admin/attendance.php and includes/attendance_lib.php.
 *
 * The shape of the data is one row per student per batch per day, so saving the
 * same register twice **updates** it rather than adding a second set of marks.
 * That is what makes it safe for a teacher to correct a register at the end of the
 * day.
 *
 * Two safety rules carry over exactly:
 *
 *   1. **Nothing is ever written for a student who is not on this register.** The
 *      roster is the allow-list; a student id in the form that is not on it is
 *      skipped silently. Without that, a crafted form could mark attendance for
 *      any student in the institute.
 *   2. **A register is never saved without a roster to check against**, and never
 *      for a future date.
 */

export const ATTENDANCE_STATUSES = ['present', 'late', 'half_day', 'absent'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export function isAttendanceStatus(value: unknown): value is AttendanceStatus {
  return typeof value === 'string' && (ATTENDANCE_STATUSES as readonly string[]).includes(value);
}

/** present and late count fully, a half day counts half, absent not at all. */
export function attendanceWeight(status: string): number {
  if (status === 'present' || status === 'late') return 1;
  if (status === 'half_day') return 0.5;
  return 0;
}

async function safe<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

/** The batches an admin may take attendance for, with their course names. */
export async function attendanceBatches() {
  const branch = await branchWhere();

  return safe(
    () =>
      prisma.batch.findMany({
        where: branch,
        orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          name_bn: true,
          batch_type: true,
          schedule_info: true,
          schedule_info_bn: true,
          status: true,
          branch_id: true,
          course_id: true,
          course: { select: { id: true, name: true, name_bn: true, sort_order: true } },
        },
      }),
    []
  );
}

export type AttendanceBatch = Awaited<ReturnType<typeof attendanceBatches>>[number];

/**
 * The free-text courses of students who are in no batch.
 *
 * These are records from before batches existed. They still need a register, and
 * their only grouping is the course name they registered with.
 */
export async function legacyCourses(): Promise<string[]> {
  const rows = await safe(
    async () =>
      prisma.student.findMany({
        where: {
          status: 'approved',
          batch_id: null,
          course: { not: '' },
          ...(await branchWhere()),
        },
        distinct: ['course'],
        orderBy: { course: 'asc' },
        select: { course: true },
      }),
    []
  );
  return rows.map((row) => row.course).filter((course) => course.trim() !== '');
}

const ROSTER_COLUMNS = {
  id: true,
  student_id_no: true,
  name: true,
  name_bn: true,
  phone: true,
  email: true,
  image: true,
  roll_number: true,
  student_status: true,
  course: true,
} as const;

export interface RosterStudent {
  id: number;
  student_id_no: string | null;
  name: string;
  name_bn: string | null;
  phone: string;
  email: string;
  image: string | null;
  roll_number: string | null;
  student_status: string;
  course: string;
}

/**
 * Everyone on one batch's register.
 *
 * A student counts as being in the batch through **either** an active enrolment
 * **or** the legacy `students.batch_id` column. Dropping the second would empty
 * the register for every student admitted before enrolments existed.
 *
 * Ordered by roll number numerically, with unnumbered students last — a register
 * is read down a printed list, and "10" must not sort before "9".
 */
export async function batchRoster(batchId: number): Promise<RosterStudent[]> {
  const enrolled = await safe(
    () =>
      prisma.enrollment.findMany({
        where: { batch_id: batchId, status: 'active' },
        select: { student_id: true },
      }),
    []
  );
  const ids = [...new Set(enrolled.map((row) => row.student_id))];

  const rows = await safe(
    () =>
      prisma.student.findMany({
        where: {
          status: 'approved',
          OR: [{ id: { in: ids } }, { batch_id: batchId }],
        },
        select: ROSTER_COLUMNS,
      }),
    []
  );

  return sortRoster(rows);
}

/** Approved students in no batch at all, optionally narrowed to one course. */
export async function unbatchedRoster(legacyCourse: string): Promise<RosterStudent[]> {
  const lock = await adminBranchLock();

  const enrolled = await safe(
    () =>
      prisma.enrollment.findMany({
        where: { status: 'active', batch_id: { not: null } },
        select: { student_id: true },
      }),
    []
  );
  const inABatch = [...new Set(enrolled.map((row) => row.student_id))];

  const rows = await safe(
    () =>
      prisma.student.findMany({
        where: {
          status: 'approved',
          batch_id: null,
          ...(inABatch.length > 0 ? { id: { notIn: inABatch } } : {}),
          ...(legacyCourse !== '' ? { course: legacyCourse } : {}),
          ...(lock > 0 ? { branch_id: lock } : {}),
        },
        orderBy: { name: 'asc' },
        select: ROSTER_COLUMNS,
      }),
    []
  );
  return rows;
}

function sortRoster(rows: RosterStudent[]): RosterStudent[] {
  return [...rows].sort((a, b) => {
    const rollA = (a.roll_number ?? '').trim();
    const rollB = (b.roll_number ?? '').trim();
    if (rollA === '' && rollB !== '') return 1;
    if (rollA !== '' && rollB === '') return -1;
    if (rollA !== '' && rollB !== '') {
      const numA = Number.parseInt(rollA, 10);
      const numB = Number.parseInt(rollB, 10);
      if (!Number.isNaN(numA) && !Number.isNaN(numB) && numA !== numB) return numA - numB;
    }
    return a.name.localeCompare(b.name);
  });
}

/** The marks already recorded for one batch and date, by student id. */
export async function dayMap(batchId: number, date: Date, studentIds: number[] = []) {
  const rows = await safe(
    () =>
      prisma.attendance.findMany({
        where: {
          batch_id: batchId,
          attendance_date: date,
          ...(studentIds.length > 0 ? { student_id: { in: studentIds } } : {}),
        },
      }),
    []
  );

  const map = new Map<number, (typeof rows)[number]>();
  for (const row of rows) map.set(row.student_id, row);
  return map;
}

export interface SaveRegisterInput {
  batchId: number;
  courseId: number | null;
  date: Date;
  classLabel: string;
  statuses: Record<number, string>;
  notes: Record<number, string>;
  markedBy: number;
  /** The roster — the only student ids that may be written. */
  allowedIds: number[];
}

export interface SaveRegisterResult {
  saved: number;
  present: number;
  late: number;
  half_day: number;
  absent: number;
  /** Students marked absent who were not absent before, for notifications. */
  newlyAbsent: number[];
}

export async function saveRegister(input: SaveRegisterInput): Promise<SaveRegisterResult> {
  const result: SaveRegisterResult = {
    saved: 0,
    present: 0,
    late: 0,
    half_day: 0,
    absent: 0,
    newlyAbsent: [],
  };

  const allowed = new Set(input.allowedIds);
  const previous = await dayMap(input.batchId, input.date);

  // The branch of the register: the batch's own, or — for a register of
  // batch-less students — each student's. Attendance is counted per branch, so a
  // register with no branch would vanish from every branch's numbers.
  let batchBranch: number | null = null;
  if (input.batchId > 0) {
    const batch = await prisma.batch
      .findUnique({ where: { id: input.batchId }, select: { branch_id: true } })
      .catch(() => null);
    batchBranch = batch?.branch_id ?? null;
  }

  const studentBranch = new Map<number, number | null>();
  if (batchBranch === null && allowed.size > 0) {
    const students = await safe(
      () =>
        prisma.student.findMany({
          where: { id: { in: [...allowed] } },
          select: { id: true, branch_id: true },
        }),
      []
    );
    for (const student of students) studentBranch.set(student.id, student.branch_id);
  }

  const label = input.classLabel.trim().slice(0, 150);

  const writes: { studentId: number; status: AttendanceStatus; note: string | null }[] = [];
  for (const [rawId, rawStatus] of Object.entries(input.statuses)) {
    const studentId = Number(rawId);
    // The roster is the allow-list.
    if (!Number.isInteger(studentId) || studentId <= 0 || !allowed.has(studentId)) continue;
    if (!isAttendanceStatus(rawStatus)) continue;

    const note = (input.notes[studentId] ?? '').trim().slice(0, 255);
    writes.push({ studentId, status: rawStatus, note: note !== '' ? note : null });
  }

  await prisma.$transaction(
    writes.map((write) => {
      const data = {
        student_id: write.studentId,
        course_id: input.courseId,
        batch_id: input.batchId,
        attendance_date: input.date,
        class_label: label !== '' ? label : null,
        status: write.status,
        note: write.note,
        marked_by: input.markedBy > 0 ? input.markedBy : null,
        branch_id: batchBranch ?? studentBranch.get(write.studentId) ?? null,
      };

      // One row per student per batch per day: saving again corrects the mark.
      return prisma.attendance.upsert({
        where: {
          student_id_attendance_date_batch_id: {
            student_id: write.studentId,
            attendance_date: input.date,
            batch_id: input.batchId,
          },
        },
        create: data,
        update: {
          course_id: data.course_id,
          class_label: data.class_label,
          status: data.status,
          note: data.note,
          marked_by: data.marked_by,
          branch_id: data.branch_id,
        },
      });
    })
  );

  for (const write of writes) {
    result.saved++;
    result[write.status]++;
    if (write.status === 'absent' && previous.get(write.studentId)?.status !== 'absent') {
      result.newlyAbsent.push(write.studentId);
    }
  }

  return result;
}
