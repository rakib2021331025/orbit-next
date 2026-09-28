'use client';

import { useActionState, useState } from 'react';
import { moderateReviewAction } from './actions';
import { emptyReviewState } from './state';

/**
 * Approving, hiding or deleting one student review.
 *
 * Approving publishes it on the website, which is why the button says so and why
 * deleting asks first — a deleted review cannot be recovered from this screen.
 */
export function ReviewRow({
  reviewId,
  status,
  labels,
}: {
  reviewId: number;
  status: string;
  labels: {
    approve: string;
    hide: string;
    remove: string;
    confirmDelete: string;
    dismiss: string;
  };
}) {
  const [state, action, pending] = useActionState(moderateReviewAction, emptyReviewState);
  const [confirming, setConfirming] = useState(false);

  const button =
    'rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2';

  if (confirming) {
    return (
      <form action={action} className="flex flex-wrap items-center justify-end gap-2">
        <input type="hidden" name="id" value={reviewId} />
        <input type="hidden" name="action" value="delete_review" />
        <span className="text-xs text-ink">{labels.confirmDelete}</span>
        <button
          type="submit"
          disabled={pending}
          className="rounded-orbit bg-red-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-red-700"
        >
          {labels.remove}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className={button}>
          {labels.dismiss}
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {state.error !== '' && <span className="w-full text-end text-xs text-red-600">{state.error}</span>}

      <form action={action} className="inline">
        <input type="hidden" name="id" value={reviewId} />
        <input
          type="hidden"
          name="action"
          value={status === 'approved' ? 'hide_review' : 'approve_review'}
        />
        <button
          type="submit"
          disabled={pending}
          className={
            status === 'approved'
              ? button
              : 'rounded-orbit bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-emerald-700'
          }
        >
          {status === 'approved' ? labels.hide : labels.approve}
        </button>
      </form>

      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-orbit border border-red-300 px-2.5 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:hover:bg-red-950/40"
      >
        {labels.remove}
      </button>
    </div>
  );
}
