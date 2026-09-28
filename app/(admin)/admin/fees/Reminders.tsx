'use client';

import { useState } from 'react';
import { Alert } from '@/components/ui/Feedback';

interface ReminderResult {
  studentId: number;
  name: string;
  status: 'sent' | 'failed' | 'skipped';
  reason: string;
  message: string;
}

/**
 * Sending fee reminders, **ten at a time**.
 *
 * The chunking is the point, not an optimisation: a hundred emails in one request
 * is how a free host's time limit gets hit and a send ends up half done with
 * nobody knowing which half. Each request comes back with what it managed and
 * anything it did not, so this keeps asking until the list is finished — and the
 * counts on screen are always the real ones.
 *
 * "Stop" stops after the request in flight. Nothing is sent twice: a student who
 * has just been reminded is skipped by the server's own gap rule.
 */
export function ReminderSender({
  studentIds,
  gapDays,
  labels,
}: {
  studentIds: number[];
  gapDays: number;
  labels: Record<string, string>;
}) {
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [force, setForce] = useState(false);
  const [done, setDone] = useState<ReminderResult[]>([]);
  const [error, setError] = useState('');
  const [finished, setFinished] = useState('');

  const counts = {
    sent: done.filter((row) => row.status === 'sent').length,
    failed: done.filter((row) => row.status === 'failed').length,
    skipped: done.filter((row) => row.status === 'skipped').length,
  };

  const run = async () => {
    if (studentIds.length === 0) {
      setError(labels.none);
      return;
    }

    setRunning(true);
    setStopping(false);
    setError('');
    setFinished('');
    setDone([]);

    let queue = [...studentIds];
    const collected: ReminderResult[] = [];
    let stopped = false;

    while (queue.length > 0) {
      if (stopping) {
        stopped = true;
        break;
      }

      const chunk = queue.slice(0, 10);

      try {
        const response = await fetch('/api/admin/fees/remind', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'remind', ids: chunk, force }),
        });
        if (!response.ok) {
          setError(labels.error);
          break;
        }

        const data = (await response.json()) as { results: ReminderResult[]; pending: number[] };
        collected.push(...(data.results ?? []));
        setDone([...collected]);

        // Whatever the server did not get to comes back as pending and goes to
        // the front of the queue.
        queue = [...(data.pending ?? []), ...queue.slice(chunk.length)];
      } catch {
        setError(labels.error);
        break;
      }
    }

    setRunning(false);
    const summary = {
      sent: collected.filter((row) => row.status === 'sent').length,
      failed: collected.filter((row) => row.status === 'failed').length,
      skipped: collected.filter((row) => row.status === 'skipped').length,
    };
    setFinished(
      (stopped ? labels.stopped : labels.doneMessage)
        .replace('{sent}', String(summary.sent))
        .replace('{failed}', String(summary.failed))
        .replace('{skipped}', String(summary.skipped))
    );
  };

  return (
    <div className="space-y-3">
      {error !== '' && <Alert tone="danger">{error}</Alert>}
      {finished !== '' && <Alert tone="info">{finished}</Alert>}

      <p className="text-[11px] text-ink-muted">
        {labels.hint.replace('{days}', String(gapDays))}
      </p>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={force}
          onChange={(event) => setForce(event.currentTarget.checked)}
          className="h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
        />
        <span>{labels.sendAnyway.replace('{days}', String(gapDays))}</span>
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={run}
          disabled={running || studentIds.length === 0}
          className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
        >
          {running
            ? labels.running
            : labels.send.replace('{count}', String(studentIds.length))}
        </button>

        {running && (
          <button
            type="button"
            onClick={() => setStopping(true)}
            className="rounded-orbit border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
          >
            {labels.stop}
          </button>
        )}

        {done.length > 0 && (
          <span className="flex flex-wrap gap-3 text-xs">
            <span className="text-emerald-700 dark:text-emerald-400">
              {labels.countSent}: {counts.sent}
            </span>
            <span className="text-red-600">
              {labels.countFailed}: {counts.failed}
            </span>
            <span className="text-ink-muted">
              {labels.countSkipped}: {counts.skipped}
            </span>
          </span>
        )}
      </div>

      {done.length > 0 && (
        <ul className="max-h-56 space-y-1 overflow-y-auto rounded-orbit border border-line-soft p-2 text-xs">
          {done.map((row) => (
            <li
              key={`${row.studentId}-${row.status}`}
              className={
                row.status === 'sent'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : row.status === 'failed'
                    ? 'text-red-600'
                    : 'text-ink-muted'
              }
            >
              {row.name}: {row.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
