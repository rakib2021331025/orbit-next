import { cn } from '@/lib/cn';

/**
 * Form controls.
 *
 * Every field gets a real `<label for>`, and errors are tied to the input with
 * `aria-describedby` + `aria-invalid` so a screen reader announces the reason
 * rather than just "invalid entry".
 */

const CONTROL =
  'w-full rounded-orbit border bg-surface px-4 py-2.5 text-ink shadow-sm outline-none transition placeholder:text-ink-muted/60 focus:ring-2 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-muted';
const OK = 'border-line focus:border-primary focus:ring-primary/25';
const BAD = 'border-red-400 focus:border-red-500 focus:ring-red-500/25';

export function Field({
  id,
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
        {required && (
          <span className="ms-1 text-red-600" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({
  error,
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { error?: boolean }) {
  return (
    <input
      aria-invalid={error || undefined}
      className={cn(CONTROL, error ? BAD : OK, className)}
      {...rest}
    />
  );
}

export function Textarea({
  error,
  className,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }) {
  return (
    <textarea
      aria-invalid={error || undefined}
      className={cn(CONTROL, error ? BAD : OK, 'min-h-28 resize-y', className)}
      {...rest}
    />
  );
}

export function Select({
  error,
  className,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean }) {
  return (
    <select
      aria-invalid={error || undefined}
      className={cn(CONTROL, error ? BAD : OK, 'pe-10', className)}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Checkbox({
  label,
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode }) {
  return (
    <label className={cn('flex items-start gap-2.5 text-sm text-ink', className)}>
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
        {...rest}
      />
      <span>{label}</span>
    </label>
  );
}

export function Radio({
  label,
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode }) {
  return (
    <label className={cn('flex items-start gap-2.5 text-sm text-ink', className)}>
      <input
        type="radio"
        className="mt-0.5 h-4 w-4 border-line text-primary focus:ring-primary/30"
        {...rest}
      />
      <span>{label}</span>
    </label>
  );
}

/** A responsive grid for form fields: one column on a phone, two from `sm` up. */
export function FieldGrid({
  columns = 2,
  className,
  children,
}: {
  columns?: 1 | 2 | 3;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'grid gap-4',
        columns === 2 && 'sm:grid-cols-2',
        columns === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
        className
      )}
    >
      {children}
    </div>
  );
}

/** The row of submit/cancel buttons at the end of a form. */
export function FormActions({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-3 pt-2', className)}>{children}</div>
  );
}
