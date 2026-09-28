import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * Buttons and button-shaped links.
 *
 * `Button` renders a real `<button>`; `ButtonLink` a real `<a>`. They are kept
 * separate on purpose — a navigation dressed as a button breaks middle-click,
 * "open in new tab" and keyboard expectations, and a button dressed as a link
 * submits nothing.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white shadow-sm hover:bg-primary-hover focus-visible:ring-primary/40',
  secondary:
    'border border-line bg-surface text-ink hover:bg-surface-2 focus-visible:ring-primary/30',
  ghost: 'text-ink-muted hover:bg-surface-3 hover:text-ink focus-visible:ring-primary/30',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700 focus-visible:ring-red-500/40',
  accent:
    'bg-accent text-accent-text shadow-sm hover:brightness-95 focus-visible:ring-accent/50',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-5 py-3 text-base',
};

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-orbit font-medium transition focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string;
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button className={cn(BASE, VARIANTS[variant], SIZES[size], className)} {...rest}>
      {icon && <i className={cn('bi', icon)} aria-hidden />}
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = 'secondary',
  size = 'md',
  icon,
  className,
  children,
  external,
  ...rest
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string;
  className?: string;
  children: React.ReactNode;
  external?: boolean;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'className' | 'children'>) {
  const classes = cn(BASE, VARIANTS[variant], SIZES[size], className);
  const body = (
    <>
      {icon && <i className={cn('bi', icon)} aria-hidden />}
      {children}
    </>
  );

  // rel="noopener" on every new-tab link: without it the opened page can reach
  // back through window.opener.
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes} {...rest}>
        {body}
      </a>
    );
  }

  return (
    <Link href={href} className={classes} {...rest}>
      {body}
    </Link>
  );
}

/** A square icon-only button. `label` is required — it becomes the accessible name. */
export function IconButton({
  icon,
  label,
  variant = 'ghost',
  className,
  ...rest
}: { icon: string; label: string; variant?: ButtonVariant } & Omit<ButtonProps, 'icon' | 'variant'>) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(BASE, VARIANTS[variant], 'h-9 w-9 p-0', className)}
      {...rest}
    >
      <i className={cn('bi', icon)} aria-hidden />
    </button>
  );
}
