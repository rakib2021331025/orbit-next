'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useActionState } from 'react';
import type { ExamAction, ExamFormState } from './ExamForm';

const EMPTY: ExamFormState = { error: '', message: '' };

/**
 * The per-row actions on the exam list.
 *
 * Publishing is offered only once the exam has a question — the server refuses an
 * empty paper anyway, and a button that always fails is worse than no button.
 *
 * Deleting asks first and names the exam, because it takes every question and
 * every student's submitted answers with it.
 */
export function ExamRowActions({
  actions,
  basePath,
  examId,
  status,
  resultsPublished,
  hasQuestions,
  labels,
}: {
  actions: {
    setStatus: ExamAction;
    setResultsPublished: ExamAction;
    remove: ExamAction;
  };
  /** '/admin' or '/teacher' — the portal these links belong to. */
  basePath: string;
  examId: number;
  status: string;
  resultsPublished: boolean;
  hasQuestions: boolean;
  labels: {
    questions: string;
    edit: string;
    publish: string;
    unpublish: string;
    publishResults: string;
    hideResults: string;
    submissions: string;
    remove: string;
    confirmDelete: string;
    cancel: string;
  };
}) {
  const [statusState, statusAction, statusPending] = useActionState(actions.setStatus, EMPTY);
  const [resultsState, resultsAction, resultsPending] = useActionState(actions.setResultsPublished, EMPTY);
  const [deleteState, deleteAction, deletePending] = useActionState(actions.remove, EMPTY);
  const [confirming, setConfirming] = useState(false);

  const error = statusState.error || resultsState.error || deleteState.error;
  const link =
    'rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2';

  if (confirming) {
    return (
      <form action={deleteAction} className="flex flex-wrap items-center justify-end gap-2">
        <input type="hidden" name="exam_id" value={examId} />
        <span className="text-xs text-ink">{labels.confirmDelete}</span>
        <button
          type="submit"
          disabled={deletePending}
          className="rounded-orbit bg-red-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-red-700"
        >
          {labels.remove}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className={link}>
          {labels.cancel}
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {error !== '' && <span className="w-full text-end text-xs text-red-600">{error}</span>}

      <Link href={`${basePath}/exams/${examId}/questions`} className={link}>
        {labels.questions}
      </Link>

      <Link href={`${basePath}/exams?edit=${examId}`} className={link}>
        {labels.edit}
      </Link>

      {/* Publishing needs at least one question. */}
      {hasQuestions && (
        <form action={statusAction} className="inline">
          <input type="hidden" name="exam_id" value={examId} />
          <input
            type="hidden"
            name="status"
            value={status === 'published' ? 'draft' : 'published'}
          />
          <button type="submit" disabled={statusPending} className={link}>
            {status === 'published' ? labels.unpublish : labels.publish}
          </button>
        </form>
      )}

      {status === 'published' && (
        <form action={resultsAction} className="inline">
          <input type="hidden" name="exam_id" value={examId} />
          <input type="hidden" name="published" value={resultsPublished ? '0' : '1'} />
          <button type="submit" disabled={resultsPending} className={link}>
            {resultsPublished ? labels.hideResults : labels.publishResults}
          </button>
        </form>
      )}

      <Link href={`${basePath}${basePath === '/admin' ? '/exam-evaluation' : '/evaluations'}?exam=${examId}`} className={link}>
        {labels.submissions}
      </Link>

      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-orbit border border-red-300 px-2.5 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:hover:bg-red-950/40"
      >
        {labels.remove}
      </button>
    </div>
  );
}
