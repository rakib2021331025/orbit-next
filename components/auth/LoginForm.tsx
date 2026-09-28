'use client';

import { useActionState } from 'react';
import type { LoginFormState } from '@/lib/auth/actions';
import { AuthError } from './AuthShell';

/**
 * The sign-in form, shared by all four portals; only the identifier field
 * differs (student id, email or phone).
 *
 * Every label arrives as a prop, already translated by the server component that
 * renders it. A client component cannot call t() without shipping both
 * catalogues to the browser, and 4,352 keys is not a reasonable price for eight
 * labels.
 *
 * No CSRF token is rendered. The PHP form needed one because a cookie alone
 * authorised the POST; a server action is rejected unless the request's Origin
 * matches the host, which covers the same attack.
 */

export interface LoginFormProps {
  action: (state: LoginFormState, formData: FormData) => Promise<LoginFormState>;
  identifierName: string;
  identifierLabel: string;
  identifierType?: 'text' | 'email' | 'tel';
  identifierPlaceholder?: string;
  identifierAutoComplete?: string;
  passwordLabel: string;
  rememberLabel: string;
  submitLabel: string;
  pendingLabel: string;
  showPasswordLabel: string;
  forgotHref?: string;
  forgotLabel?: string;
  next?: string;
  footer?: React.ReactNode;
}

const initialState: LoginFormState = { error: '' };

export function LoginForm({
  action,
  identifierName,
  identifierLabel,
  identifierType = 'text',
  identifierPlaceholder,
  identifierAutoComplete = 'username',
  passwordLabel,
  rememberLabel,
  submitLabel,
  pendingLabel,
  showPasswordLabel,
  forgotHref,
  forgotLabel,
  next,
  footer,
}: LoginFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <AuthError message={state.error} />

      {next && <input type="hidden" name="next" value={next} />}

      <div>
        <label htmlFor="orbit-identifier" className="mb-1.5 block text-sm font-medium text-ink">
          {identifierLabel}
        </label>
        <input
          id="orbit-identifier"
          name={identifierName}
          type={identifierType}
          required
          autoFocus
          autoComplete={identifierAutoComplete}
          placeholder={identifierPlaceholder}
          defaultValue={state.identifier ?? ''}
          inputMode={identifierType === 'tel' ? 'numeric' : undefined}
          className="w-full rounded-orbit border border-line bg-surface px-4 py-2.5 text-ink shadow-sm outline-none transition placeholder:text-ink-muted/60 focus:border-primary focus:ring-2 focus:ring-primary/25"
        />
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <label htmlFor="orbit-password" className="block text-sm font-medium text-ink">
            {passwordLabel}
          </label>
          {forgotHref && forgotLabel && (
            <a href={forgotHref} className="text-xs font-medium text-primary hover:underline">
              {forgotLabel}
            </a>
          )}
        </div>
        <PasswordField label={showPasswordLabel} />
      </div>

      <label className="flex items-center gap-2.5 text-sm text-ink">
        <input
          type="checkbox"
          name="remember"
          value="1"
          className="h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
        />
        {rememberLabel}
      </label>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-orbit bg-primary px-4 py-2.5 font-medium text-white shadow-sm transition hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? pendingLabel : submitLabel}
      </button>

      {footer && <div className="pt-2 text-sm text-ink-muted">{footer}</div>}
    </form>
  );
}

/**
 * Password box with a reveal toggle, as student/login.php offers.
 *
 * Typing a password blind on a phone keyboard is the reason students mistype it
 * and then hit the throttle, so the toggle is not decoration.
 */
function PasswordField({ label }: { label: string }) {
  return (
    <div className="relative">
      <input
        id="orbit-password"
        name="password"
        type="password"
        required
        autoComplete="current-password"
        className="w-full rounded-orbit border border-line bg-surface px-4 py-2.5 pe-12 text-ink shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
      />
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={(event) => {
          const input = event.currentTarget.previousElementSibling as HTMLInputElement | null;
          if (input) input.type = input.type === 'password' ? 'text' : 'password';
        }}
        className="absolute inset-y-0 end-0 grid w-11 place-items-center text-ink-muted transition hover:text-ink"
      >
        <span aria-hidden>&#128065;</span>
      </button>
    </div>
  );
}
