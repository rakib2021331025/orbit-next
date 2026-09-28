'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

/**
 * The grouped admin menu: dropdowns on a wide screen, a single stacked drawer
 * below `xl`.
 *
 * Labels arrive translated, because this is a client component and the
 * catalogues stay on the server.
 */

export interface AdminMenuItem {
  key: string;
  href: string;
  label: string;
  icon: string;
  badge: number;
}

export interface AdminMenuGroup {
  key: string;
  label: string;
  icon: string;
  badge: number;
  items: AdminMenuItem[];
}

export function AdminNavMenu({
  active,
  groups,
  dashboardLabel,
  menuLabel,
}: {
  active: string;
  groups: AdminMenuGroup[];
  dashboardLabel: string;
  menuLabel: string;
}) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();
  const container = useRef<HTMLDivElement>(null);

  // Navigating must close whatever is open, or the menu covers the page it just
  // took you to.
  useEffect(() => {
    setOpenGroup(null);
    setDrawer(false);
  }, [pathname]);

  // A click anywhere else closes the dropdown, which is what every other menu on
  // the web does and therefore what users expect.
  useEffect(() => {
    if (!openGroup) return;
    const onDown = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpenGroup(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenGroup(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openGroup]);

  const link = 'flex items-center gap-2 rounded-orbit px-3 py-1.5 text-sm transition';

  return (
    <>
      <div ref={container} className="hidden items-center gap-1 xl:flex">
        <Link
          href="/admin"
          aria-current={active === 'dashboard' ? 'page' : undefined}
          className={cn(
            link,
            active === 'dashboard'
              ? 'bg-white/15 font-medium text-white'
              : 'text-white/75 hover:bg-white/10 hover:text-white'
          )}
        >
          <i className="bi bi-speedometer2" aria-hidden />
          {dashboardLabel}
        </Link>

        {groups.map((group) => {
          const groupActive = group.items.some((item) => item.key === active);
          const open = openGroup === group.key;
          return (
            <div key={group.key} className="relative">
              <button
                type="button"
                onClick={() => setOpenGroup(open ? null : group.key)}
                aria-expanded={open}
                className={cn(
                  link,
                  groupActive || open
                    ? 'bg-white/15 font-medium text-white'
                    : 'text-white/75 hover:bg-white/10 hover:text-white'
                )}
              >
                <i className={cn('bi', group.icon)} aria-hidden />
                {group.label}
                {group.badge > 0 && (
                  <span className="rounded-full bg-red-600 px-1.5 text-[11px] font-semibold leading-tight">
                    {group.badge}
                  </span>
                )}
                <i className={cn('bi bi-chevron-down text-[10px] transition', open && 'rotate-180')} aria-hidden />
              </button>

              {open && (
                <ul className="absolute start-0 top-full z-40 mt-1 min-w-64 overflow-hidden rounded-orbit border border-line bg-surface py-1 shadow-orbit-lg">
                  {group.items.map((item) => (
                    <li key={item.key}>
                      <Link
                        href={item.href}
                        aria-current={item.key === active ? 'page' : undefined}
                        className={cn(
                          'flex items-center gap-2.5 px-3 py-2 text-sm transition',
                          item.key === active
                            ? 'bg-primary-soft font-medium text-primary-text'
                            : 'text-ink hover:bg-surface-2'
                        )}
                      >
                        <i className={cn('bi', item.icon, 'text-ink-muted')} aria-hidden />
                        <span className="flex-1">{item.label}</span>
                        {item.badge > 0 && (
                          <span className="rounded-full bg-red-600 px-1.5 text-[11px] font-semibold leading-tight text-white">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* Below xl: one button, one drawer holding every group expanded. */}
      <button
        type="button"
        onClick={() => setDrawer(true)}
        aria-label={menuLabel}
        aria-expanded={drawer}
        className="grid h-9 w-9 place-items-center rounded-orbit border border-white/25 text-white xl:hidden"
      >
        <i className="bi bi-list text-lg" aria-hidden />
      </button>

      {drawer && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <button
            type="button"
            aria-label={menuLabel}
            onClick={() => setDrawer(false)}
            className="absolute inset-0 bg-black/50"
          />
          <div className="absolute inset-y-0 start-0 flex w-80 max-w-[88vw] flex-col overflow-y-auto bg-brand-deep text-white">
            <div className="flex items-center justify-between px-5 py-4">
              <span className="font-head font-semibold">Orbit Admin</span>
              <button
                type="button"
                onClick={() => setDrawer(false)}
                aria-label={menuLabel}
                className="grid h-8 w-8 place-items-center rounded-full text-white/70 hover:bg-white/10"
              >
                <span aria-hidden>&times;</span>
              </button>
            </div>
            <nav aria-label={menuLabel} className="px-3 pb-6">
              <Link
                href="/admin"
                className={cn(
                  'mb-3 flex items-center gap-2 rounded-orbit px-3 py-2 text-sm',
                  active === 'dashboard' ? 'bg-white/15 text-white' : 'text-white/75 hover:bg-white/10'
                )}
              >
                <i className="bi bi-speedometer2" aria-hidden />
                {dashboardLabel}
              </Link>
              {groups.map((group) => (
                <div key={group.key} className="mb-4">
                  <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                    {group.label}
                  </p>
                  <ul className="space-y-0.5">
                    {group.items.map((item) => (
                      <li key={item.key}>
                        <Link
                          href={item.href}
                          className={cn(
                            'flex items-center gap-2.5 rounded-orbit px-3 py-2 text-sm',
                            item.key === active
                              ? 'bg-white/15 font-medium text-white'
                              : 'text-white/70 hover:bg-white/10 hover:text-white'
                          )}
                        >
                          <i className={cn('bi', item.icon)} aria-hidden />
                          <span className="flex-1 truncate">{item.label}</span>
                          {item.badge > 0 && (
                            <span className="rounded-full bg-red-600 px-1.5 text-[11px] font-semibold leading-tight">
                              {item.badge}
                            </span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
