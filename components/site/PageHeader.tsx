import Link from 'next/link';

/**
 * The banner at the top of an inner public page: title, one line of context and
 * a breadcrumb.
 *
 * The breadcrumb is a real `<nav>` with `aria-current` on the last item, because
 * it is the only way back up on a phone where the navbar is collapsed.
 */
export function PageHeader({
  title,
  subtitle,
  breadcrumb,
  actions,
}: {
  title: string;
  subtitle?: string;
  breadcrumb?: { href?: string; label: string }[];
  actions?: React.ReactNode;
}) {
  return (
    <section className="border-b border-line bg-page-alt">
      <div className="mx-auto max-w-7xl px-4 py-10 lg:px-6 lg:py-12">
        {breadcrumb && breadcrumb.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-3">
            <ol className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
              {breadcrumb.map((crumb, index) => {
                const last = index === breadcrumb.length - 1;
                return (
                  <li key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
                    {crumb.href && !last ? (
                      <Link href={crumb.href} className="transition hover:text-primary">
                        {crumb.label}
                      </Link>
                    ) : (
                      <span aria-current={last ? 'page' : undefined} className="text-ink">
                        {crumb.label}
                      </span>
                    )}
                    {!last && <span aria-hidden>/</span>}
                  </li>
                );
              })}
            </ol>
          </nav>
        )}

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-head text-2xl font-semibold text-ink-heading sm:text-3xl">{title}</h1>
            {subtitle && <p className="mt-2 max-w-2xl text-ink-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </div>
    </section>
  );
}

/** The standard content well for a public page. */
export function PageBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <main id="main" className={className ?? 'mx-auto w-full max-w-7xl flex-1 px-4 py-10 lg:px-6'}>
      {children}
    </main>
  );
}
