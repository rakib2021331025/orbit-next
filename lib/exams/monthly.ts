import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { adminBranchLock } from '@/lib/auth/guards';
import { paginate, type Pager } from '@/lib/paginate';

/**
 * Monthly exams — the exam itself and its subject list, from
 * admin/monthly_exams.php.
 *
 * Marks are the reason the save is careful rather than a plain replace. Three
 * rules protect results that have already been entered:
 *
 *   1. **A subject that already has marks cannot be removed.** Removing it would
 *      delete those marks with no way back.
 *   2. **Full marks cannot drop below a mark already given.** A student with 92
 *      out of 100 cannot end up with 92 out of 50.
 *   3. **A published exam cannot be deleted.** It has to be unpublished first,
 *      which is a deliberate second decision.
 *
 * Removed rows are deleted *before* the remaining ones are updated: renaming
 * "Math" to "Mathematics" while another row is being deleted would otherwise
 * collide with the unique name index mid-transaction.
 */

export const MERIT_SIZE_MIN = 3;
export const MERIT_SIZE_MAX = 50;

async function safe<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

/* ---------------------------------------------------------------- listing */

export interface ExamListFilters {
  month: string;
  courseId: number;
  status: '' | 'draft' | 'published';
  page: number;
}

export function examListFilters(params: Record<string, string | undefined>): ExamListFilters {
  return {
    month: /^\d{4}-\d{2}$/.test(params.month ?? '') ? (params.month as string) : '',
    courseId: /^\d{1,9}$/.test(params.course ?? '') ? Number(params.course) : 0,
    status:
      params.status === 'draft' || params.status === 'published'
        ? params.status
        : '',
    page: Number(params.page ?? 1),
  };
}

export interface ExamListRow {
  id: number;
  title: string;
  titleBn: string | null;
  month: string;
  examDate: Date | null;
  courseName: string;
  courseNameBn: string | null;
  batchName: string;
  batchNameBn: string | null;
  batchType: string | null;
  batchId: number | null;
  branchId: number | null;
  status: string;
  totalMarks: number;
  subjects: number;
  markedStudents: number;
}

/**
 * The `where` for the list.
 *
 * The branch in focus sees the exams of **its own batches plus every
 * course-wide exam**, because an exam with no batch is one that every branch's
 * students of that course sit.
 */
async function examWhere(filters: ExamListFilters): Promise<Record<string, unknown>> {
  const and: Record<string, unknown>[] = [];
  const lock = await adminBranchLock();

  if (lock > 0) {
    and.push({ OR: [{ batch_id: null }, { batch: { branch_id: lock } }] });
  }
  if (filters.month !== '') and.push({ exam_month: filters.month });
  if (filters.status !== '') and.push({ status: filters.status });
  if (filters.courseId > 0) {
    // COALESCE(e.course_id, b.course_id): the exam's own course, or its batch's.
    and.push({
      OR: [
        { course_id: filters.courseId },
        { course_id: null, batch: { course_id: filters.courseId } },
      ],
    });
  }

  return and.length > 0 ? { AND: and } : {};
}

