'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { cn } from '@/lib/cn';
import { setLanguage } from '@/lib/i18n/actions';

/**
 * বাংলা / English, as lang.php offers it.
 *
 * Two visible buttons rather than a dropdown: with only two languages a dropdown
 * hides the choice behind a click, and the point is that a guardian who cannot
 * read the English labels can see the Bangla one without opening anything.
 */
export function LanguageSwitcher({
  current,
  labels,
  className,
}: {
  current: 'bn' | 'en';
  labels: { bn: string; en: string; aria: string };
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function choose(lang: 'bn' | 'en') {
    if (lang === current || pending) return;
    startTransition(async () => {
      await setLanguage(lang, pathname);
      // Every label on the page was translated on the server, so the page has to
      // be fetched again — changing a cookie alone would leave the old text.
      router.refresh();
    });
  }

  return (
    <div
      role="group"
      aria-label={labels.aria}
      className={cn('inline-flex overflow-hidden rounded-orbit border border-line', className)}
    >
      {(['bn', 'en'] as const).map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => choose(lang)}
          disabled={pending}
          aria-current={lang === current ? 'true' : undefined}
          className={cn(
            'px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-60',
            lang === current
              ? 'bg-primary text-white'
              : 'bg-surface text-ink-muted hover:bg-surface-2 hover:text-ink'
          )}
        >
          {labels[lang]}
        </button>
      ))}
    </div>
  );
}
