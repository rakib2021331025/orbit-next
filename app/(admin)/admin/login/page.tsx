import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth/AuthShell';
import { LoginForm } from '@/components/auth/LoginForm';
import { adminLoginAction } from '@/lib/auth/actions';
import { readSession } from '@/lib/auth/session';
import { restoreFromRemember } from '@/lib/auth/remember';
import { getTranslator, getLang, translate } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'auth.admin.title'),
    robots: { index: false, follow: false },
  };
}

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const { t } = await getTranslator();

  const session = await readSession();
  if (session?.role === 'admin') redirect('/admin');
  if (!session && (await restoreFromRemember()) === 'admin') redirect('/admin');

  return (
    <AuthShell
      title={t('auth.admin.title')}
      subtitle={t('auth.admin.subtitle')}
      asideTitle={t('auth.admin.portal')}
      asideText={t('auth.admin.aside')}
      points={[
        { icon: 'bi bi-people-fill', text: t('auth.admin.p1') },
        { icon: 'bi bi-journal-check', text: t('auth.admin.p2') },
        { icon: 'bi bi-file-earmark-text', text: t('auth.admin.p3') },
        { icon: 'bi bi-globe2', text: t('auth.admin.p4') },
      ]}
      backLabel={t('auth.back_home')}
    >
      <LoginForm
        action={adminLoginAction}
        identifierName="email"
        identifierLabel={t('auth.email')}
        identifierType="email"
        identifierAutoComplete="email"
        identifierPlaceholder={t('auth.email_ph')}
        passwordLabel={t('auth.password')}
        showPasswordLabel={t('student.login.show_password')}
        rememberLabel={t('auth.remember')}
        submitLabel={t('auth.sign_in')}
        pendingLabel={t('common.please_wait')}
        forgotHref="/forgot-password"
        forgotLabel={t('auth.forgot')}
        next={next}
      />
    </AuthShell>
  );
}