export async function examList(
  filters: ExamListFilters
): Promise<{ rows: ExamListRow[]; pager: Pager }> {
  const where = await examWhere(filters);
  const total = await safe(() => prisma.monthlyExam.count({ where }), 0);
  const pager = paginate(total, 20, filters.page);

  const exams = await safe(
    () =>
      prisma.monthlyExam.findMany({
        where,
        orderBy: [{ exam_month: 'desc' }, { id: 'desc' }],
        take: pager.perPage,
        skip: pager.offset,
        include: {
          course: { select: { name: true, name_bn: true } },
          batch: {
            select: {
              name: true,
              name_bn: true,
              batch_type: true,
              branch_id: true,
              course: { select: { name: true, name_bn: true } },
            },
          },
          _count: { select: { monthlyExamSubject_exam: true } },
        },
      }),
    []
  );

  // "How many students have any mark" is a distinct count, which Prisma cannot
  // express inside the include — one grouped query covers the whole page.
  const marked = await safe(
    () =>
      prisma.examResult.groupBy({
        by: ['monthly_exam_id', 'student_id'],
        where: { monthly_exam_id: { in: exams.map((exam) => exam.id) } },
      }),
    [] as { monthly_exam_id: number | null; student_id: number }[]
  );
  const markedCount = new Map<number, number>();
  for (const row of marked) {
    if (row.monthly_exam_id === null) continue;
    markedCount.set(row.monthly_exam_id, (markedCount.get(row.monthly_exam_id) ?? 0) + 1);
  }

  const rows: ExamListRow[] = exams.map((exam) => ({
    id: exam.id,
    title: exam.title,
    titleBn: exam.title_bn,
    month: exam.exam_month,
    examDate: exam.exam_date,
    courseName: exam.course?.name ?? exam.batch?.course?.name ?? '',
    courseNameBn: exam.course?.name_bn ?? exam.batch?.course?.name_bn ?? null,
    batchName: exam.batch?.name ?? '',
    batchNameBn: exam.batch?.name_bn ?? null,
    batchType: exam.batch?.batch_type ?? null,
    batchId: exam.batch_id,
    branchId: exam.batch?.branch_id ?? null,
    status: exam.status,
    totalMarks: Number(exam.total_marks),
    subjects: exam._count.monthlyExamSubject_exam,
    markedStudents: markedCount.get(exam.id) ?? 0,
  }));

  return { rows, pager };
}

/* ------------------------------------------------------------- the subjects */

export interface SubjectRowInput {
  /** The existing monthly_exam_subjects row, or 0 for a new one. */
  id: number;
  subjectId: number;
  name: string;
  nameBn: string;
  full: string;
  pass: string;
}

export interface ExamInput {
  id: number;
  title: string;
  titleBn: string;
  month: string;
  examDate: string;
  courseId: number;
  batchId: number;
  showPosition: boolean;
  remarks: string;
  subjects: SubjectRowInput[];
}

export interface ExamSaveResult {
  ok: boolean;
  /** Translation keys with their variables, ready for the action to translate. */
  errors: { key: string; vars?: Record<string, string> }[];
  examId: number;
  /** True when an existing exam was updated rather than created. */
  updated: boolean;
}

/** A decimal typed with a comma still means what the person meant. */
function marks(raw: string): number {
  const value = Number(String(raw).replace(',', '.'));
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : NaN;
}

export async function examSubjects(examId: number) {
  return safe(
    () =>
      prisma.monthlyExamSubject.findMany({
        where: { exam_id: examId },
        orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
      }),
    []
  );
}

/** exam_subject_id → how many marks it has, and the highest one given. */
export async function subjectMarkInfo(examId: number): Promise<Map<number, { n: number; top: number }>> {
  const info = new Map<number, { n: number; top: number }>();
  if (examId <= 0) return info;

  const rows = await safe(
    () =>
      prisma.examResult.groupBy({
        by: ['exam_subject_id'],
        where: { monthly_exam_id: examId, exam_subject_id: { not: null } },
        _count: { _all: true },
        _max: { marks_obtained: true },
      }),
    []
  );

  for (const row of rows) {
    if (row.exam_subject_id === null) continue;
    info.set(row.exam_subject_id, {
      n: row._count._all,
      top: Number(row._max.marks_obtained ?? 0),
    });
  }
  return info;
}

