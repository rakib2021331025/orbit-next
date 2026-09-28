'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/Feedback';
import { publishAction, saveMarksAction, unpublishAction } from './actions';

const EMPTY = { error: '', message: '', warning: '' };

export interface MarkCell {
  subjectId: number;
  /** The subject's full marks, in Latin digits — this is a bound, not a label. */
  full: number;
  value: string;
  label: string;
}

export interface MarkRow {
  studentId: number;
  name: string;
  idNo: string;
  roll: string;
  cells: MarkCell[];
}

/** Bangla digits → Latin, so either keyboard produces the same number. */
function latin(value: string): string {
  return value.replace(/[০-৯]/g, (digit) => String('০১২৩৪৫৬৭৮৯'.indexOf(digit)));
}

function isAbsent(value: string): boolean {
  return /^(ab|a|abs|absent)$/i.test(value);
}

/** A cell is valid when it is empty, an absence, or a number within full marks. */
function cellOk(value: string, full: number): boolean {
  const raw = latin(value).trim();
  if (raw === '' || isAbsent(raw)) return true;
  return /^\d+(\.\d{1,2})?$/.test(raw) && Number(raw) <= full;
}

function cellValue(value: string, full: number): number {
  const raw = latin(value).trim();
  return cellOk(raw, full) && /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : 0;
}

/**
 * The marks grid: students down, subjects across.
 *
 * Three things make a long entry session survivable, all from the original:
 * the running total updates as you type, Enter moves **down the column** rather
 * than submitting, and leaving with unsaved marks asks first.
 */
export function MarksGrid({
  examId,
  subjects,
  rows,
  labels,
}: {
  examId: number;
  subjects: { id: number; name: string; full: string; pass: string }[];
  rows: MarkRow[];
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(saveMarksAction, EMPTY);
  const form = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      rows.flatMap((row) => row.cells.map((cell) => [`${row.studentId}:${cell.subjectId}`, cell.value]))
    )
  );
  const [dirty, setDirty] = useState(false);

  // A half-entered sheet is real work; leaving without saving asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    if (state.message !== '') setDirty(false);
  }, [state.message]);

  const rowTotal = (row: MarkRow) =>
    row.cells.reduce(
      (sum, cell) => sum + cellValue(values[`${row.studentId}:${cell.subjectId}`] ?? '', cell.full),
      0
    );

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, column: number, index: number) => {
    if (event.key !== 'Enter') return;
    // Enter would submit the form; down the column is what somebody entering a
    // subject's marks actually wants.
    event.preventDefault();
    const next = rows[index + 1];
    if (!next) return;
    const target = form.current?.querySelector<HTMLInputElement>(
      `input[name="marks[${next.studentId}][${next.cells[column].subjectId}]"]`
    );
    target?.focus();
    target?.select();
  };

  return (
    <form ref={form} action={action} className="rounded-orbit border border-line bg-surface">
      <input type="hidden" name="id" value={examId} />

      <div className="space-y-2 px-5 pt-4">
        {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}
        {state.message !== '' && <Alert tone="success">{state.message}</Alert>}
        {state.warning !== '' && <Alert tone="warning">{state.warning}</Alert>}
      </div>

      <p className="border-b border-line-soft px-5 py-3 text-xs text-ink-muted">
        <i className="bi bi-info-circle me-1" aria-hidden /> {labels.hint}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="sticky left-0 z-10 bg-surface px-3 py-2 text-start text-xs font-semibold text-ink-muted">
                {labels.student}
              </th>
              {subjects.map((subject) => (
                <th key={subject.id} className="px-3 py-2 text-center text-xs font-semibold text-ink-muted">
                  {subject.name}
                  <span className="block font-normal normal-case">
                    {subject.full} / {subject.pass}
                  </span>
                </th>
              ))}
              <th className="px-3 py-2 text-center text-xs font-semibold text-ink-muted">
                {labels.total}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.studentId} className="border-b border-line-soft">
                <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-2 text-start font-normal">
                  <span className="font-semibold text-ink">{row.name}</span>
                  <span className="block text-xs text-ink-muted">
                    {row.idNo}
                    {row.roll !== '' ? ` · ${labels.roll} ${row.roll}` : ''}
                  </span>
                </th>

                {row.cells.map((cell, column) => {
                  const key = `${row.studentId}:${cell.subjectId}`;
                  const value = values[key] ?? '';
                  const ok = cellOk(value, cell.full);

                  return (
                    <td key={cell.subjectId} className="px-2 py-1.5 text-center">
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        maxLength={7}
                        name={`marks[${row.studentId}][${cell.subjectId}]`}
                        value={value}
                        placeholder="—"
                        aria-label={cell.label}
                        onChange={(event) => {
                          setDirty(true);
                          setValues((current) => ({ ...current, [key]: event.currentTarget.value }));
                        }}
                        onKeyDown={(event) => onKeyDown(event, column, index)}
                        className={`w-20 rounded-orbit border bg-surface px-2 py-1 text-center text-sm text-ink outline-none focus:ring-2 focus:ring-primary/25 ${
                          ok ? 'border-line focus:border-primary' : 'border-red-500'
                        }`}
                      />
                    </td>
                  );
                })}

                <td className="px-3 py-1.5 text-center font-bold text-ink">
                  {Math.round(rowTotal(row) * 100) / 100}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
        <span className="text-xs text-ink-muted">{labels.count}</span>
        <button
          type="submit"
          disabled={pending}
          className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? labels.saving : labels.save}
        </button>
      </div>
    </form>
  );
}

