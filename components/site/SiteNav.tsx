'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

/**
 * The interactive half of the public navbar: the login dropdown and the phone
 * menu. Labels arrive translated from the server component above it.
 */

export interface NavLink {
  key: string;
  href: string;
  label: string;
}

export function SiteNav({
  links,
  active,
  loginLinks,
  dashboard,
  loginLabel,
  enrollLabel,
  menuLabel,
  children,
}: {
  links: NavLink[];
  active?: string;
  loginLinks: { href: string; label: string; icon: string }[];
  dashboard: { href: string; label: string; icon: string } | null;
  loginLabel: string;
  enrollLabel: string;
  menuLabel: string;
  /** The language and theme controls, rendered on the server. */
  children: React.ReactNode;
}) {
  const [menu, setMenu] = useState(false);
  const [logins, setLogins] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMenu(false);
    setLogins(false);
  }, [pathname]);

  useEffect(() => {
    if (!logins) return;
    const close = () => setLogins(false);
    // A click anywhere closes it; the button's own click stops propagating.
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [logins]);

  const linkClass = (key: string) =>
    cn(
      'rounded-orbit px-3 py-2 text-sm transition',
      key === active
        ? 'bg-primary-soft font-medium text-primary-text'
        : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
    );

  return (
    <>
      <nav aria-label={menuLabel} className="ms-auto hidden items-center gap-0.5 xl:flex">
        {links.map((link) => (
          <Link
            key={link.key}
            href={link.href}
            aria-current={link.key === active ? 'page' : undefined}
            className={linkClass(link.key)}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="ms-auto flex items-center gap-2 xl:ms-0">
        <span className="hidden items-center gap-2 sm:flex">{children}</span>

        {dashboard ? (
          <Link
            href={dashboard.href}
            className="hidden items-center gap-2 rounded-full border border-primary px-3.5 py-1.5 text-sm font-medium text-primary transition hover:bg-primary-soft sm:inline-flex"
          >
            <i className={cn('bi', dashboard.icon)} aria-hidden />
            {dashboard.label}
          </Link>
        ) : (
          <div className="relative hidden sm:block">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setLogins((open) => !open);
              }}
              aria-expanded={logins}
              className="inline-flex items-center gap-2 rounded-full border border-primary px-3.5 py-1.5 text-sm font-medium text-primary transition hover:bg-primary-soft"
            >
              <i className="bi bi-person-circle" aria-hidden />
              {loginLabel}
              <i className={cn('bi bi-chevron-down text-[10px] transition', logins && 'rotate-180')} aria-hidden />
            </button>

            {logins && (
              <ul className="absolute end-0 top-full z-40 mt-1 min-w-56 overflow-hidden rounded-orbit border border-line bg-surface py-1 shadow-orbit-lg">
                {loginLinks.map((link, index) => (
                  <li key={link.href}>
                    {/* The status check is a different kind of thing from the
                        four portals, so it sits below a divider as it does in
                        the original. */}
                    {index === loginLinks.length - 1 && <hr className="my-1 border-line-soft" />}
                    <Link
                      href={link.href}
                      className="flex items-center gap-2.5 px-3 py-2 text-sm text-ink transition hover:bg-surface-2"
                    >
                      <i className={cn('bi', link.icon, 'text-ink-muted')} aria-hidden />
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <Link
          href="/apply"
          className="inline-flex items-center gap-2 rounded-full bg-accent px-3.5 py-1.5 text-sm font-medium text-accent-text transition hover:brightness-95"
        >
          <i className="bi bi-pencil-square" aria-hidden />
          <span className="hidden sm:inline">{enrollLabel}</span>
        </Link>

        <button
          type="button"
          onClick={() => setMenu(true)}
          aria-label={menuLabel}
          aria-expanded={menu}
          className="grid h-9 w-9 place-items-center rounded-orbit border border-line text-ink-muted transition hover:text-ink xl:hidden"
        >
          <i className="bi bi-list text-lg" aria-hidden />
        </button>
      </div>

      {menu && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <button
            type="button"
            aria-label={menuLabel}
            onClick={() => setMenu(false)}
            className="absolute inset-0 bg-black/50"
          />
          <div className="absolute inset-y-0 end-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-surface">
            <div className="flex items-center justify-between px-5 py-4">
              <span className="font-head font-semibold text-ink-heading">{menuLabel}</span>
              <button
                type="button"
                onClick={() => setMenu(false)}
                aria-label={menuLabel}
                className="grid h-8 w-8 place-items-center rounded-full text-ink-muted hover:bg-surface-2"
              >
                <span aria-hidden>&times;</span>
              </button>
            </div>

            <nav aria-label={menuLabel} className="flex flex-col gap-0.5 px-3">
              {links.map((link) => (
                <Link key={link.key} href={link.href} className={linkClass(link.key)}>
                  {link.label}
                </Link>
              ))}
            </nav>

            <hr className="my-3 border-line-soft" />

            <div className="flex flex-col gap-0.5 px-3 pb-6">
              {dashboard ? (
                <Link href={dashboard.href} className={linkClass('__dash')}>
                  <i className={cn('bi', dashboard.icon, 'me-2')} aria-hidden />
                  {dashboard.label}
                </Link>
              ) : (
                loginLinks.map((link) => (
                  <Link key={link.href} href={link.href} className={linkClass('__login')}>
                    <i className={cn('bi', link.icon, 'me-2')} aria-hidden />
                    {link.label}
                  </Link>
                ))
              )}
              <div className="mt-3 flex items-center gap-2 px-3 sm:hidden">{children}</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
