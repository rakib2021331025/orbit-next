import type { PublicCourse } from './courses';

/**
 * Batch and price rules, from includes/course_lib.php.
 *
 * All of these decide what a visitor is told about money and availability, so
 * each one is the original's logic rather than a reasonable-looking substitute.
 */

type Batch = PublicCourse['batches'][number];

/** A hybrid course accepts both kinds of batch; anything else only its own. */
export function courseAcceptsBatchType(courseType: string, batchType: string): boolean {
  return courseType === 'hybrid' || courseType === batchType;
}

/**
 * The batches a visitor may actually join.
 *
 * An offline batch attached to an online-only course is not offered — the
 * mismatch happens when a course's type is changed after its batches were
 * created, and showing those batches would take an enrolment the centre cannot
 * deliver.
 */
export function enrollableBatches(course: PublicCourse): Batch[] {
  return course.batches.filter(
    (batch) => batch.status === 'active' && courseAcceptsBatchType(course.course_type, batch.batch_type)
  );
}

/** Active, open for enrolment, AND with at least one batch to join. */
export function courseIsOpen(course: PublicCourse): boolean {
  return (
    course.status === 'active' &&
    course.enrollment_status === 'open' &&
    enrollableBatches(course).length > 0
  );
}

/** A batch's own fee, falling back to the course's. */
export function batchFee(batch: Batch, courseFee: unknown): number | null {
  if (batch.fee !== null && batch.fee !== undefined) return Number(batch.fee);
  if (courseFee !== null && courseFee !== undefined && courseFee !== '') return Number(courseFee);
  return null;
}

/**
 * The price on a card: the LOWEST enrollable batch fee, with `from` set when the
 * batches are not all the same price.
 *
 * Showing the lowest without "from" would be a misleading advertisement; showing
 * the course fee when batches are priced separately would be simply wrong.
 */
export function coursePrice(course: PublicCourse): { amount: number | null; from: boolean } {
  const fees = enrollableBatches(course)
    .map((batch) => batchFee(batch, course.fee))
    .filter((fee): fee is number => fee !== null);

  if (fees.length === 0) {
    return {
      amount: course.fee === null || course.fee === undefined ? null : Number(course.fee),
      from: false,
    };
  }
  const min = Math.min(...fees);
  return { amount: min, from: min !== Math.max(...fees) };
}

/** The earliest upcoming start date among enrollable batches, or null. */
export function nextStartDate(course: PublicCourse): Date | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dates = enrollableBatches(course)
    .map((batch) => batch.start_date)
    .filter((date): date is Date => date instanceof Date && date >= today)
    .sort((a, b) => a.getTime() - b.getTime());

  return dates[0] ?? null;
}
