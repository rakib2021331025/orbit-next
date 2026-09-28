'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/Feedback';
import { Field, Input, FormActions } from '@/components/ui/Form';
import { Button } from '@/components/ui/Button';
import { changeGuardianPasswordAction } from './actions';

export function GuardianPasswordForm({
  phone,
  labels,
}: {
  /** A hidden username field, so password managers file the new password under the right account. */
  phone: string;
  labels: { current: string; next: string; confirm: string; hint: string; submit: string };
}) {
  const [state, formAction, pending] = useActionState(changeGuardianPasswordAction, { error: '' });

  return (
    <form action={formAction} className="space-y-4">
      <input type="text" name="username" value={phone} autoComplete="username" readOnly hidden />

      {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}

      <Field id="current_password" label={labels.current} required>
        <Input id="current_password" name="current_password" type="password" required autoComplete="current-password" />
      </Field>

      <Field id="new_password" label={labels.next} hint={labels.hint} required>
        <Input
          id="new_password"
          name="new_password"
          type="password"
          required
          minLength={8}
          maxLength={72}
          autoComplete="new-password"
        />
      </Field>

      <Field id="confirm_password" label={labels.confirm} required>
        <Input
          id="confirm_password"
          name="confirm_password"
          type="password"
          required
          minLength={8}
          maxLength={72}
          autoComplete="new-password"
        />
      </Field>

      <FormActions>
        <Button type="submit" disabled={pending}>
          {labels.submit}
        </Button>
      </FormActions>
    </form>
  );
}
