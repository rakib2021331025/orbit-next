'use client';

import { useActionState, useState } from 'react';
import type { ExamAction, ExamFormState } from './QuestionForm';

const EMPTY: ExamFormState = { error: '', message: '' };

/**
 * Deleting one question.
 *
 * It asks first, because deleting a question also deletes every answer already
 * given to it — a fact the confirmation wording states rather than implying.
 */
export function DeleteQuestion({
  action,
  examId,
  questionId,
  labels,
}: {
  action: ExamAction;
  examId: number;
  questionId: number;
  labels: { remove: string; confirm: string; cancel: string };
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY);
  const [asking, setAsking] = useState(false);

  if (asking) {
    return (
      <form action={formAction} className="flex items-center gap-2">
        <input type="hidden" name="exam_id" value={examId} />
        <input type="hidden" name="question_id" value={questionId} />
        <span className="max-w-56 text-xs text-ink">{labels.confirm}</span>
        <button
          type="submit"
          disabled={pending}
          className="rounded-orbit bg-red-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-red-700"
        >
          {labels.remove}
        </button>
        <button
          type="button"
          onClick={() => setAsking(false)}
          className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink"
        >
          {labels.cancel}
        </button>
      </form>
    );
  }

  return (
    <>
      {state.error !== '' && <span className="text-xs text-red-600">{state.error}</span>}
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="rounded-orbit border border-red-300 px-2.5 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:hover:bg-red-950/40"
      >
        {labels.remove}
      </button>
    </>
  );
}
