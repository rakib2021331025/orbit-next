'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import type { ClassAction, ClassFormState } from './ClassForm';

const EMPTY: ClassFormState = { error: '', message: '' };

/**
 * The per-class buttons.
 *
 * Cancelling and deleting both ask first, and for opposite reasons: cancelling
 * messages every student in the class's audience, and deleting takes the class
 * and its handouts away for good.
 */
export function ClassRowActions({
  actions,
  classId,
  status,
  editHref,
  labels,
}: {
  actions: { setStatus: ClassAction; remove: ClassAction };
  classId: number;
  status: string;
  editHref: string;
  labels: {
    edit: string;
    cancel: string;
    complete: string;
    reopen: string;
    remove: string;
    confirmCancel: string;
    confirmDelete: string;
    dismiss: string;
  };
}) {
  const [statusState, statusAction, statusPending] = useActionState(actions.setStatus, EMPTY);
  const [deleteState, deleteAction, deletePending] = useActionState(actions.remove, EMPTY);
  const [confirming, setConfirming] = useState<'' | 'cancel' | 'delete'>('');

  const error = statusState.error || deleteState.error;
  const button =
    'rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2';

  if (confirming === 'delete') {
    return (
      <form action={deleteAction} className="flex flex-wrap items-center justify-end gap-2">
        <input type="hidden" name="id" value={classId} />
        <span className="text-xs text-ink">{labels.confirmDelete}</span>
        <button
          type="submit"
          disabled={deletePending}
          className="rounded-orbit bg-red-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-red-700"
        >
          {labels.remove}
        </button>
        <button type="button" onClick={() => setConfirming('')} className={button}>
          {labels.dismiss}
        </button>
      </form>
    );
  }

  if (confirming === 'cancel') {
    return (
      <form
        action={statusAction}
        onSubmit={() => setConfirming('')}
        className="flex flex-wrap items-center justify-end gap-2"
      >
        <input type="hidden" name="id" value={classId} />
        <input type="hidden" name="status" value="cancelled" />
        <span className="text-xs text-ink">{labels.confirmCancel}</span>
        <button
          type="submit"
          disabled={statusPending}
          className="rounded-orbit bg-red-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-red-700"
        >
          {labels.cancel}
        </button>
        <button type="button" onClick={() => setConfirming('')} className={button}>
          {labels.dismiss}
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {error !== '' && <span className="w-full text-end text-xs text-red-600">{error}</span>}

      <Link href={editHref} className={button}>
        {labels.edit}
      </Link>

      {status === 'scheduled' && (
        <form action={statusAction} className="inline">
          <input type="hidden" name="id" value={classId} />
          <input type="hidden" name="status" value="completed" />
          <button type="submit" disabled={statusPending} className={button}>
            {labels.complete}
          </button>
        </form>
      )}

      {status !== 'scheduled' && (
        <form action={statusAction} className="inline">
          <input type="hidden" name="id" value={classId} />
          <input type="hidden" name="status" value="scheduled" />
          <button type="submit" disabled={statusPending} className={button}>
            {labels.reopen}
          </button>
        </form>
      )}

      {status === 'scheduled' && (
        <button type="button" onClick={() => setConfirming('cancel')} className={button}>
          {labels.cancel}
        </button>
      )}

      <button
        type="button"
        onClick={() => setConfirming('delete')}
        className="rounded-orbit border border-red-300 px-2.5 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:hover:bg-red-950/40"
      >
        {labels.remove}
      </button>
    </div>
  );
}
