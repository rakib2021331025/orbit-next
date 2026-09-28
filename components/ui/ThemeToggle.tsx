'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { saveThemePreference } from '@/lib/theme/actions';

/**
 * Dark / light toggle, working exactly as the PHP one does: it flips
 * `data-theme` on `<html>`, writes `localStorage` and the `orbit_theme` cookie,
 * and saves the choice against the account when someone is signed in.
 *
 * `localStorage` is read by the inline script in the root layout before first
 * paint, which is what stops the white flash on a dark-mode page load. The cookie
 * is what lets the server render the right theme on the FIRST request, before any
 * script has run; keeping both is why the original has both.
 */
export function ThemeToggle({ label, className }: { label: string; className?: string }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Read the value the inline script already applied, rather than assuming.
  useEffect(() => {
    const applied = document.documentElement.getAttribute('data-theme');
    setTheme(applied === 'dark' ? 'dark' : 'light');
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);

    const root = document.documentElement;
    root.setAttribute('data-theme', next);
    try {
      localStorage.setItem('orbit_theme', next);
    } catch {
      // Private mode, or site data blocked. The cookie below still works, so the
      // only loss is the pre-paint hint on the next load.
    }
    // A year, so a guest keeps their choice.
    document.cookie = `orbit_theme=${next}; path=/; max-age=31536000; samesite=lax`;

    // Best effort: for a signed-in user this makes the choice follow them to
    // another device. A failure changes nothing the user can see.
    void saveThemePreference(next).catch(() => {});
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      aria-pressed={theme === 'dark'}
      className={cn(
        'grid h-9 w-9 place-items-center rounded-orbit border border-line bg-surface text-ink-muted transition hover:text-ink',
        className
      )}
    >
      <i className={cn('bi', theme === 'dark' ? 'bi-sun-fill' : 'bi-moon-stars-fill')} aria-hidden />
    </button>
  );
}
