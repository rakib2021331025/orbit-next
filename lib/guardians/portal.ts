import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { studentEnrollments } from '@/lib/student/scope';
import { summarise } from '@/lib/attendance/report';
import type { AttendanceTotals } from '@/lib/attendance/report';
import type { GuardianChild } from '@/lib/auth/guards';
import type { Translator } from '@/lib/i18n';

/**
 * The reads behind the guardian portal, from includes/guardian_lib.php.
 *
 * Every function here takes a child that `GuardianPage` has ALREADY resolved
 * against the signed-in guardian's own children. None of them looks a student up
 * by an id from the URL — that is the one rule that keeps a parent inside their
 * own family, and it lives in `requireGuardianChild()`, not scattered here.
 */

/** "Father", "Mother", "Guardian" — or nothing for an unknown relation. */
export function relationLabel(relation: string | null | undefined, t: Translator): string {
  return relation === 'father' || relation === 'mother' || relation === 'guardian'
    ? t.t(`guardian.relation.${relation}`)
    : '';
}

/**
 * The course and batch a child is shown under, from orbit_guardian_child_course():
 * the first ACTIVE enrolment, else the legacy columns on the student record.
 */
export async function childCourse(child: GuardianChild, t: Translator): Promise<[string, string]> {
  const enrollments = await studentEnrollments(child.id);
  for (const enrollment of enrollments) {
    if (enrollment.status !== 'active') continue;
    const course = t.pick(
      { n: enrollment.course?.name || enrollment.course_name || '', n_bn: enrollment.course?.name_bn ?? '' },
      'n'
    );
    const batch = t.pick(
      { n: enrollment.batch?.name || enrollment.batch_name || '', n_bn: enrollment.batch?.name_bn ?? '' },
      'n'
    );
    return [course, batch];
  }
  return [(child.course ?? '').trim(), (child.batch ?? '').trim()];
}

/** First and last instant of a YYYY-MM month, in UTC as dates are stored. */
export function monthRange(month: string): { from: Date; to: Date } {
  const [year, mon] = month.split('-').map(Number);
  return {
    from: new Date(Date.UTC(year, mon - 1, 1)),
    to: new Date(Date.UTC(year, mon, 0, 23, 59, 59, 999)),
  };
}

/** A valid `?month=YYYY-MM` from 2000 on, else the current month. */
export function parseMonth(raw: string | undefined): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(raw ?? '');
  if (match && Number(match[1]) >= 2000) return raw!;
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** The month before or after, as YYYY-MM. */
export function shiftMonth(month: string, by: number): string {
  const [year, mon] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, mon - 1 + by, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Totals per month, newest first, from orbit_attendance_summary_by_month().
 * Only months with at least one record appear.
 */
export async function attendanceByMonth(
  studentId: number,
  limit = 12
): Promise<{ month: string; totals: AttendanceTotals }[]> {
  let rows: { attendance_date: Date; status: string | null }[] = [];
  try {
    rows = await prisma.attendance.findMany({
      where: { student_id: studentId },
      select: { attendance_date: true, status: true },
    });
  } catch {
    return [];
  }

  const months = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const month = row.attendance_date.toISOString().slice(0, 7);
    const counts = months.get(month) ?? {};
    const status = row.status ?? '';
    counts[status] = (counts[status] ?? 0) + 1;
    months.set(month, counts);
  }

  return [...months.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, limit)
    .map(([month, counts]) => ({ month, totals: summarise(counts) }));
}
