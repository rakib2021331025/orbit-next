import type { Metadata } from 'next';
import { LogoutConfirm } from '@/components/auth/LogoutButton';
import { getTranslator, getLang, translate } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'nav.logout'),
    robots: { index: false, follow: false },
  };
}

export default async function TeacherLogoutPage() {
  const { t } = await getTranslator();
  return (
    <LogoutConfirm
      title={t('nav.logout')}
      body={t('logout.confirm_body')}
      confirmLabel={t('nav.logout')}
      cancelLabel={t('common.cancel')}
      cancelHref="/teacher"
    />
  );
}
