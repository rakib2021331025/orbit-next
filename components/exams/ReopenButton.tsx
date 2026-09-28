'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import type { EvaluateAction, EvaluateState } from './EvaluateForm';

const EMPTY: EvaluateState = { error: '', message: '' };

/**
 * Reopens a finished evaluation for re-marking.
 *
 * It asks first. Changing a mark the student has already seen is a decision, and
 * a single click that silently undoes an evaluation is how marks get lost.
 */
export function ReopenButton({
  action,
  attemptId,
  label,
  confirmLabel,
}: {
  action: EvaluateAction;
  attemptId: number;
  label: string;
  confirmLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY);
  const [asking, setAsking] = useState(false);

  if (state.message !== '') {
    return <Alert tone="success">{state.message}</Alert>;
  }

  return (
    <div className="space-y-3">
      {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}

      {asking ? (
        <form action={formAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="attempt_id" value={attemptId} />
          <p className="text-sm text-ink">{confirmLabel}</p>
          <Button type="submit" variant="danger" size="sm" disabled={pending}>
            {label}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setAsking(false)}>
            &times;
          </Button>
        </form>
      ) : (
        <Button variant="secondary" size="sm" icon="bi-arrow-counterclockwise" onClick={() => setAsking(true)}>
          {label}
        </Button>
      )}
    </div>
  );
}
