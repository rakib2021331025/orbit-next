import Link from 'next/link';
import { cn } from '@/lib/cn';
import { CountPill } from '@/components/ui/Feedback';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { LogoutButton } from '@/components/auth/LogoutButton';
import { MobileNav } from './MobileNav';
import type { NavGroup } from '@/lib/nav/types';
import type { Lang } from '@/lib/i18n';

/**
 * The sidebar shell the student, teacher and guardian portals share — the `sp-*`
 * layout from includes/student_header.php.
 *
 * A fixed sidebar from `lg` up; below that the same menu inside a slide-over
 * drawer, because the majority of Orbit's students open it on a phone. The menu
 * is defined once and rendered twice, as the original does with `$spNavHtml`.
 *
 * This is chrome only. It never decides what a user may see: the page above it
 * has already called its guard, and the menu it is handed has already been
 * filtered.
 */

export interface PortalShellProps {
  /** Which nav item is current — matches `NavItem.key`. */
  active: string;
  groups: NavGroup[];
  /** Translated group and item labels come from the caller; this renders them. */
  t: (key: string, vars?: Record<string, string | number>) => string;
  lang: Lang;
  portalTitle: string;
  homeHref: string;
  user: { name: string; meta?: string; photo?: string | null };
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  /** Rendered between the page heading and the content, e.g. a child switcher. */
  banner?: React.ReactNode;
  children: React.ReactNode;
}

export function PortalShell({
  active,
  groups,
  t,
  lang,
  portalTitle,
  homeHref,
  user,
  title,
  subtitle,
  actions,
  banner,
  children,
}: PortalShellProps) {
  const nav = <NavList groups={groups} active={active} t={t} />;

  return (
    <div className="min-h-screen bg-page">
      {/* A keyboard user should not have to tab through the whole menu to reach
          the page — the first stop is a link that skips it. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-orbit focus:bg-surface focus:px-4 focus:py-2 focus:text-ink focus:shadow-orbit-lg"
      >
        {t('common.skip_to_content')}
      </a>

      <div className="lg:grid lg:grid-cols-[17rem_1fr]">
        <aside
          aria-label={portalTitle}
          className="sticky top-0 hidden h-screen flex-col overflow-y-auto bg-brand-deep text-white lg:flex"
        >
          <Link href={homeHref} className="flex items-center gap-3 px-5 py-5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-orbit bg-white/10 font-head text-lg font-semibold">
              O
            </span>
            <span className="min-w-0">
              <span className="block truncate font-head font-semibold">Orbit</span>
              <span className="block truncate text-xs text-white/60">{portalTitle}</span>
            </span>
          </Link>

          <nav aria-label={t('nav.menu')} className="flex-1 px-3 pb-4">
            {nav}
          </nav>

          <div className="border-t border-white/10 px-3 py-3 text-sm">
            <Link
              href="/"
              className="flex items-center gap-2 rounded-orbit px-3 py-2 text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              <i className="bi bi-globe2" aria-hidden />
              {t('nav.home')}
            </Link>
            <LogoutButton
              label={t('nav.logout')}
              className="flex w-full items-center gap-2 rounded-orbit px-3 py-2 text-white/70 transition hover:bg-white/10 hover:text-white"
            />
          </div>
        </aside>

        <div className="flex min-h-screen min-w-0 flex-col">
          <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
            <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
              <MobileNav label={t('nav.menu')} portalTitle={portalTitle} closeLabel={t('common.close')}>
                {nav}
              </MobileNav>

              <div className="min-w-0 flex-1">
                <p className="truncate font-head text-sm font-semibold text-ink-heading sm:text-base">
                  {portalTitle}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <LanguageSwitcher
                  current={lang}
                  labels={{ bn: 'বাংলা', en: 'EN', aria: t('lang.switch') }}
                />
                <ThemeToggle label={t('theme.toggle')} />
                <span className="hidden items-center gap-2 border-s border-line ps-3 sm:flex">
                  {user.photo ? (
                    // A plain <img>: the photo comes from the uploads store, and
                    // routing it through the image optimiser would mean a
                    // signed-URL round trip for a 40px avatar.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.photo}
                      alt=""
                      width={32}
                      height={32}
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
                      {user.name.trim().charAt(0) || '?'}
                    </span>
                  )}
                  <span className="max-w-32 truncate text-sm font-medium text-ink">{user.name}</span>
                </span>
              </div>
            </div>
          </header>

          <main id="main" className="flex-1 px-4 py-6 sm:px-6 lg:py-8">
            <div className="mx-auto max-w-7xl">
              <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="font-head text-xl font-semibold text-ink-heading sm:text-2xl">
                    {title}
                  </h1>
                  {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
                </div>
                {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
              </div>

              {banner && <div className="mb-6">{banner}</div>}

              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function NavList({
  groups,
  active,
  t,
}: {
  groups: NavGroup[];
  active: string;
  t: (key: string) => string;
}) {
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.key}>
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">
            {t(group.labelKey)}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const current = item.key === active;
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    aria-current={current ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-orbit px-3 py-2 text-sm transition',
                      current
                        ? 'bg-white/15 font-medium text-white'
                        : 'text-white/70 hover:bg-white/10 hover:text-white'
                    )}
                  >
                    <i className={cn('bi', item.icon, 'shrink-0')} aria-hidden />
                    <span className="truncate">{t(item.labelKey)}</span>
                    <CountPill count={item.badge ?? 0} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
