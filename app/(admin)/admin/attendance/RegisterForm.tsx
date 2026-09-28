'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/Feedback';
import { saveRegisterAction } from './actions';
import { emptyRegisterState } from './state';

const STATUS_STYLE: Record<string, string> = {
  present: 'peer-checked:bg-emerald-600 peer-checked:text-white peer-checked:border-emerald-600',
  late: 'peer-checked:bg-amber-500 peer-checked:text-white peer-checked:border-amber-500',
  half_day: 'peer-checked:bg-sky-600 peer-checked:text-white peer-checked:border-sky-600',
  absent: 'peer-checked:bg-red-600 peer-checked:text-white peer-checked:border-red-600',
};

export interface RegisterRow {
  id: number;
  name: string;
  studentId: string;
  roll: string;
  photo: string;
  status: string;
  note: string;
  inactive: boolean;
}

/**
 * The register itself.
 *
 * Everyone starts as Present, because that is the common case and a register
 * where every row must be touched is a register that gets filled in carelessly.
 * "Mark everyone" is there for the opposite case — a cancelled class, or a day
 * when almost nobody came.
 *
 * The four statuses are radio buttons rather than a dropdown: on a phone, taking
 * a register of forty students through a select control is unusable.
 */
export function RegisterForm({
  batchId,
  date,
  legacyCourse,
  rows,
  existingLabel,
  alreadyMarked,
  labels,
}: {
  batchId: number;
  date: string;
  legacyCourse: string;
  rows: RegisterRow[];
  existingLabel: string;
  alreadyMarked: boolean;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(saveRegisterAction, emptyRegisterState);
  const [marks, setMarks] = useState<Record<number, string>>(
    Object.fromEntries(rows.map((row) => [row.id, row.status]))
  );

  const setAll = (status: string) => {
    setMarks(Object.fromEntries(rows.map((row) => [row.id, status])));
  };

  const counts = {
    present: 0,
    late: 0,
    half_day: 0,
    absent: 0,
  };
  for (const row of rows) {
    const status = marks[row.id] ?? 'present';
    if (status in counts) counts[status as keyof typeof counts]++;
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="batch" value={batchId} />
      <input type="hidden" name="date" value={date} />
      {legacyCourse !== '' && <input type="hidden" name="legacy_course" value={legacyCourse} />}

      {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}
      {state.message !== '' && (
        <Alert tone="success">
          {state.message}
          {state.notes.length > 0 && (
            <span className="mt-1 block text-xs">{state.notes.join(' ')}</span>
          )}
        </Alert>
      )}
      {alreadyMarked && state.message === '' && (
        <Alert tone="info" icon="bi-info-circle">
          {labels.alreadyMarked}
        </Alert>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="text-ink-muted">{labels.classLabel}</span>
          <input
            name="class_label"
            maxLength={150}
            defaultValue={existingLabel}
            placeholder={labels.classLabelPlaceholder}
            className="w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
          />
        </label>

        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-ink-muted">{labels.markAll}:</span>
          {(['present', 'late', 'half_day', 'absent'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setAll(status)}
              className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
            >
              {labels[status]}
            </button>
          ))}
        </span>
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <span className="text-emerald-700 dark:text-emerald-400">
          {labels.present}: {counts.present}
        </span>
        <span className="text-amber-600">
          {labels.late}: {counts.late}
        </span>
        <span className="text-sky-600">
          {labels.half_day}: {counts.half_day}
        </span>
        <span className="text-red-600">
          {labels.absent}: {counts.absent}
        </span>
      </div>

      <ul className="divide-y divide-line-soft rounded-orbit border border-line">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="flex min-w-0 flex-1 items-center gap-3">
              {row.photo !== '' && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.photo}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-full border border-line-soft object-cover"
                />
              )}
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">
                  {row.name}
                  {row.inactive && (
                    <span className="ms-2 text-xs font-normal text-ink-muted">
                      {labels.inactive}
                    </span>
                  )}
                </span>
                <span className="block text-xs text-ink-muted">
                  {row.roll !== '' ? `${labels.roll} ${row.roll} · ` : ''}
                  {row.studentId}
                </span>
              </span>
            </span>

            <span className="flex shrink-0 flex-wrap gap-1">
              {(['present', 'late', 'half_day', 'absent'] as const).map((status) => (
                <label key={status} className="cursor-pointer">
                  <input
                    type="radio"
                    name={`status[${row.id}]`}
                    value={status}
                    checked={(marks[row.id] ?? 'present') === status}
                    onChange={() => setMarks({ ...marks, [row.id]: status })}
                    className="peer sr-only"
                  />
                  <span
                    className={`inline-block rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition ${STATUS_STYLE[status]}`}
                  >
                    {labels[`short_${status}`]}
                  </span>
                </label>
              ))}
            </span>

            <input
              name={`note[${row.id}]`}
              maxLength={255}
              defaultValue={row.note}
              placeholder={labels.note}
              className="w-full rounded-orbit border border-line bg-surface px-3 py-1.5 text-xs text-ink sm:w-48"
            />
          </li>
        ))}
      </ul>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          name="notify_absent"
          value="1"
          className="h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
        />
        <span>{labels.notifyAbsent}</span>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-orbit bg-primary px-5 py-2.5 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? labels.saving : labels.save}
      </button>
    </form>
  );
}
