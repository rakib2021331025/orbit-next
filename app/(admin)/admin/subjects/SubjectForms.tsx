'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/ui/Feedback';
import { saveSubjectAction, toggleSubjectAction, deleteSubjectAction } from './actions';
import { emptySubjectState } from './state';

const CONTROL =
  'w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';
const SMALL =
  'rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2';

export interface SubjectValues {
  id: number;
  name: string;
  name_bn: string;
  code: string;
  sort_order: number;
  status: string;
}

/** Add or edit one subject. */
export function SubjectForm({
  values,
  labels,
}: {
  values: SubjectValues;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(saveSubjectAction, emptySubjectState);
  const editing = values.id > 0;

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={values.id} />

      <h2 className="text-sm font-semibold text-ink-heading">
        {editing ? labels.edit : labels.add}
      </h2>

      {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}
      {state.message !== '' && <Alert tone="success">{state.message}</Alert>}

      <label className="block text-xs font-medium text-ink">
        {labels.name} *
        <input
          name="name"
          required
          maxLength={150}
          defaultValue={values.name}
          className={`mt-1 ${CONTROL}`}
        />
      </label>

      <label className="block text-xs font-medium text-ink">
        {labels.nameBn}
        <input
          name="name_bn"
          maxLength={150}
          lang="bn"
          defaultValue={values.name_bn}
          className={`mt-1 ${CONTROL}`}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-medium text-ink">
          {labels.code}
          <input name="code" maxLength={30} defaultValue={values.code} className={`mt-1 ${CONTROL}`} />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.sort}
          <input
            name="sort_order"
            type="number"
            min={0}
            max={9999}
            defaultValue={values.sort_order}
            className={`mt-1 ${CONTROL}`}
          />
        </label>
      </div>

      <label className="block text-xs font-medium text-ink">
        {labels.status}
        <select name="status" defaultValue={values.status} className={`mt-1 ${CONTROL}`}>
          <option value="active">{labels.statusActive}</option>
          <option value="inactive">{labels.statusInactive}</option>
        </select>
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
        >
          {labels.save}
        </button>
        {editing && (
          <Link href="/admin/subjects" className={SMALL}>
            {labels.cancelEdit}
          </Link>
        )}
      </div>
    </form>
  );
}

/**
 * One subject's row actions.
 *
 * Delete is offered only for a subject no exam uses; the server refuses the rest
 * with the count, so an admin who reaches it anyway is told why rather than just
 * being stopped.
 */
export function SubjectRowActions({
  subjectId,
  status,
  usedCount,
  labels,
}: {
  subjectId: number;
  status: string;
  usedCount: number;
  labels: {
    edit: string;
    activate: string;
    deactivate: string;
    remove: string;
    confirmDelete: string;
    dismiss: string;
  };
}) {
  const [toggleState, toggleAction, togglePending] = useActionState(
    toggleSubjectAction,
    emptySubjectState
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteSubjectAction,
    emptySubjectState
  );
  const [confirming, setConfirming] = useState(false);

  const error = toggleState.error || deleteState.error;

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {error !== '' && <span className="w-full text-end text-xs text-red-600">{error}</span>}

      <Link href={`/admin/subjects?edit=${subjectId}`} className={SMALL}>
        {labels.edit}
      </Link>

      <form action={toggleAction} className="inline">
        <input type="hidden" name="id" value={subjectId} />
        <button type="submit" disabled={togglePending} className={SMALL}>
          {status === 'active' ? labels.deactivate : labels.activate}
        </button>
      </form>

      {usedCount === 0 &&
        (confirming ? (
          <form action={deleteAction} className="inline-flex items-center gap-2">
            <input type="hidden" name="id" value={subjectId} />
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
        ))}
    </div>
  );
}
