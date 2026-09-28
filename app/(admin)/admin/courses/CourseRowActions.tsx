'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { toggleCourseAction, deleteCourseAction } from './actions';
import { emptyCourseState } from './state';

const SMALL =
  'rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2';

/**
 * One course's actions.
 *
 * Status and enrollment are separate switches because they answer different
 * questions: an inactive course disappears from the website, while a course with
 * enrollment closed is still shown — prospective students can read about it — and
 * simply does not take applications.
 */
export function CourseRowActions({
  courseId,
  status,
  enrollmentStatus,
  featured,
  labels,
}: {
  courseId: number;
  status: string;
  enrollmentStatus: string;
  featured: boolean;
  labels: {
    edit: string;
    batches: string;
    activate: string;
    deactivate: string;
    openEnrollment: string;
    closeEnrollment: string;
    feature: string;
    unfeature: string;
    remove: string;
    confirmDelete: string;
    dismiss: string;
  };
}) {
  const [toggleState, toggleAction, togglePending] = useActionState(
    toggleCourseAction,
    emptyCourseState
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteCourseAction,
    emptyCourseState
  );
  const [confirming, setConfirming] = useState(false);

  const error = toggleState.error || deleteState.error;

  const toggle = (what: string, label: string) => (
    <form action={toggleAction} className="inline">
      <input type="hidden" name="course_id" value={courseId} />
      <input type="hidden" name="what" value={what} />
      <button type="submit" disabled={togglePending} className={SMALL}>
        {label}
      </button>
    </form>
  );

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {error !== '' && <span className="w-full text-end text-xs text-red-600">{error}</span>}

      <Link href={`/admin/courses?edit=${courseId}`} className={SMALL}>
        {labels.edit}
      </Link>
      <Link href={`/admin/batches?course=${courseId}`} className={SMALL}>
        {labels.batches}
      </Link>

      {toggle('status', status === 'active' ? labels.deactivate : labels.activate)}
      {toggle(
        'enrollment',
        enrollmentStatus === 'open' ? labels.closeEnrollment : labels.openEnrollment
      )}
      {toggle('featured', featured ? labels.unfeature : labels.feature)}

      {confirming ? (
        <form action={deleteAction} className="inline-flex items-center gap-2">
          <input type="hidden" name="course_id" value={courseId} />
          <span className="text-xs text-ink">{labels.confirmDelete}</span>
          <button
            type="submit"
            disabled={deletePending}
            className="rounded-orbit bg-red-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-red-700"
          >
            {labels.remove}
          </button>
          <button type="button" onClick={() => setConfirming(false)} className={SMALL}>
            {labels.dismiss}
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-orbit border border-red-300 px-2.5 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:hover:bg-red-950/40"
        >
          {labels.remove}
        </button>
      )}
    </div>
  );
}
