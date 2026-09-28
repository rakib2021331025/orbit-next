import type { Metadata } from 'next';
import { requireStudent } from '@/lib/auth/guards';
import { getTranslator, getLang, translate } from '@/lib/i18n';
import { studentNav } from '@/lib/nav/portal';
import { unreadCount, aiAvailable } from '@/lib/notifications/counts';
import { studentPhotoUrl } from '@/lib/storage/url';
import { PortalShell } from '@/components/portal/PortalShell';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { LogoutButton } from '@/components/auth/LogoutButton';
import { prisma } from '@/lib/db/prisma';
import { PasswordForm } from './PasswordForm';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'student.settings.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * Account settings, from student/settings.php.
 *
 * This page calls `requireStudent()` rather than the usual `StudentPage` wrapper,
 * because it is one of the two pages a student on a temporary password may reach —
 * going through the wrapper would redirect it to itself, forever.
 *
 * `?first=1` is the state the login sends them to, and it says why they are here
 * rather than leaving them to guess.
 */
export default async function StudentSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ first?: string; changed?: string }>;
}) {
  const params = await searchParams;
  const student = await requireStudent();
  const t = await getTranslator();

  const first = params.first === '1' && student.mustChangePassword;

  // While the temporary password is in use the menu collapses to Settings, which
  // is what the sidebar does for a locked account.
  const [unread, ai] = await Promise.all([
    student.mustChangePassword ? Promise.resolve(0) : unreadCount('student', student.id),
    student.mustChangePassword ? Promise.resolve(false) : aiAvailable(),
  ]);

  let login: { last_login: Date | null; created_at: Date } | null = null;
  try {
    login = await prisma.studentLogin.findUnique({
      where: { id: student.loginId },
      select: { last_login: true, created_at: true },
    });
  } catch {
    login = null;
  }

  return (
    <PortalShell
      active="settings"
      groups={studentNav({ locked: student.mustChangePassword, unread, aiAvailable: ai })}
      t={t.t}
      lang={t.lang}
      portalTitle={t.t('student.portal')}
      homeHref={student.mustChangePassword ? '/student/settings' : '/student'}
      user={{
        name: t.pick(student, 'name'),
        meta: student.username,
        photo: studentPhotoUrl(student) || null,
      }}
      title={first ? t.t('student.settings.first_title') : t.t('student.settings.title')}
      subtitle={first ? undefined : t.t('student.settings.sub')}
    >
      <div className="space-y-6">
        {first && (
          <Alert tone="warning" title={t.t('student.settings.first_title')} icon="bi-shield-exclamation">
            {t.t('student.settings.first_body')}
          </Alert>
        )}

        {params.changed === '1' && (
          <Alert tone="success" icon="bi-check-circle-fill">
            {t.t('student.settings.password_changed')}
          </Alert>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title={t.t('student.settings.change_password')} icon="bi-key" />
            <CardBody>
              <PasswordForm
                first={first}
                labels={{
                  current: student.mustChangePassword
                    ? t.t('student.settings.temp_password')
                    : t.t('student.settings.current_password'),
                  next: t.t('student.settings.new_password'),
                  confirm: t.t('student.settings.confirm_password'),
                  hint: t.t('student.settings.password_hint'),
                  submit: t.t('student.settings.save_password'),
                }}
              />
            </CardBody>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader title={t.t('student.settings.account_info')} icon="bi-person-badge" />
              <CardBody>
                <dl className="space-y-3 text-sm">
                  <Row label={t.t('student.settings.username')} value={student.username} />
                  <Row
                    label={t.t('common.student_id')}
                    value={student.student_id_no ?? '—'}
                  />
                  <Row
                    label={t.t('student.settings.last_login')}
                    value={
                      login?.last_login
                        ? t.date(login.last_login, 'd M Y, h:i A')
                        : t.t('student.settings.never')
                    }
                  />
                  <Row
                    label={t.t('student.settings.member_since')}
                    value={login ? t.date(login.created_at, 'd M Y') : '—'}
                  />
                </dl>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title={t.t('student.settings.sign_out_title')} icon="bi-box-arrow-right" />
              <CardBody>
                <p className="mb-3 text-sm text-ink-muted">
                  {t.t('student.settings.sign_out_body')}
                </p>
                <LogoutButton
                  label={t.t('student.nav.logout')}
                  className="inline-flex items-center gap-2 rounded-orbit border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
                />
              </CardBody>
            </Card>
          </div>
        </div>
      </div>
    </PortalShell>
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
