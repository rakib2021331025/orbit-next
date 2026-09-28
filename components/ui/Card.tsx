import { cn } from '@/lib/cn';

/**
 * The surface every panel in Orbit sits on — one border, one radius, one shadow,
 * taken from the `.card` rule admin_header.php injects.
 */
export function Card({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-orbit border border-line-soft bg-surface shadow-orbit',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  actions,
  icon,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 border-b border-line-soft px-5 py-4',
        className
      )}
    >
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 font-head text-base font-semibold text-ink-heading">
          {icon && <i className={cn('bi', icon, 'text-primary')} aria-hidden />}
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('px-5 py-4', className)}>{children}</div>;
}

export function CardFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('border-t border-line-soft bg-surface-2 px-5 py-3', className)}>
      {children}
    </div>
  );
}

/**
 * The dashboard number tile: a label, a big figure and an optional trend.
 *
 * `value` is pre-formatted by the caller, because a number on an Orbit page must
 * go through orbit_number()/orbit_money() to come out in Bangla digits — a raw
 * `{count}` here would silently print Latin digits on a Bangla page.
 */
export function StatCard({
  label,
  value,
  icon,
  hint,
  tone = 'default',
  href,
}: {
  label: string;
  value: string;
  icon?: string;
  hint?: string;
  tone?: 'default' | 'primary' | 'warning' | 'danger' | 'success';
  href?: string;
}) {
  const tones: Record<string, string> = {
    default: 'text-ink-heading',
    primary: 'text-primary',
    warning: 'text-amber-600 dark:text-amber-400',
    danger: 'text-red-600 dark:text-red-400',
    success: 'text-emerald-600 dark:text-emerald-400',
  };

  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-ink-muted">{label}</span>
        {icon && (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
            <i className={cn('bi', icon)} aria-hidden />
          </span>
        )}
      </div>
      <div className={cn('mt-3 font-head text-2xl font-semibold tabular-nums', tones[tone])}>
        {value}
      </div>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </>
  );

  const shell =
    'block rounded-orbit border border-line-soft bg-surface p-5 shadow-orbit transition';

  return href ? (
    <a href={href} className={cn(shell, 'hover:border-primary/40 hover:shadow-orbit-lg')}>
      {inner}
    </a>
  ) : (
    <div className={shell}>{inner}</div>
  );
}
