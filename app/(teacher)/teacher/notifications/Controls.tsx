'use client';

import { useActionState, useState } from 'react';
import { markAllReadAction, markOneReadAction, clearReadAction, openNotificationAction } from './actions';
import { emptyNotificationState } from './state';

const BUTTON =
  'inline-flex items-center gap-1.5 rounded-orbit border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-2 disabled:opacity-60';

/**
 * Mark all as read, and clear the read ones.
 *
 * Clearing asks first, and only ever removes what has already been read — an
 * unread notification is something the teacher has not seen yet.
 */
export function HeaderActions({
  unread,
  readCount,
  labels,
}: {
  unread: number;
  readCount: number;
  labels: { markAll: string; clearRead: string; confirmClear: string; dismiss: string };
}) {
  const [markState, markAction, markPending] = useActionState(
    markAllReadAction,
    emptyNotificationState
  );
  const [clearState, clearAction, clearPending] = useActionState(
    clearReadAction,
    emptyNotificationState
  );
  const [confirming, setConfirming] = useState(false);

  const error = markState.error || clearState.error;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {error !== '' && <span className="w-full text-end text-xs text-red-600">{error}</span>}

      {unread > 0 && (
        <form action={markAction}>
          <button type="submit" disabled={markPending} className={BUTTON}>
            <i className="bi bi-check2-all" aria-hidden />
            {labels.markAll}
          </button>
        </form>
      )}

      {readCount > 0 &&
        (confirming ? (
          <form action={clearAction} className="flex items-center gap-2">
            <span className="text-xs text-ink">{labels.confirmClear}</span>
            <button
              type="submit"
              disabled={clearPending}
              className="rounded-orbit bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-700"
            >
              {labels.clearRead}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className={BUTTON}>
              {labels.dismiss}
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-1.5 rounded-orbit border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:hover:bg-red-950/40"
          >
            <i className="bi bi-trash" aria-hidden />
            {labels.clearRead}
          </button>
        ))}
    </div>
  );
}

/** Open (internal links only) and mark-as-read, on one notification. */
export function RowActions({
  notificationId,
  href,
  external,
  unread,
  labels,
}: {
  notificationId: number;
  href: string | null;
  external: boolean;
  unread: boolean;
  labels: { open: string; markRead: string };
}) {
  const [openState, openAction, openPending] = useActionState(
    openNotificationAction,
    emptyNotificationState
  );
  const [markState, markAction, markPending] = useActionState(
    markOneReadAction,
    emptyNotificationState
  );

  const error = openState.error || markState.error;
  if (href === null && !unread) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {error !== '' && <span className="w-full text-xs text-red-600">{error}</span>}

      {href !== null &&
        (external ? (
          // An outside address is a link the teacher chooses to follow, never a
          // redirect the portal performs for them.
          <a href={href} target="_blank" rel="noopener noreferrer" className={BUTTON}>
            <i className="bi bi-box-arrow-up-right" aria-hidden />
            {labels.open}
          </a>
        ) : (
          <form action={openAction}>
            <input type="hidden" name="id" value={notificationId} />
            <button type="submit" disabled={openPending} className={BUTTON}>
              <i className="bi bi-arrow-right-circle" aria-hidden />
              {labels.open}
            </button>
          </form>
        ))}

      {unread && (
        <form action={markAction}>
          <input type="hidden" name="id" value={notificationId} />
          <button type="submit" disabled={markPending} className={BUTTON}>
            <i className="bi bi-check2" aria-hidden />
            {labels.markRead}
          </button>
        </form>
      )}
    </div>
  );
}