/**
 * Publishing a result.
 *
 * The notification boxes are part of the same decision: publishing quietly and
 * telling nobody is almost never what somebody means, so both are ticked and
 * the count of students without complete marks is shown before they commit.
 */
export function PublishPanel({
  examId,
  incomplete,
  canPublish,
  mailOn,
  labels,
}: {
  examId: number;
  incomplete: number;
  canPublish: boolean;
  mailOn: boolean;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(publishAction, EMPTY);
  const [open, setOpen] = useState(false);

  if (state.message !== '') {
    return (
      <div className="space-y-2">
        <Alert tone="success">{state.message}</Alert>
        {state.warning !== '' && <Alert tone="warning">{state.warning}</Alert>}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!canPublish}
        className="rounded-orbit bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
      >
        <i className="bi bi-megaphone me-1" aria-hidden /> {labels.publish}
      </button>
    );
  }

  return (
    <form action={action} className="w-full max-w-md space-y-3 rounded-orbit border border-line bg-surface p-4">
      <input type="hidden" name="id" value={examId} />

      {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}

      <h2 className="text-sm font-bold text-ink-heading">{labels.publishTitle}</h2>
      <p className="text-sm text-ink-muted">{labels.publishBody}</p>

      {incomplete > 0 && <Alert tone="warning">{labels.incomplete}</Alert>}

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          name="notify_portal"
          value="1"
          defaultChecked
          className="h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
        />
        <span>{labels.notifyPortal}</span>
      </label>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          name="notify_email"
          value="1"
          defaultChecked={mailOn}
          disabled={!mailOn}
          className="h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
        />
        <span>{labels.notifyEmail}</span>
      </label>

      {!mailOn && <p className="text-xs text-ink-muted">{labels.mailOff}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-orbit bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
        >
          {pending ? labels.publishing : labels.publish}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-orbit border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
        >
          {labels.cancel}
        </button>
      </div>
    </form>
  );
}

/** Taking a published result back to draft. */
export function UnpublishButton({
  examId,
  labels,
}: {
  examId: number;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(unpublishAction, EMPTY);

  if (state.message !== '') return <Alert tone="success">{state.message}</Alert>;

  return (
    <form action={action} className="inline">
      <input type="hidden" name="id" value={examId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-orbit border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-surface-2 disabled:opacity-60"
      >
        <i className="bi bi-eye-slash me-1" aria-hidden /> {labels.unpublish}
      </button>
    </form>
  );
}
