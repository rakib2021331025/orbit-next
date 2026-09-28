import type { Metadata } from 'next';
import { GuardianPage } from '@/components/portal/GuardianPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { LogoutButton } from '@/components/auth/LogoutButton';
import { getLang, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { formatPhone } from '@/lib/site/url';
import { GuardianPasswordForm } from './PasswordForm';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'guardian.settings.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * Account settings, from guardian/settings.php.
 *
 * `allowLocked`: this is the one page a guardian on a temporary password may
 * reach, and where they must replace it before anything else opens. Language
 * and theme are here too, as the original has them.
 */
export default async function GuardianSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ changed?: string }>;
}) {
  const params = await searchParams;

  return (
    <GuardianPage
      active="settings"
      allowLocked
      title={(t) => t.t('guardian.settings.title')}
      subtitle={(t) => t.t('guardian.settings.sub')}
    >
      {async ({ guardian, children, t }) => {
        const first = guardian.mustChangePassword;
        const account = await prisma.guardian
          .findUnique({ where: { id: guardian.id }, select: { last_login: true } })
          .catch(() => null);

        return (
          <div className="space-y-6">
            {first && (
              <Alert tone="warning" title={t.t('guardian.settings.first_title')} icon="bi-shield-lock-fill">
                {t.t('guardian.settings.first_body')} {t.t('guardian.must_change')}
              </Alert>
            )}
            {params.changed === '1' && (
              <Alert tone="success" icon="bi-check-circle-fill">
                {t.t('guardian.settings.password_changed')}
              </Alert>
            )}

            <div className="grid gap-6 lg:grid-cols-5">
              <Card className="lg:col-span-3">
                <CardHeader title={t.t('guardian.settings.change_password')} icon="bi-key-fill" />
                <CardBody>
                  <GuardianPasswordForm
                    phone={guardian.phone}
                    labels={{
                      current: first
                        ? t.t('guardian.settings.temp_password')
                        : t.t('guardian.settings.current_password'),
                      next: t.t('guardian.settings.new_password'),
                      confirm: t.t('guardian.settings.confirm_password'),
                      hint: t.t('guardian.settings.password_hint'),
                      submit: t.t('guardian.settings.save_password'),
                    }}
                  />
                </CardBody>
              </Card>

              <div className="space-y-6 lg:col-span-2">
                <Card>
                  <CardHeader title={t.t('guardian.settings.account_info')} icon="bi-person-lock" />
                  <CardBody>
                    <dl className="space-y-3 text-sm">
                      <Row label={t.t('guardian.settings.phone')} value={formatPhone(guardian.phone)} />
                      {guardian.name !== '' && <Row label={t.t('common.name')} value={guardian.name} />}
                      {!first && (
                        <Row
                          label={t.t('guardian.settings.children')}
                          value={children.length > 0 ? children.map((c) => t.pick(c, 'name')).join(', ') : '—'}
                        />
                      )}
                      <Row
                        label={t.t('guardian.settings.last_login')}
                        value={
                          account?.last_login
                            ? t.date(account.last_login, 'd M Y, h:i A')
                            : t.t('guardian.settings.never')
                        }
                      />
                    </dl>
                    <p className="mt-3 text-xs text-ink-muted">{t.t('guardian.settings.details_office')}</p>
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader title={t.t('guardian.settings.language')} icon="bi-translate" />
                  <CardBody className="space-y-2">
                    <p className="text-sm text-ink-muted">{t.t('guardian.settings.language_hint')}</p>
                    <LanguageSwitcher
                      current={t.lang}
                      labels={{ bn: 'বাংলা', en: 'English', aria: t.t('lang.switch') }}
                    />
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader title={t.t('guardian.settings.theme')} icon="bi-circle-half" />
                  <CardBody className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-ink-muted">{t.t('guardian.settings.theme_hint')}</span>
                    <ThemeToggle label={t.t('guardian.settings.theme_toggle')} />
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader title={t.t('guardian.nav.logout')} icon="bi-box-arrow-right" />
                  <CardBody className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-ink-muted">{t.t('guardian.settings.sign_out_body')}</span>
                    <LogoutButton
                      label={t.t('guardian.nav.logout')}
                      className="inline-flex items-center gap-2 rounded-orbit border border-red-500 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
                    />
                  </CardBody>
                </Card>
              </div>
            </div>
          </div>
        );
      }}
    </GuardianPage>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line-soft pb-2">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-end font-medium text-ink">{value}</dd>
    </div>
  );
}