export async function saveExam(input: ExamInput, adminId: number): Promise<ExamSaveResult> {
  const errors: ExamSaveResult['errors'] = [];

  const existing =
    input.id > 0
      ? await safe(() => prisma.monthlyExam.findUnique({ where: { id: input.id } }), null)
      : null;
  if (input.id > 0 && !existing) {
    return { ok: false, errors: [{ key: 'error.not_found_body' }], examId: 0, updated: false };
  }

  const title = input.title.trim().slice(0, 255);
  const titleBn = input.titleBn.trim().slice(0, 255);
  const remarks = input.remarks.trim().slice(0, 2000);

  if (title === '') errors.push({ key: 'mexam.err_title' });
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) errors.push({ key: 'mexam.err_month' });

  const examDate = input.examDate.trim();
  if (
    examDate !== '' &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(examDate) || Number.isNaN(new Date(`${examDate}T00:00:00Z`).getTime()))
  ) {
    errors.push({ key: 'mexam.err_date' });
  }

  const [courses, batches] = await Promise.all([
    safe(() => prisma.course.findMany({ select: { id: true } }), []),
    safe(() => prisma.batch.findMany({ select: { id: true, course_id: true } }), []),
  ]);
  const batchCourse = new Map(batches.map((batch) => [batch.id, batch.course_id ?? 0]));

  let courseId = courses.some((course) => course.id === input.courseId) ? input.courseId : 0;
  const batchId = batchCourse.has(input.batchId) ? input.batchId : 0;

  if (batchId > 0 && courseId > 0 && batchCourse.get(batchId) !== courseId) {
    errors.push({ key: 'mexam.err_batch_course' });
  } else if (batchId > 0 && courseId === 0) {
    // A batch always belongs to a course, so the course is implied rather than
    // asked for twice.
    courseId = batchCourse.get(batchId) ?? 0;
  }

  const master = await safe(
    () => prisma.subject.findMany({ select: { id: true, name: true, name_bn: true } }),
    []
  );
  const masterById = new Map(master.map((subject) => [subject.id, subject]));

  const old = new Map((await examSubjects(input.id)).map((row) => [row.id, row]));
  const markInfo = await subjectMarkInfo(input.id);

  interface Row {
    id: number;
    subjectId: number | null;
    name: string;
    nameBn: string;
    full: number;
    pass: number;
  }
  const rows: Row[] = [];
  const seen = new Set<string>();
  const kept = new Set<number>();

  for (const row of input.subjects) {
    const chosen = masterById.get(row.subjectId);
    let name = row.name.trim().slice(0, 255);
    let nameBn = row.nameBn.trim().slice(0, 255);

    // Choosing a subject from the list and leaving the name empty means "use
    // the subject's own name".
    if (name === '' && chosen) {
      name = chosen.name;
      if (nameBn === '') nameBn = chosen.name_bn ?? '';
    }
    if (name === '') continue;

    const full = marks(row.full);
    const pass = row.pass.trim() === '' ? Math.round(full * 33) / 100 : marks(row.pass);
    const rowId = old.has(row.id) ? row.id : 0;

    rows.push({
      id: rowId,
      subjectId: chosen ? row.subjectId : null,
      name,
      nameBn,
      full,
      pass,
    });

    const key = name.toLowerCase();
    if (seen.has(key)) errors.push({ key: 'mexam.err_duplicate_subject', vars: { subject: name } });
    seen.add(key);

    if (!Number.isFinite(full) || full <= 0 || full > 1000 || !Number.isFinite(pass) || pass < 0 || pass > full) {
      errors.push({ key: 'mexam.err_subject_marks', vars: { subject: name } });
    }
    if (rowId > 0 && (markInfo.get(rowId)?.top ?? 0) > full) {
      errors.push({ key: 'mexam.err_full_below_marks', vars: { subject: name } });
    }
    if (rowId > 0) kept.add(rowId);
  }

  if (rows.length === 0) errors.push({ key: 'mexam.err_no_subjects' });

  for (const [id, subject] of old) {
    if (!kept.has(id) && markInfo.has(id)) {
      errors.push({ key: 'mexam.err_remove_marked', vars: { subject: subject.subject_name } });
    }
  }

  if (errors.length > 0) return { ok: false, errors, examId: input.id, updated: existing !== null };

  try {
    const examId = await prisma.$transaction(async (tx) => {
      const data = {
        title,
        title_bn: titleBn !== '' ? titleBn : null,
        exam_month: input.month,
        course_id: courseId > 0 ? courseId : null,
        batch_id: batchId > 0 ? batchId : null,
        exam_date: examDate !== '' ? new Date(`${examDate}T00:00:00.000Z`) : null,
        show_position: input.showPosition,
        remarks: remarks !== '' ? remarks : null,
      };

      let id = input.id;
      if (id > 0) {
        await tx.monthlyExam.update({ where: { id }, data });
      } else {
        const created = await tx.monthlyExam.create({
          data: {
            ...data,
            status: 'draft',
            total_marks: 0,
            full_marks: 0,
            pass_marks: 0,
            created_by: adminId > 0 ? adminId : null,
          },
        });
        id = created.id;
      }

      // Removals first: a rename that reuses a departing subject's name would
      // otherwise hit the unique index while both rows exist.
      for (const [rowId] of old) {
        if (!kept.has(rowId)) {
          await tx.monthlyExamSubject.deleteMany({ where: { id: rowId, exam_id: id } });
        }
      }

      for (const [index, row] of rows.entries()) {
        const subjectData = {
          subject_id: row.subjectId,
          subject_name: row.name,
          subject_name_bn: row.nameBn !== '' ? row.nameBn : null,
          full_marks: row.full,
          pass_marks: row.pass,
          sort_order: index + 1,
        };

        if (row.id > 0) {
          await tx.monthlyExamSubject.updateMany({
            where: { id: row.id, exam_id: id },
            data: subjectData,
          });
          // The flat columns on exam_results are what older pages read.
          await tx.examResult.updateMany({
            where: { exam_subject_id: row.id },
            data: { subject: row.name, total_marks: row.full },
          });
        } else {
          await tx.monthlyExamSubject.create({ data: { exam_id: id, ...subjectData } });
        }
      }

      await tx.examResult.updateMany({
        where: { monthly_exam_id: id },
        data: {
          exam_name: title,
          exam_date: examDate !== '' ? new Date(`${examDate}T00:00:00.000Z`) : null,
        },
      });

      // The exam's totals are the sum of its subjects, capped at the column's
      // own limit rather than allowed to overflow it.
      const totals = await tx.monthlyExamSubject.aggregate({
        where: { exam_id: id },
        _sum: { full_marks: true, pass_marks: true },
      });
      const full = Math.min(Number(totals._sum.full_marks ?? 0), 9999.99);
      const pass = Math.min(Number(totals._sum.pass_marks ?? 0), 9999.99);

      await tx.monthlyExam.update({
        where: { id },
        data: { total_marks: full, full_marks: full, pass_marks: pass },
      });

      return id;
    });

    return { ok: true, errors: [], examId, updated: existing !== null };
  } catch {
    return { ok: false, errors: [{ key: 'error.generic' }], examId: input.id, updated: existing !== null };
  }
}

