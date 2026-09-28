/**
 * The grading scale, from includes/result_lib.php.
 *
 * These numbers are the institution's published rules, not a convention to be
 * improved on — a student's certificate depends on them. Changing a band would
 * silently re-grade every historical result the app displays.
 */

export const GRADE_SCALE: readonly [number, string, number][] = [
  [80, 'A+', 5.0],
  [70, 'A', 4.0],
  [60, 'A-', 3.5],
  [50, 'B', 3.0],
  [40, 'C', 2.0],
  [33, 'D', 1.0],
  [0, 'F', 0.0],
];

export interface Grade {
  grade: string;
  point: number;
}

export function gradeForPercentage(percentage: number): Grade {
  for (const [floor, grade, point] of GRADE_SCALE) {
    if (percentage >= floor) return { grade, point };
  }
  return { grade: 'F', point: 0 };
}

/** The overall letter from a GPA. */
export function gradeForGpa(gpa: number): string {
  if (gpa >= 5.0) return 'A+';
  if (gpa >= 4.0) return 'A';
  if (gpa >= 3.5) return 'A-';
  if (gpa >= 3.0) return 'B';
  if (gpa >= 2.0) return 'C';
  if (gpa >= 1.0) return 'D';
  return 'F';
}

/**
 * "12.50" → "12.5", "12.00" → "12".
 *
 * Trailing zeros are dropped because a mark sheet full of `45.00` reads as
 * machine output; `45` is what a teacher wrote.
 */
export function formatMark(value: number | null | undefined, digits: (v: string | number) => string): string {
  if (value === null || value === undefined) return '';
  const text = value.toFixed(2).replace(/\.?0+$/, '');
  return digits(text);
}

/** Bangla digits → Latin, so a student may type either into a lookup form. */
export function toLatinDigits(value: unknown): string {
  const map: Record<string, string> = {
    '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
    '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9',
  };
  return String(value ?? '').replace(/[০-৯]/g, (d) => map[d] ?? d);
}

/** A Student ID as typed → the form stored in `students.student_id_no`. */
export function normaliseStudentIdNo(value: unknown): string {
  return toLatinDigits(value).replace(/\s+/g, '').toUpperCase().slice(0, 30);
}
