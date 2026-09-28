'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * The phone drawer holding the same menu as the sidebar.
 *
 * Three things a hand-rolled drawer usually forgets, and this one does not:
 * it closes on route change (otherwise tapping a link leaves the menu covering
 * the page you asked for), it closes on Escape, and it locks body scroll while
 * open so the page behind does not slide under your thumb.
 */
export function MobileNav({
  label,
  portalTitle,
  closeLabel,
  children,
}: {
  label: string;
  portalTitle: string;
  closeLabel: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        aria-expanded={open}
        className="grid h-9 w-9 place-items-center rounded-orbit border border-line bg-surface text-ink-muted transition hover:text-ink lg:hidden"
      >
        <i className="bi bi-list text-lg" aria-hidden />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label={closeLabel}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/50"
          />
          <div className="absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-brand-deep text-white shadow-orbit-lg">
            <div className="flex items-center justify-between gap-3 px-5 py-4">
              <span className="font-head font-semibold">{portalTitle}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={closeLabel}
                className="grid h-8 w-8 place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                <span aria-hidden>&times;</span>
              </button>
            </div>
            <nav aria-label={label} className="flex-1 px-3 pb-6">
              {children}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
