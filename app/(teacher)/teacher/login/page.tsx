import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth/AuthShell';
import { LoginForm } from '@/components/auth/LoginForm';
import { teacherLoginAction } from '@/lib/auth/actions';
import { readSession } from '@/lib/auth/session';
import { restoreFromRemember } from '@/lib/auth/remember';
import { getTranslator, getLang, translate } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'auth.teacher.title'),
    robots: { index: false, follow: false },
  };
}

export default async function TeacherLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const { t } = await getTranslator();

  const session = await readSession();
  if (session?.role === 'teacher') redirect('/teacher');
  if (!session && (await restoreFromRemember()) === 'teacher') redirect('/teacher');

  return (
    <AuthShell
      title={t('auth.teacher.title')}
      subtitle={t('auth.teacher.subtitle')}
      asideTitle={t('auth.teacher.portal')}
      asideText={t('auth.teacher.aside')}
      points={[
        { icon: 'bi bi-camera-video-fill', text: t('auth.teacher.p1') },
        { icon: 'bi bi-journal-check', text: t('auth.teacher.p2') },
        { icon: 'bi bi-pencil-square', text: t('auth.teacher.p3') },
        { icon: 'bi bi-bell-fill', text: t('auth.teacher.p4') },
      ]}
      backLabel={t('auth.back_home')}
    >
      <LoginForm
        action={teacherLoginAction}
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
        footer={t('auth.teacher.no_account')}
      />
    </AuthShell>
  );
}
