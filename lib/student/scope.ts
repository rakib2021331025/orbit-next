import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/db/prisma';

/**
 * A student's audience scope — which content is addressed to them.
 *
 * This is the single most delicate rule in the app, ported from
 * orbit_student_scope() / orbit_scope_where() / orbit_scope_open_where().
 *
 * Content (notices, materials, assignments, routines, live classes, exams,
 * recordings) is tagged with a course and batch **by NAME**, not by id, because
 * the columns predate the courses and batches tables. So matching is by string,
 * and three rules keep that from leaking:
 *
 *   1. **A batch name never widens the audience to another course.** Names like
 *      "Online Batch" and "Morning Batch" repeat across courses; matching a bare
 *      batch name against every course would show one class another's material.
 *      That is why the scope is a list of GROUPS — one per course, carrying that
 *      course's batch names — rather than two flat lists.
 *   2. **A row with no batch is for the whole course.** A row with a batch but no
 *      course matches on batch name alone.
 *   3. **Branch narrows everything.** The same "Morning Batch" of the same course
 *      can exist at two branches, so a row belonging to another branch is
 *      excluded. A row with no branch is shared by all of them.
 *
 * Both the student's `enrollments` and the legacy `students.course`/`.batch`
 * columns are included: older students have only the latter, and dropping it
 * would empty their portal.
 */

export interface ScopeGroup {
  /** Every spelling of one course's name: English, Bangla, and as enrolled. */
  courses: string[];
  /** That course's batch names, in every spelling. */
  batches: string[];
}

export interface StudentScope {
  /** Every course name, flattened — for the "open" match only. */
  courses: string[];
  /** Every batch name, flattened. */
  batches: string[];
  courseIds: number[];
  batchIds: number[];
  /** One entry per course the student takes. The precise matcher uses these. */
  groups: ScopeGroup[];
  /** The student's own branch plus every branch they are enrolled at. */
  branchIds: number[];
}

/** Trims, drops blanks, and removes case-insensitive duplicates. */
function clean(values: (string | null | undefined)[]): string[] {
  const seen = new Map<string, string>();
  for (const raw of values) {
    const value = (raw ?? '').trim();
    if (value !== '') seen.set(value.toLowerCase(), value);
  }
  return [...seen.values()];
}

const ENROLLMENT_SELECT = {
  id: true,
  status: true,
  course_id: true,
  batch_id: true,
  course_name: true,
  batch_name: true,
  course: { select: { id: true, name: true, name_bn: true } },
  batch: {
    select: { id: true, name: true, name_bn: true, branch_id: true, batch_type: true },
  },
} as const;

/** A student's active enrolments, with course and batch names in both languages. */
export const studentEnrollments = cache(async (studentId: number) => {
  try {
    return await prisma.enrollment.findMany({
      where: { student_id: studentId },
      orderBy: { id: 'desc' },
      select: ENROLLMENT_SELECT,
    });
  } catch {
    return [];
  }
});

type EnrollmentRow = Awaited<ReturnType<typeof studentEnrollments>>[number];

type ScopeStudent = {
  id: number;
  course: string;
  batch: string | null;
  batch_id: number | null;
  branch_id: number | null;
};

/**
 * Many students' scopes from ONE enrolment query, for code that has to check a
 * whole list of students (a class's notification audience). Calling
 * `studentScope` in a loop would be a query per student. Each scope is built by
 * the same `buildScope` as `studentScope`, from the enrolments in the same
 * order, so the two can never disagree.
 */
export async function studentScopes(students: ScopeStudent[]): Promise<Map<number, StudentScope>> {
  const byStudent = new Map<number, EnrollmentRow[]>();
  if (students.length > 0) {
    try {
      const rows = await prisma.enrollment.findMany({
        where: { student_id: { in: students.map((student) => student.id) } },
        orderBy: { id: 'desc' },
        select: { ...ENROLLMENT_SELECT, student_id: true },
      });
      for (const { student_id, ...row } of rows) {
        const list = byStudent.get(student_id) ?? [];
        list.push(row);
        byStudent.set(student_id, list);
      }
    } catch {
      // As studentEnrollments: no enrolments readable, the legacy columns remain.
    }
  }

  const scopes = new Map<number, StudentScope>();
  for (const student of students) {
    scopes.set(student.id, buildScope(student, byStudent.get(student.id) ?? []));
  }
  return scopes;
}

