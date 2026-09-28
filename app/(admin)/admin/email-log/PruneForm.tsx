'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/Feedback';
import { pruneLogAction } from './actions';

const EMPTY = { error: '', message: '' };

/** Clearing old log entries — behind a confirmation, because it cannot be undone. */
export function PruneForm({
  ages,
  labels,
}: {
  ages: { value: number; label: string }[];
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(pruneLogAction, EMPTY);
  const [asking, setAsking] = useState(false);

  return (
    <form action={action} className="space-y-3">
      {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}
      {state.message !== '' && <Alert tone="success">{state.message}</Alert>}

      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-xs font-medium text-ink">
          {labels.label}
          <select
            name="days"
            defaultValue="90"
            className="mt-1 rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
          >
            {ages.map((age) => (
              <option key={age.value} value={age.value}>
                {age.label}
              </option>
            ))}
          </select>
        </label>

        {asking ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-ink-muted">{labels.confirm}</span>
            <button
              type="submit"
              disabled={pending}
              className="rounded-orbit border border-red-300 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-surface-2 disabled:opacity-60"
            >
              {labels.prune}
            </button>
            <button
              type="button"
              onClick={() => setAsking(false)}
              className="rounded-orbit border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
            >
              {labels.cancel}
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setAsking(true)}
            className="rounded-orbit border border-red-300 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-surface-2"
          >
            <i className="bi bi-trash3 me-1" aria-hidden /> {labels.prune}
          </button>
        )}
      </div>

      <p className="text-xs text-ink-muted">{labels.note}</p>
    </form>
  );
}
