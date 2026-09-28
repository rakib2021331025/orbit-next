import Link from 'next/link';

/**
 * The two-column sign-in layout from includes/auth_shell.php: a dark branded
 * panel with selling points beside the form, collapsing to just the form on a
 * phone. All four portals use it, so they stay visually one product.
 */

export interface AuthPoint {
  icon: string;
  text: string;
}

export interface AuthShellProps {
  title: string;
  subtitle?: string;
  asideTitle: string;
  asideText: string;
  points?: AuthPoint[];
  backLabel?: string;
  children: React.ReactNode;
}

export function AuthShell({
  title,
  subtitle,
  asideTitle,
  asideText,
  points = [],
  backLabel = 'হোমে ফিরুন',
  children,
}: AuthShellProps) {
  return (
    <main className="min-h-screen bg-page lg:grid lg:grid-cols-2">
      {/* The branded half. Hidden on small screens, where it would push the
          form below the fold — signing in is the only job here. */}
      <aside className="relative hidden overflow-hidden bg-brand-deep px-12 py-16 text-white lg:flex lg:flex-col lg:justify-center">
        <div
          aria-hidden
          className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-mid/40 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-brand-yellow/10 blur-3xl"
        />

        <div className="relative max-w-md">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium">
            Orbit Private Care
          </span>
          <h2 className="mt-6 font-head text-3xl font-semibold leading-tight">{asideTitle}</h2>
          <p className="mt-3 text-white/75">{asideText}</p>

          {points.length > 0 && (
            <ul className="mt-8 space-y-4">
              {points.map((point) => (
                <li key={point.text} className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-yellow/15 text-brand-yellow"
                  >
                    <i className={point.icon} />
                  </span>
                  <span className="text-white/85">{point.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <div className="flex min-h-screen flex-col justify-center px-5 py-12 sm:px-10 lg:min-h-0">
        <div className="mx-auto w-full max-w-md">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-ink-muted transition hover:text-primary"
          >
            <span aria-hidden>&larr;</span>
            {backLabel}
          </Link>

          <h1 className="mt-6 font-head text-2xl font-semibold text-ink-heading sm:text-3xl">
            {title}
          </h1>
          {subtitle && <p className="mt-2 text-ink-muted">{subtitle}</p>}

          <div className="mt-8">{children}</div>
        </div>
      </div>
    </main>
  );
}

/** The error banner the PHP forms show above the fields. */
export function AuthError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="mb-5 flex items-start gap-2 rounded-orbit border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
    >
      <span aria-hidden>&#9888;</span>
      <span>{message}</span>
    </div>
  );
}
