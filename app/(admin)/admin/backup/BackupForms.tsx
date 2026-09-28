'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/Feedback';
import { createBackupAction, deleteBackupAction, pruneBackupsAction } from './actions';

const SMALL =
  'rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2';

const EMPTY = { error: '', message: '' };

export interface TableRow {
  name: string;
  rows: string;
  size: string;
}

/**
 * Creating a backup — the whole database, or the tables somebody ticks.
 *
 * "Full" is the default and the recommendation: a partial dump restores a
 * consistent-looking database that is quietly missing rows other tables point
 * at, and nobody notices until it matters.
 */
export function CreateBackupForm({
  tables,
  writable,
  labels,
}: {
  tables: TableRow[];
  writable: boolean;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(createBackupAction, EMPTY);
  const [scope, setScope] = useState<'full' | 'selected'>('full');
  const [picked, setPicked] = useState<string[]>([]);

  const toggle = (name: string) =>
    setPicked((current) =>
      current.includes(name) ? current.filter((value) => value !== name) : [...current, name]
    );

  return (
    <form action={action} className="space-y-4">
      {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}
      {state.message !== '' && <Alert tone="success">{state.message}</Alert>}
      {!writable && <Alert tone="warning">{labels.notWritable}</Alert>}

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-ink">{labels.createTitle}</legend>

        <label className="flex items-start gap-2 text-sm text-ink">
          <input
            type="radio"
            name="scope"
            value="full"
            checked={scope === 'full'}
            onChange={() => setScope('full')}
            className="mt-1 h-4 w-4 border-line text-primary focus:ring-primary/30"
          />
          <span>
            {labels.scopeFull}
            <span className="block text-[11px] text-ink-muted">
              {labels.scopeFullHint.replace('{count}', String(tables.length))}
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2 text-sm text-ink">
          <input
            type="radio"
            name="scope"
            value="selected"
            checked={scope === 'selected'}
            onChange={() => setScope('selected')}
            className="mt-1 h-4 w-4 border-line text-primary focus:ring-primary/30"
          />
          <span>
            {labels.scopeSelected}
            <span className="block text-[11px] text-ink-muted">{labels.scopeSelectedHint}</span>
          </span>
        </label>
      </fieldset>

      {scope === 'selected' && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPicked(tables.map((table) => table.name))}
              className={SMALL}
            >
              {labels.selectAll}
            </button>
            <button type="button" onClick={() => setPicked([])} className={SMALL}>
              {labels.selectNone}
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto rounded-orbit border border-line-soft p-2">
            {tables.map((table) => (
              <label
                key={table.name}
                className="flex items-center gap-2 border-b border-dashed border-line-soft py-1.5 text-sm text-ink last:border-b-0"
              >
                <input
                  type="checkbox"
                  name="tables"
                  value={table.name}
                  checked={picked.includes(table.name)}
                  onChange={() => toggle(table.name)}
                  className="h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
                />
                <span className="flex-1 break-words font-mono text-xs">{table.name}</span>
                <span className="text-xs text-ink-muted">{table.rows}</span>
                <span className="text-xs text-ink-muted">{table.size}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={pending || !writable || (scope === 'selected' && picked.length === 0)}
        className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
      >
        {pending ? labels.creating : labels.create}
      </button>
    </form>
  );
}

/** Deleting one backup file. */
export function DeleteBackup({
  filename,
  labels,
}: {
  filename: string;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(deleteBackupAction, EMPTY);
  const [asking, setAsking] = useState(false);

  if (state.error !== '') return <span className="text-xs text-red-600">{state.error}</span>;

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        title={labels.remove}
        aria-label={labels.remove}
        className={`${SMALL} text-red-600`}
      >
        <i className="bi bi-trash" aria-hidden />
      </button>
    );
  }

  return (
    <form action={action} className="inline-flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="file" value={filename} />
      <span className="text-xs text-ink-muted">{labels.confirm}</span>
      <button
        type="submit"
        disabled={pending}
        className={`${SMALL} border-red-300 text-red-600 disabled:opacity-60`}
      >
        {labels.remove}
      </button>
      <button type="button" onClick={() => setAsking(false)} className={SMALL}>
        {labels.cancel}
      </button>
    </form>
  );
}

/** Clearing old backups, newest always kept. */
export function PruneBackups({ labels }: { labels: Record<string, string> }) {
  const [state, action, pending] = useActionState(pruneBackupsAction, EMPTY);
  const [asking, setAsking] = useState(false);

  return (
    <form action={action} className="space-y-3">
      {state.message !== '' && <Alert tone="success">{state.message}</Alert>}

      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-xs font-medium text-ink">
          {labels.label}
          <select
            name="days"
            defaultValue="30"
            className="mt-1 rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
          >
            <option value="7">{labels.days7}</option>
            <option value="30">{labels.days30}</option>
            <option value="90">{labels.days90}</option>
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
            <button type="button" onClick={() => setAsking(false)} className={SMALL}>
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

      <p className="text-[11px] text-ink-muted">{labels.hint}</p>
    </form>
  );
}
