import Link from 'next/link';
import { getTranslator } from '@/lib/i18n';
import { readSession } from '@/lib/auth/session';
import { publicBranches } from '@/lib/site/branches';
import { instituteName, setting } from '@/lib/settings';
import { uploadUrl } from '@/lib/storage/url';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { trackPageView } from '@/lib/analytics/track';
import { SiteNav } from './SiteNav';

/**
 * The public navbar, from includes/site_header.php.
 *
 * Two details carried over deliberately:
 *
 *   - The Branches entry appears only when at least one branch exists. A
 *     single-centre install should not have a page listing one thing.
 *   - A signed-in student or guardian sees a link to their dashboard instead of
 *     the login menu. Being offered "Sign in" while already signed in is the
 *     kind of small wrongness that makes a site feel broken.
 */
export async function SiteHeader({ active }: { active?: string }) {
  // The page view is recorded from the chrome, exactly as
  // includes/site_header.php does it: every page that shows the navbar is
  // counted without having to remember to count itself.
  await trackPageView();

  const [{ t, lang }, branches, siteName, session, customLogo] = await Promise.all([
    getTranslator(),
    publicBranches(),
    instituteName(),
    readSession(),
    setting('logo_path', ''),
  ]);
  // The logo uploaded in Admin → Settings, else the stock badge — as the PHP
  // header's orbit_logo_url($base, 'badge') chooses it.
  const logo = uploadUrl(customLogo) || '/assets/brand/orbit-logo-320.webp';

  const links = [
    { key: 'home', href: '/', label: t('nav.home') },
    { key: 'courses', href: '/courses', label: t('nav.courses') },
    ...(branches.length > 0
      ? [{ key: 'branches', href: '/branches', label: t('pbr.nav') }]
      : []),
    { key: 'online', href: '/online-classes', label: t('nav.online_classes') },
    { key: 'notices', href: '/notices', label: t('nav.notices') },
    { key: 'gallery', href: '/gallery', label: t('nav.gallery') },
    { key: 'results', href: '/results', label: t('nav.results') },
    { key: 'contact', href: '/#contact', label: t('nav.contact') },
  ];

  const loginLinks = [
    { href: '/student/login', label: t('nav.student_login'), icon: 'bi-mortarboard' },
    { href: '/guardian/login', label: t('nav.guardian_login'), icon: 'bi-people' },
    { href: '/teacher/login', label: t('nav.teacher_login'), icon: 'bi-person-workspace' },
    { href: '/admin/login', label: t('nav.admin_login'), icon: 'bi-shield-lock' },
    { href: '/check-status', label: t('nav.check_status'), icon: 'bi-search' },
  ];

  const dashboard =
    session?.role === 'student'
      ? { href: '/student', label: t('nav.student_dashboard'), icon: 'bi-speedometer2' }
      : session?.role === 'guardian'
        ? { href: '/guardian', label: t('nav.guardian_dashboard'), icon: 'bi-people-fill' }
        : null;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-3 focus:z-50 focus:rounded-orbit focus:bg-surface focus:px-4 focus:py-2 focus:text-ink focus:shadow-orbit-lg"
      >
        {t('common.skip_to_content')}
      </a>

      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 lg:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- a 7 KB badge; the optimiser would only add a hop */}
          <img
            src={logo}
            alt={siteName}
            width={64}
            height={40}
            className="h-10 w-auto rounded-orbit object-contain"
            fetchPriority="high"
          />
          <span className="hidden min-w-0 sm:block">
            <span className="block font-head text-sm font-semibold leading-tight text-ink-heading">
              {siteName}
            </span>
            <span className="block text-[11px] text-ink-muted">Orbit Private Care</span>
          </span>
        </Link>

        <SiteNav
          links={links}
          active={active}
          loginLinks={loginLinks}
          dashboard={dashboard}
          loginLabel={t('nav.login')}
          enrollLabel={t('nav.enroll_now')}
          menuLabel={t('nav.menu')}
        >
          <LanguageSwitcher current={lang} labels={{ bn: 'বাংলা', en: 'EN', aria: t('lang.switch') }} />
          <ThemeToggle label={t('theme.toggle')} />
        </SiteNav>
      </div>
    </header>
  );
}