export const studentScope = cache(
  async (student: ScopeStudent): Promise<StudentScope> =>
    buildScope(student, await studentEnrollments(student.id))
);

function buildScope(student: ScopeStudent, enrollments: EnrollmentRow[]): StudentScope {
  const courses: (string | null)[] = [];
  const batches: (string | null)[] = [];
  const courseIds: number[] = [];
  const batchIds: number[] = [];
  const groups: ScopeGroup[] = [];
  const branchIds: number[] = [];

  // The student's own branch, plus the branch of every batch they are actively
  // enrolled in — a student may take one course at another branch.
  if (student.branch_id) branchIds.push(student.branch_id);

  for (const enrollment of enrollments) {
    if (enrollment.status !== 'active') continue;

    if (enrollment.batch?.branch_id) branchIds.push(enrollment.batch.branch_id);

    courses.push(enrollment.course_name, enrollment.course?.name ?? null, enrollment.course?.name_bn ?? null);
    batches.push(enrollment.batch_name, enrollment.batch?.name ?? null, enrollment.batch?.name_bn ?? null);
    if (enrollment.course_id) courseIds.push(enrollment.course_id);
    if (enrollment.batch_id) batchIds.push(enrollment.batch_id);

    groups.push({
      courses: clean([enrollment.course_name, enrollment.course?.name, enrollment.course?.name_bn]),
      batches: clean([enrollment.batch_name, enrollment.batch?.name, enrollment.batch?.name_bn]),
    });
  }

  // The legacy student record. Its batch belongs to the enrolment in the same
  // course when there is one; otherwise it is a course (and batch) of its own.
  const recordCourse = (student.course ?? '').trim();
  const recordBatch = (student.batch ?? '').trim();
  courses.push(recordCourse);
  batches.push(recordBatch);
  if (student.batch_id) batchIds.push(student.batch_id);

  if (recordCourse !== '') {
    let merged = false;
    for (const group of groups) {
      if (group.courses.some((name) => name.toLowerCase() === recordCourse.toLowerCase())) {
        group.batches = clean([...group.batches, recordBatch]);
        merged = true;
      }
    }
    if (!merged) {
      groups.push({ courses: [recordCourse], batches: clean([recordBatch]) });
    }
  } else if (recordBatch !== '') {
    groups.push({ courses: [], batches: [recordBatch] });
  }

  return {
    courses: clean(courses),
    batches: clean(batches),
    courseIds: [...new Set(courseIds)],
    batchIds: [...new Set(batchIds)],
    groups,
    branchIds: [...new Set(branchIds)],
  };
}

/* ------------------------------------------------------- Prisma conditions */

/** Any Prisma `where` fragment. Kept loose: column names vary per table. */
type Where = Record<string, unknown>;

/**
 * "This row's branch is shared or one of mine", or null when the student has no
 * branch at all — in which case branch plays no part, as it did before branches
 * existed.
 */
function branchCondition(scope: StudentScope, branchColumn: string | false): Where | null {
  if (branchColumn === false || scope.branchIds.length === 0) return null;
  return { OR: [{ [branchColumn]: null }, { [branchColumn]: { in: scope.branchIds } }] };
}

/** "This text column is empty": NULL or '' where the column allows NULL, '' otherwise. */
function emptyText(column: string, nullable: boolean): Where {
  return nullable ? { OR: [{ [column]: null }, { [column]: '' }] } : { [column]: '' };
}

/**
 * The precise matcher — orbit_scope_where().
 *
 * Returns null when the student has no course or batch at all, which the caller
 * must treat as "no content", NOT as "no filter".
 *
 * `courseNullable`: study_materials, assignments and class_routine declare
 * `course` NOT NULL, and Prisma rejects `{ course: null }` on such a column —
 * the whole query fails (and `safe()` turned that into an empty list). There an
 * "empty course" can only be `''`. Tables whose course is nullable (live and
 * recorded classes, exams) come through scopeOpenWhere, which says so. Returning an empty object
 * would show every student everything, and that is the leak this whole module
 * exists to prevent.
 */
