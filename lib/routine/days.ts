/**
 * The teaching week, Saturday first — as the institute runs and as the routine
 * is read.
 *
 * Stored as the **English weekday name**, because the student portal matches a
 * routine row against a student's enrolment by that exact string. Only the
 * interface is translated; a translated day in the column would make the row
 * invisible to the matcher.
 */
export const DAYS = [
  'Saturday',
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
] as const;

export type WeekDay = (typeof DAYS)[number];

export function isWeekDay(value: unknown): value is WeekDay {
  return typeof value === 'string' && (DAYS as readonly string[]).includes(value);
}
