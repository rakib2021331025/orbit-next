'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/Feedback';
import { Field, Input, FormActions } from '@/components/ui/Form';
import { Button, ButtonLink } from '@/components/ui/Button';
import { resetPasswordAction } from './actions';
import { emptyResetState } from './state';

/**
 * Setting a new password from a reset link.
 *
 * The match indicator is live so the user is not told "they do not match" only
 * after submitting — but the server compares them again, because a client-side
 * check is a courtesy, not a control.
 */
export function ResetForm({
  token,
  email,
  labels,
}: {
  token: string;
  email: string;
  labels: {
    for: string;
    newPassword: string;
    confirm: string;
    hint: string;
    submit: string;
    match: string;
    noMatch: string;
    doneTitle: string;
    doneBody: string;
    doneNote: string;
    goSignIn: string;
  };
}) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, emptyResetState);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  if (state.done) {
    return (
      <div>
        <Alert tone="success" title={labels.doneTitle} icon="bi-shield-check">
          <p>{labels.doneBody}</p>
          <p className="mt-2 text-xs">{labels.doneNote}</p>
        </Alert>
        <div className="mt-5 flex flex-wrap gap-2">
          <ButtonLink href="/student/login" variant="primary">
            {labels.goSignIn}
          </ButtonLink>
        </div>
      </div>
    );
  }

  const both = password !== '' && confirm !== '';
  const matches = both && password === confirm;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}

      <p className="text-sm text-ink-muted">{labels.for.replace('{email}', email)}</p>

      <Field id="password" label={labels.newPassword} hint={labels.hint} required>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoFocus
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.currentTarget.value)}
        />
      </Field>

      <Field
        id="confirm"
        label={labels.confirm}
        required
        error={both && !matches ? labels.noMatch : undefined}
      >
        <Input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.currentTarget.value)}
          error={both && !matches}
        />
      </Field>

      {matches && (
        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <i className="bi bi-check-lg me-1" aria-hidden />
          {labels.match}
        </p>
      )}

      <FormActions>
        <Button type="submit" disabled={pending || !matches} className="w-full">
          {labels.submit}
        </Button>
      </FormActions>
    </form>
  );
}
