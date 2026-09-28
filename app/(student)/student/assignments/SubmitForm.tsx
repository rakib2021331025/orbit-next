'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/Feedback';
import { Field, Input, FormActions } from '@/components/ui/Form';
import { Button } from '@/components/ui/Button';
import { submitAssignmentAction } from './actions';
import { emptySubmitState } from './state';

/**
 * Submitting or replacing one assignment answer.
 *
 * One form per assignment, each with the assignment id in a hidden field. The id
 * is re-checked against the student's scope on the server, so editing it is
 * pointless rather than useful.
 */
export function SubmitForm({
  assignmentId,
  hasSubmission,
  overdue,
  labels,
}: {
  assignmentId: number;
  hasSubmission: boolean;
  overdue: boolean;
  labels: {
    file: string;
    hint: string;
    submit: string;
    replace: string;
    replaceLabel: string;
    overdueNote: string;
    submitted: string;
    replaced: string;
  };
}) {
  const [state, formAction, pending] = useActionState(submitAssignmentAction, emptySubmitState);

  if (state.done !== '') {
    return (
      <Alert tone="success" icon="bi-check-circle-fill">
        {state.done === 'replaced' ? labels.replaced : labels.submitted}
      </Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-3" encType="multipart/form-data">
      <input type="hidden" name="assignment_id" value={assignmentId} />

      {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}
      {overdue && !hasSubmission && (
        <Alert tone="warning" icon="bi-clock-history">
          {labels.overdueNote}
        </Alert>
      )}

      <Field
        id={`answer-${assignmentId}`}
        label={hasSubmission ? labels.replaceLabel : labels.file}
        hint={labels.hint}
        required
      >
        <Input
          id={`answer-${assignmentId}`}
          name="answer"
          type="file"
          required
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.zip"
        />
      </Field>

      <FormActions>
        <Button type="submit" size="sm" disabled={pending} icon="bi-upload">
          {hasSubmission ? labels.replace : labels.submit}
        </Button>
      </FormActions>
    </form>
  );
}
