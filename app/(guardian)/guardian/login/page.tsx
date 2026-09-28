import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth/AuthShell';
import { LoginForm } from '@/components/auth/LoginForm';
import { guardianLoginAction } from '@/lib/auth/actions';
import { readSession } from '@/lib/auth/session';
import { restoreFromRemember } from '@/lib/auth/remember';
import { getTranslator, getLang, translate } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'guardian.login.title'),
    robots: { index: false, follow: false },
  };
}

export default async function GuardianLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const { t } = await getTranslator();

  const session = await readSession();
  if (session?.role === 'guardian') redirect('/guardian');
  if (!session && (await restoreFromRemember()) === 'guardian') redirect('/guardian');

  return (
    <AuthShell
      title={t('guardian.login.title')}
      subtitle={t('guardian.login.subtitle')}
      asideTitle={t('guardian.portal')}
      asideText={t('guardian.login.aside')}
      points={[
        { icon: 'bi bi-person-check', text: t('guardian.nav.attendance') },
        { icon: 'bi bi-award', text: t('guardian.nav.results') },
        { icon: 'bi bi-cash-coin', text: t('guardian.login.point_fees') },
        { icon: 'bi bi-chat-dots', text: t('guardian.nav.notices') },
      ]}
      backLabel={t('guardian.login.back_home')}
    >
      <LoginForm
        action={guardianLoginAction}
        identifierName="phone"
        identifierLabel={t('guardian.login.phone')}
        identifierType="tel"
        identifierAutoComplete="tel"
        identifierPlaceholder={t('guardian.login.phone_ph')}
        passwordLabel={t('guardian.login.password')}
        showPasswordLabel={t('student.login.show_password')}
        rememberLabel={t('guardian.login.remember')}
        submitLabel={t('guardian.login.submit')}
        pendingLabel={t('common.please_wait')}
        next={next}
        footer={
          <span className="flex flex-col gap-1">
            <span>{t('guardian.login.no_account')}</span>
            <Link href="/student/login" className="font-medium text-primary hover:underline">
              {t('guardian.login.student_login')}
            </Link>
          </span>
        }
      />
    </AuthShell>
  );
}
