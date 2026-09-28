import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { getTranslator, getLang, translate } from '@/lib/i18n';
import { helplineNumber } from '@/lib/settings';
import { formatPhone } from '@/lib/site/url';
import { ForgotForm } from './ForgotForm';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'auth.forgot.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * Forgot password, from forgot_password.php.
 *
 * One form for every account type: the address is searched across admins,
 * teachers and students, so a user does not have to know which kind of account
 * they have.
 */
export default async function ForgotPasswordPage() {
  const t = await getTranslator();
  const helpline = await helplineNumber();

  return (
    <AuthShell
      title={t.t('auth.forgot.title')}
      subtitle={t.t('auth.forgot.subtitle')}
      asideTitle={t.t('auth.forgot.title')}
      asideText={t.t('auth.forgot.aside')}
      points={[
        { icon: 'bi bi-mortarboard', text: t.t('nav.student_login') },
        { icon: 'bi bi-person-workspace', text: t.t('nav.teacher_login') },
        { icon: 'bi bi-shield-lock', text: t.t('nav.admin_login') },
      ]}
      backLabel={t.t('auth.back_home')}
    >
      <ForgotForm
        labels={{
          email: t.t('auth.forgot.email'),
          submit: t.t('auth.forgot.send'),
          sentTitle: t.t('auth.forgot.sent_title'),
          sentBody: t.t('auth.forgot.sent_body'),
          expiry: t.t('auth.forgot.expiry', { minutes: t.digits(60) }),
          helpPhone:
            helpline !== ''
              ? t.t('auth.forgot.help_phone', { phone: formatPhone(helpline) })
              : t.t('auth.forgot.help_office'),
        }}
      />

      <div className="mt-6 border-t border-line-soft pt-4">
        <p className="text-xs uppercase tracking-wide text-ink-muted">
          {t.t('auth.forgot.portals')}
        </p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link href="/student/login" className="text-primary hover:underline">
            {t.t('common.student')}
          </Link>
          <Link href="/teacher/login" className="text-primary hover:underline">
            {t.t('common.teacher')}
          </Link>
          <Link href="/admin/login" className="text-primary hover:underline">
            Admin
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
