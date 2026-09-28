import 'server-only';
import { prisma } from '@/lib/db/prisma';

/**
 * Month-by-month progress, from includes/progress_lib.php.
 *
 * Built from PUBLISHED monthly exams only, so a draft cannot move a student's
 * trend line.
 *
 * Two details that look small and are not:
 *
 *   - **Subjects are keyed by id when there is one, and by a hash of the name
 *     otherwise.** An exam can name a subject freely, and "Physics" in March must
 *     line up with "Physics" in April or the per-subject trend is nonsense.
 *   - **A change smaller than the flat band counts as "same".** Without it every
 *     student is "improving" or "declining" by 0.3% every month, which tells
 *     nobody anything.
 */

/** Below this many percentage points, a change is treated as no change. */
const FLAT_POINTS = 2;

export interface SubjectPoint {
  key: string;
  label: string;
  labelBn: string | null;
  obtained: number;
  full: number;
  percentage: number;
  absent: boolean;
  passMarks: number | null;
}

export interface MonthPoint {
  ym: string;
  obtained: number;
  full: number;
  percentage: number;
  subjects: SubjectPoint[];
}

export type ChangeState = 'improved' | 'declined' | 'same' | 'none';

export interface MonthChange {
  ym: string;
  previousYm: string | null;
  current: number | null;
  previous: number | null;
  delta: number | null;
  state: ChangeState;
  /** True when the two months are not consecutive (e.g. March after January). */
  gap: boolean;
}

/** A stable key for a subject, preferring its id. */
function subjectKey(subjectId: number | null, name: string): string {
  if (subjectId) return `id${subjectId}`;
  // Not cryptographic — just a stable bucket for a free-text name.
  let hash = 0;
  const text = name.trim().toLowerCase();
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }
  return `n${(hash >>> 0).toString(36)}`;
}

/** Whole months between two `YYYY-MM` values. */
function monthDiff(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/** The student's per-month performance, oldest first. */
export async function studentProgress(studentId: number): Promise<MonthPoint[]> {
  let rows: {
    exam_month: string;
    subject_id: number | null;
    subject_name: string;
    subject_name_bn: string | null;
    full_marks: unknown;
    pass_marks: unknown;
    marks_obtained: unknown;
    is_absent: boolean;
  }[] = [];

  try {
    const results = await prisma.examResult.findMany({
      where: {
        student_id: studentId,
        monthly_exam: { status: 'published' },
        exam_subject_id: { not: null },
      },
      select: {
        marks_obtained: true,
        is_absent: true,
        monthly_exam: { select: { exam_month: true } },
        exam_subject: {
          select: {
            subject_id: true,
            subject_name: true,
            subject_name_bn: true,
            full_marks: true,
            pass_marks: true,
          },
        },
      },
    });

    rows = results
      .filter((row) => row.exam_subject !== null && row.monthly_exam !== null)
      .map((row) => ({
        exam_month: row.monthly_exam!.exam_month,
        subject_id: row.exam_subject!.subject_id,
        subject_name: row.exam_subject!.subject_name,
        subject_name_bn: row.exam_subject!.subject_name_bn,
        full_marks: row.exam_subject!.full_marks,
        pass_marks: row.exam_subject!.pass_marks,
        marks_obtained: row.marks_obtained,
        is_absent: row.is_absent,
      }));
  } catch {
    return [];
  }

  const months = new Map<string, MonthPoint>();

  for (const row of rows) {
    const full = Number(row.full_marks);
    // A zero-mark subject or a malformed month would distort every average.
    if (full <= 0 || !/^\d{4}-\d{2}$/.test(row.exam_month)) continue;

    const month = months.get(row.exam_month) ?? {
      ym: row.exam_month,
      obtained: 0,
      full: 0,
      percentage: 0,
      subjects: [],
    };

    const obtained = row.is_absent ? 0 : Number(row.marks_obtained);

    month.obtained += obtained;
    month.full += full;
    month.subjects.push({
      key: subjectKey(row.subject_id, row.subject_name),
      label: row.subject_name,
      labelBn: row.subject_name_bn,
      obtained,
      full,
      percentage: Math.round((obtained / full) * 1000) / 10,
      absent: row.is_absent,
      passMarks: row.pass_marks === null ? null : Number(row.pass_marks),
    });

    months.set(row.exam_month, month);
  }

  return [...months.values()]
    .map((month) => ({
      ...month,
      percentage: month.full > 0 ? Math.round((month.obtained / month.full) * 1000) / 10 : 0,
    }))
    .sort((a, b) => a.ym.localeCompare(b.ym));
}

/**
 * Month-on-month change.
 *
 * Compared against the previous month that HAS data, not the calendar month
 * before — a student who missed February should be compared with January, and
 * `gap` says so.
 */
export function progressChanges(months: MonthPoint[]): MonthChange[] {
  const out: MonthChange[] = [];
  let previous: { ym: string; value: number } | null = null;

  for (const month of months) {
    const current = month.percentage;
    const change: MonthChange = {
      ym: month.ym,
      previousYm: null,
      current,
      previous: null,
      delta: null,
      state: 'none',
      gap: false,
    };

    if (previous !== null) {
      const delta = Math.round((current - previous.value) * 100) / 100;
      change.previousYm = previous.ym;
      change.previous = previous.value;
      change.delta = delta;
      change.state = Math.abs(delta) < FLAT_POINTS ? 'same' : delta > 0 ? 'improved' : 'declined';
      change.gap = monthDiff(previous.ym, month.ym) > 1;
    }

    previous = { ym: month.ym, value: current };
    out.push(change);
  }

  return out;
}

/** Per-subject trend across the months, for the subject table. */
export function subjectTrends(months: MonthPoint[]) {
  const subjects = new Map<string, { label: string; labelBn: string | null; points: { ym: string; percentage: number; absent: boolean }[] }>();

  for (const month of months) {
    for (const subject of month.subjects) {
      const entry =
        subjects.get(subject.key) ?? {
          label: subject.label,
          labelBn: subject.labelBn,
          points: [],
        };
      entry.points.push({ ym: month.ym, percentage: subject.percentage, absent: subject.absent });
      subjects.set(subject.key, entry);
    }
  }

  return [...subjects.entries()].map(([key, value]) => {
    const marked = value.points.filter((point) => !point.absent);
    const first = marked[0]?.percentage ?? null;
    const last = marked[marked.length - 1]?.percentage ?? null;
    const delta = first !== null && last !== null ? Math.round((last - first) * 10) / 10 : null;

    return {
      key,
      label: value.label,
      labelBn: value.labelBn,
      points: value.points,
      latest: last,
      delta,
      state: (delta === null
        ? 'none'
        : Math.abs(delta) < FLAT_POINTS
          ? 'same'
          : delta > 0
            ? 'improved'
            : 'declined') as ChangeState,
    };
  });
}