export function scopeWhere(
  scope: StudentScope,
  courseColumn = 'course',
  batchColumn = 'batch',
  branchColumn: string | false = 'branch_id',
  courseNullable = false
): Where | null {
  const parts: Where[] = [];
  const allBatches = new Set<string>();

  for (const group of scope.groups) {
    for (const batch of group.batches) allBatches.add(batch);
    if (group.courses.length === 0) continue;

    // The course must be one of this group's spellings, AND the batch must be
    // empty or one of THIS course's batches — never another course's.
    const condition: Where = { [courseColumn]: { in: group.courses } };
    if (group.batches.length > 0) {
      condition.OR = [
        { [batchColumn]: null },
        { [batchColumn]: '' },
        { [batchColumn]: { in: group.batches } },
      ];
    }
    parts.push(condition);
  }

  // A row with a batch but no course matches on batch name alone.
  if (allBatches.size > 0) {
    parts.push({
      AND: [
        emptyText(courseColumn, courseNullable),
        { [batchColumn]: { in: [...allBatches] } },
      ],
    });
  }

  if (parts.length === 0) return null;

  const where: Where = { OR: parts };
  const branch = branchCondition(scope, branchColumn);
  return branch === null ? where : { AND: [where, branch] };
}

/**
 * The permissive matcher — orbit_scope_open_where().
 *
 * Used where a single column addresses the audience: a row with an empty column
 * is for everyone, and a row naming one of the student's courses or batches is
 * for them. With `courseColumn` given it also accepts the precise match, so a
 * table with both columns behaves like `scopeWhere` plus "open to all".
 *
 * Unlike `scopeWhere` this never returns null: an empty column means "everyone",
 * so there is always something to match.
 */
export function scopeOpenWhere(
  scope: StudentScope,
  column: string,
  courseColumn?: string,
  branchColumn: string | false = 'branch_id'
): Where {
  const names = [...new Set([...scope.batches, ...scope.courses])];

  const open: Where[] = [{ [column]: null }, { [column]: '' }];
  if (names.length > 0) open.push({ [column]: { in: names } });

  let condition: Where;
  if (courseColumn === undefined) {
    condition = { OR: open };
  } else {
    // The branch is applied once, below, to both halves.
    const precise = scopeWhere(scope, courseColumn, column, false, true);
    const openHalf: Where = {
      AND: [emptyText(courseColumn, true), { OR: open }],
    };
    condition = precise === null ? openHalf : { OR: [openHalf, precise] };
  }

  const branch = branchCondition(scope, branchColumn);
  return branch === null ? condition : { AND: [condition, branch] };
}

/**
 * Evaluates a condition built by `scopeWhere` / `scopeOpenWhere` against one
 * row already in memory, so a list of students can be checked against one row
 * without a query each.
 *
 * It understands exactly the shapes those two builders produce — `OR`, `AND`,
 * `{ col: null }` (IS NULL), `{ col: 'text' }` and `{ col: { in: [...] } }` —
 * with the database's semantics: exact, case-sensitive equality, and NULL
 * matching only IS NULL. Anything else, or a column the row does not carry,
 * returns **null** ("cannot tell"), and the caller must then ask the database
 * rather than guess: guessing wrong here is the leak this module prevents.
 */
export function scopeMatches(row: Record<string, unknown>, where: Where): boolean | null {
  let unknown = false;

  for (const [key, value] of Object.entries(where)) {
    let result: boolean | null;

    if (key === 'OR' || key === 'AND') {
      if (!Array.isArray(value)) return null;
      const parts = value.map((part) =>
        part !== null && typeof part === 'object' ? scopeMatches(row, part as Where) : null
      );
      if (key === 'OR') {
        result = parts.includes(true) ? true : parts.includes(null) ? null : false;
      } else {
        result = parts.includes(false) ? false : parts.includes(null) ? null : true;
      }
    } else {
      if (!(key in row)) return null;
      const cell = row[key];
      if (value === null) {
        result = cell === null;
      } else if (typeof value === 'string' || typeof value === 'number') {
        result = cell !== null && cell === value;
      } else if (
        typeof value === 'object' &&
        Object.keys(value).length === 1 &&
        Array.isArray((value as { in?: unknown }).in)
      ) {
        result = cell !== null && ((value as { in: unknown[] }).in).includes(cell);
      } else {
        return null;
      }
    }

    // Keys of one object are ANDed, as in a Prisma where.
    if (result === false) return false;
    if (result === null) unknown = true;
  }

  return unknown ? null : true;
}

/** True when the student has no course or batch, so no tagged content is theirs. */
export function scopeIsEmpty(scope: StudentScope): boolean {
  return scope.courses.length === 0 && scope.batches.length === 0;
}
