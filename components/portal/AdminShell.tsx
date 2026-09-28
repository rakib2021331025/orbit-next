import Link from 'next/link';
import { cn } from '@/lib/cn';
import { CountPill } from '@/components/ui/Feedback';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { LogoutButton } from '@/components/auth/LogoutButton';
import { AdminNavMenu } from './AdminNavMenu';
import { adminGroupBadge, type AdminBadges } from '@/lib/nav/admin';
import type { NavGroup } from '@/lib/nav/types';
import type { AdminAccount } from '@/lib/auth/guards';
import type { Lang } from '@/lib/i18n';

/**
 * The admin chrome: a dark top navbar with grouped dropdowns, as
 * includes/admin_nav.php renders it, plus the branch bar underneath when the
 * signed-in admin can switch branch.
 *
 * A navbar rather than the portals' sidebar because the admin menu has 39 entries
 * across five groups — a sidebar deep enough to hold them leaves no room for the
 * tables, which is why the original made the same choice.
 */

export interface AdminShellProps {
  active: string;
  groups: NavGroup[];
  badges: AdminBadges;
  admin: AdminAccount;
  t: (key: string, vars?: Record<string, string | number>) => string;
  lang: Lang;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  /** The branch switcher / lock notice, when there is more than one branch. */
  branchBar?: React.ReactNode;
  children: React.ReactNode;
}

export function AdminShell({
  active,
  groups,
  badges,
  admin,
  t,
  lang,
  title,
  subtitle,
  actions,
  branchBar,
  children,
}: AdminShellProps) {
  const withBadges = groups.map((group) => ({
    group,
    badge: adminGroupBadge(group.key, badges),
  }));

  return (
    <div className="min-h-screen bg-page">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-orbit focus:bg-surface focus:px-4 focus:py-2 focus:text-ink focus:shadow-orbit-lg"
      >
        {t('common.skip_to_content')}
      </a>

      <nav aria-label={t('admin.nav.dashboard')} className="bg-brand-deep text-white">
        <div className="mx-auto flex max-w-[100rem] items-center gap-3 px-4 py-2.5 lg:px-6">
          <Link href="/admin" className="flex shrink-0 items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-orbit bg-white/10 font-head font-semibold">
              O
            </span>
            <span className="hidden min-w-0 sm:block">
              <span className="block font-head text-sm font-semibold leading-tight">Orbit Admin</span>
              <span className="block truncate text-[11px] text-white/60">
                {admin.role === 'branch_admin' ? t('branch.locked_hint') : t('branch.all_branches')}
              </span>
            </span>
          </Link>

          <AdminNavMenu
            active={active}
            groups={withBadges.map(({ group, badge }) => ({
              key: group.key,
              label: t(group.labelKey),
              icon: group.icon ?? 'bi-dot',
              badge,
              items: group.items.map((item) => ({
                key: item.key,
                href: item.href,
                label: t(item.labelKey),
                icon: item.icon,
                badge: item.badge ?? 0,
              })),
            }))}
            dashboardLabel={t('admin.nav.dashboard')}
            menuLabel={t('nav.menu')}
          />

          <div className="ms-auto flex shrink-0 items-center gap-2">
            <LanguageSwitcher
              current={lang}
              labels={{ bn: 'বাংলা', en: 'EN', aria: t('lang.switch') }}
              className="border-white/25"
            />
            <ThemeToggle
              label={t('theme.toggle')}
              className="border-white/25 bg-white/10 text-white hover:text-white"
            />
            <span className="hidden max-w-40 truncate text-xs text-white/70 xl:inline">
              {admin.email}
            </span>
            <LogoutButton
              label={t('nav.logout')}
              className="inline-flex items-center gap-2 rounded-orbit border border-white/25 px-3 py-1.5 text-xs font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
            />
          </div>
        </div>
      </nav>

      {branchBar}

      <main id="main" className="px-4 py-6 lg:px-6 lg:py-8">
        <div className="mx-auto max-w-[100rem]">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-head text-xl font-semibold text-ink-heading sm:text-2xl">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

/**
 * The strip under the navbar: which branch an admin is looking at.
 *
 * A branch-locked admin gets a plain statement, not a switcher — they cannot
 * change it, and offering a control that refuses is worse than showing none.
 */
export function BranchBar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('border-b border-line bg-surface-2', className)}>
      <div className="mx-auto flex max-w-[100rem] flex-wrap items-center gap-3 px-4 py-2 text-sm lg:px-6">
        {children}
      </div>
    </div>
  );
}

export { CountPill };
