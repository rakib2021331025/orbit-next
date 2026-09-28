import { cn } from '@/lib/cn';

/**
 * Alerts, badges, empty and loading states — the small pieces a list page needs
 * before it can honestly be called finished.
 */

export type Tone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

const ALERT_TONES: Record<Tone, string> = {
  info: 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200',
  success:
    'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
  warning:
    'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
  danger:
    'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200',
  neutral: 'border-line bg-surface-2 text-ink',
};

const ALERT_ICONS: Record<Tone, string> = {
  info: 'bi-info-circle-fill',
  success: 'bi-check-circle-fill',
  warning: 'bi-exclamation-triangle-fill',
  danger: 'bi-exclamation-octagon-fill',
  neutral: 'bi-dot',
};

export function Alert({
  tone = 'info',
  title,
  icon,
  className,
  children,
}: {
  tone?: Tone;
  title?: string;
  icon?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      // An error is announced immediately; anything else waits for a pause, so a
      // success note does not interrupt what is being read.
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-3 rounded-orbit border px-4 py-3 text-sm',
        ALERT_TONES[tone],
        className
      )}
    >
      <i className={cn('bi mt-0.5 shrink-0', icon ?? ALERT_ICONS[tone])} aria-hidden />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5')}>{children}</div>}
      </div>
    </div>
  );
}

const BADGE_TONES: Record<Tone, string> = {
  info: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  warning: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  danger: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  neutral: 'bg-surface-3 text-ink-muted',
};

export function Badge({
  tone = 'neutral',
  icon,
  className,
  children,
}: {
  tone?: Tone;
  icon?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        BADGE_TONES[tone],
        className
      )}
    >
      {icon && <i className={cn('bi', icon)} aria-hidden />}
      {children}
    </span>
  );
}

/** The red count pill on a nav item. Renders nothing at zero. */
export function CountPill({ count, label }: { count: number; label?: string }) {
  if (!count || count <= 0) return null;
  return (
    <span
      className="ms-auto inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white"
      aria-label={label}
    >
      {count}
    </span>
  );
}

/**
 * What a list shows when it is empty.
 *
 * "No students yet" plus the button that creates one beats a blank panel: the
 * blank panel reads as a bug, and the user cannot tell whether the filter is
 * wrong or the data is missing.
 */
export function EmptyState({
  icon = 'bi-inbox',
  title,
  body,
  action,
  className,
}: {
  icon?: string;
  title: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('px-6 py-12 text-center', className)}>
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-surface-3 text-2xl text-ink-muted">
        <i className={cn('bi', icon)} aria-hidden />
      </span>
      <h3 className="mt-4 font-head text-base font-semibold text-ink-heading">{title}</h3>
      {body && <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">{body}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/** A grey block standing in for content that is still loading. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-surface-3', className)} />;
}

export function SkeletonTable({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-2 p-4" aria-hidden>
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex gap-3">
          {Array.from({ length: columns }).map((_, col) => (
            <Skeleton key={col} className={cn('h-8 flex-1', col === 0 && 'max-w-10')} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A spinner with an accessible label; `label` is required so it is never silent. */
export function Spinner({ label, className }: { label: string; className?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-sm text-ink-muted', className)}>
      <span
        aria-hidden
        className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-primary"
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