/** Publishing, or taking a published exam back to draft. */
export async function toggleExamStatus(
  examId: number
): Promise<{ ok: boolean; message: string }> {
  const exam = await safe(
    () => prisma.monthlyExam.findUnique({ where: { id: examId }, select: { status: true } }),
    null
  );
  if (!exam) return { ok: false, message: 'error.not_found_body' };

  const publish = exam.status !== 'published';
  try {
    await prisma.monthlyExam.update({
      where: { id: examId },
      data: {
        status: publish ? 'published' : 'draft',
        published_at: publish ? new Date() : null,
      },
    });
  } catch {
    return { ok: false, message: 'error.generic' };
  }

  return { ok: true, message: publish ? 'mexam.published' : 'mexam.unpublished' };
}

export async function deleteExam(examId: number): Promise<{ ok: boolean; message: string }> {
  const exam = await safe(
    () => prisma.monthlyExam.findUnique({ where: { id: examId }, select: { status: true } }),
    null
  );
  if (!exam) return { ok: false, message: 'error.not_found_body' };

  // A published exam has been shown to students; unpublishing it first is a
  // second, deliberate decision.
  if (exam.status === 'published') return { ok: false, message: 'mexam.delete_published' };

  try {
    await prisma.monthlyExam.delete({ where: { id: examId } });
  } catch {
    return { ok: false, message: 'error.generic' };
  }
  return { ok: true, message: 'mexam.deleted' };
}
