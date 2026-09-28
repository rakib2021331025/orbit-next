'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/Feedback';
import { Field, Input, FormActions } from '@/components/ui/Form';
import { Button } from '@/components/ui/Button';
import { forgotPasswordAction } from './actions';
import { emptyForgotState } from './state';

export function ForgotForm({
  labels,
}: {
  labels: {
    email: string;
    submit: string;
    sentTitle: string;
    sentBody: string;
    expiry: string;
    helpPhone: string;
  };
}) {
  const [state, formAction, pending] = useActionState(forgotPasswordAction, emptyForgotState);

  // The same confirmation whether or not an account exists at that address.
  if (state.sent) {
    return (
      <Alert tone="success" title={labels.sentTitle} icon="bi-envelope-check">
        <p>{labels.sentBody.replace('{email}', state.email)}</p>
        <p className="mt-2 text-xs">{labels.expiry}</p>
        {labels.helpPhone !== '' && <p className="mt-2 text-xs">{labels.helpPhone}</p>}
      </Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}

      <Field id="email" label={labels.email} required>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoFocus
          autoComplete="email"
          defaultValue={state.email}
        />
      </Field>

      <FormActions>
        <Button type="submit" disabled={pending} icon="bi-send" className="w-full">
          {labels.submit}
        </Button>
      </FormActions>
    </form>
  );
}
