'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/Feedback';
import { gradeSubmissionAction } from './actions';

const CONTROL =
  'w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';
const SMALL =
  'rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2';

const EMPTY = { error: '', message: '' };

/**
 * Marks and feedback for one submission.
 *
 * The marks box opens in place: marking a class of thirty means going down a
 * list, and a separate page per student would make that a long afternoon.
 *
 * Leaving the box empty clears the marks rather than storing zero — the hint
 * says so, because it is the difference between "not marked yet" and "scored
 * nothing", and the student sees them differently.
 */
export function GradeForm({
  submissionId,
  assignmentId,
  studentName,
  marks,
  feedback,
  labels,
}: {
  submissionId: number;
  assignmentId: number;
  studentName: string;
  marks: string;
  feedback: string;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(gradeSubmissionAction, EMPTY);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        {state.message !== '' && (
          <span className="text-xs text-emerald-700 dark:text-emerald-400">{state.message}</span>
        )}
        <button type="button" onClick={() => setOpen(true)} className={SMALL}>
          {labels.grade}
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="w-full space-y-3 rounded-orbit border border-line bg-surface-2/50 p-3">
      <input type="hidden" name="submission_id" value={submissionId} />
      <input type="hidden" name="assignment_id" value={assignmentId} />

      <p className="text-sm font-semibold text-ink-heading">
        {labels.gradeTitle.replace('{name}', studentName)}
      </p>

      {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}
      {state.message !== '' && <Alert tone="success">{state.message}</Alert>}

      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
        <label className="block text-xs font-medium text-ink">
          {labels.marks}
          <input
            name="marks"
            type="number"
            min={0}
            max={999.99}
            step="0.01"
            inputMode="decimal"
            defaultValue={marks}
            className={`mt-1 ${CONTROL}`}
          />
          <span className="mt-1 block text-[11px] font-normal text-ink-muted">
            {labels.marksHint}
          </span>
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.feedback}
          <textarea
            name="feedback"
            rows={3}
            maxLength={5000}
            defaultValue={feedback}
            className={`mt-1 ${CONTROL}`}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-orbit bg-primary px-3 py-1.5 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
        >
          {labels.save}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={SMALL}>
          {labels.cancel}
        </button>
      </div>
    </form>
  );
}
