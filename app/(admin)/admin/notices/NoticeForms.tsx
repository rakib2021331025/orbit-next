'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/ui/Feedback';
import { saveNoticeAction, toggleNoticeAction, deleteNoticeAction } from './actions';

const CONTROL =
  'w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';
const SMALL =
  'rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2';

const EMPTY = { error: '', message: '' };

export interface NoticeValues {
  id: number;
  title: string;
  description: string;
  status: string;
  branch_id: number | null;
}

/** Posting or editing one notice. */
export function NoticeForm({
  values,
  branches,
  labels,
  cancelHref,
}: {
  values: NoticeValues;
  branches: { id: number; name: string }[];
  labels: Record<string, string>;
  cancelHref: string;
}) {
  const [state, action, pending] = useActionState(saveNoticeAction, EMPTY);
  const editing = values.id > 0;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={values.id} />

      {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}
      {state.message !== '' && <Alert tone="success">{state.message}</Alert>}

      <label className="block text-xs font-medium text-ink">
        {labels.title} *
        <input
          name="title"
          required
          maxLength={255}
          defaultValue={values.title}
          className={`mt-1 ${CONTROL}`}
        />
      </label>

      <label className="block text-xs font-medium text-ink">
        {labels.description} *
        <textarea
          name="description"
          required
          rows={6}
          maxLength={20000}
          defaultValue={values.description}
          className={`mt-1 ${CONTROL}`}
        />
        <span className="mt-1 block text-[11px] font-normal text-ink-muted">
          {labels.descriptionHelp}
        </span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-ink">
          {labels.status}
          <select name="status" defaultValue={values.status} className={`mt-1 ${CONTROL}`}>
            <option value="active">{labels.statusActive}</option>
            <option value="inactive">{labels.statusInactive}</option>
          </select>
          <span className="mt-1 block text-[11px] font-normal text-ink-muted">
            {labels.statusHelp}
          </span>
        </label>

        {branches.length > 0 && (
          <label className="block text-xs font-medium text-ink">
            {labels.branch}
            <select
              name="branch_id"
              defaultValue={values.branch_id ? String(values.branch_id) : ''}
              className={`mt-1 ${CONTROL}`}
            >
              {/* No branch means every branch's students see it. */}
              <option value="">{labels.branchAll}</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] font-normal text-ink-muted">
              {labels.branchHelp}
            </span>
          </label>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
        >
          {labels.save}
        </button>
        {editing && (
          <Link href={cancelHref} className={SMALL}>
            {labels.cancelEdit}
          </Link>
        )}
      </div>
    </form>
  );
}

/** Activate / deactivate and delete, on one notice. */
export function NoticeRowActions({
  noticeId,
  status,
  editHref,
  labels,
}: {
  noticeId: number;
  status: string;
  editHref: string;
  labels: {
    edit: string;
    activate: string;
    deactivate: string;
    remove: string;
    confirmDelete: string;
    dismiss: string;
  };
}) {
  const [toggleState, toggleAction, togglePending] = useActionState(toggleNoticeAction, EMPTY);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteNoticeAction, EMPTY);
  const [confirming, setConfirming] = useState(false);

  const error = toggleState.error || deleteState.error;

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {error !== '' && <span className="w-full text-end text-xs text-red-600">{error}</span>}

      <Link href={editHref} className={SMALL}>
        {labels.edit}
      </Link>

      <form action={toggleAction} className="inline">
        <input type="hidden" name="id" value={noticeId} />
        <button type="submit" disabled={togglePending} className={SMALL}>
          {status === 'active' ? labels.deactivate : labels.activate}
        </button>
      </form>

      {confirming ? (
        <form action={deleteAction} className="inline-flex items-center gap-2">
          <input type="hidden" name="id" value={noticeId} />
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
