import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth/AuthShell';
import { LoginForm } from '@/components/auth/LoginForm';
import { studentLoginAction } from '@/lib/auth/actions';
import { readSession } from '@/lib/auth/session';
import { restoreFromRemember } from '@/lib/auth/remember';
import { getTranslator, getLang, translate } from '@/lib/i18n';

// noindex, as the PHP login pages declare: a sign-in form has nothing to offer a
// search result, and indexing it invites credential-stuffing traffic.
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'student.login.title'),
    robots: { index: false, follow: false },
  };
}

export default async function StudentLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const { t } = await getTranslator();

  // Already signed in, or holding a valid remember-me cookie: go straight in.
  const session = await readSession();
  if (session?.role === 'student') redirect('/student');
  if (!session && (await restoreFromRemember()) === 'student') redirect('/student');

  return (
    <AuthShell
      title={t('student.login.title')}
      subtitle={t('student.login.subtitle')}
      asideTitle={t('student.portal')}
      asideText={t('student.login.subtitle')}
      points={[
        { icon: 'bi bi-calendar3', text: t('student.nav.routine') },
        { icon: 'bi bi-journal-text', text: t('student.nav.materials') },
        { icon: 'bi bi-graph-up', text: t('student.nav.results') },
        { icon: 'bi bi-cash-coin', text: t('student.nav.payments') },
      ]}
      backLabel={t('student.login.back_home')}
    >
      <LoginForm
        action={studentLoginAction}
        identifierName="username"
        identifierLabel={t('student.login.username')}
        identifierPlaceholder={t('student.login.username_ph')}
        passwordLabel={t('student.login.password')}
        showPasswordLabel={t('student.login.show_password')}
        rememberLabel={t('student.login.remember')}
        submitLabel={t('student.login.submit')}
        pendingLabel={t('common.please_wait')}
        forgotHref="/forgot-password"
        forgotLabel={t('student.login.forgot')}
        next={next}
        footer={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {t('student.login.new_here')}
            <Link href="/admission" className="font-medium text-primary hover:underline">
              {t('student.login.enroll')}
            </Link>
            <span aria-hidden className="text-line">
              ·
            </span>
            <Link href="/check-status" className="font-medium text-primary hover:underline">
              {t('student.login.check_status')}
            </Link>
          </span>
        }
      />
    </AuthShell>
  );
}
