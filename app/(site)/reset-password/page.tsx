import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { Alert } from '@/components/ui/Feedback';
import { getTranslator, getLang, translate } from '@/lib/i18n';
import { validateResetToken } from '@/lib/auth/reset';
import { ResetForm } from './ResetForm';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'auth.reset.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * Setting a new password, from reset_password.php.
 *
 * The token is validated BEFORE the form is rendered, so a dead link says so
 * immediately rather than after the user has typed a password twice.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const t = await getTranslator();
  const row = await validateResetToken(token);

  return (
    <AuthShell
      title={t.t('auth.reset.title')}
      asideTitle={t.t('auth.reset.title')}
      asideText={t.t('auth.reset.aside')}
      backLabel={t.t('auth.back_home')}
    >
      {!row ? (
        <div>
          <Alert tone="danger" title={t.t('auth.reset.bad_title')} icon="bi-link-45deg">
            <p>{t.t('auth.reset.bad_body')}</p>
            <p className="mt-2 text-xs">
              {t.t('auth.reset.bad_note', { minutes: t.digits(60) })}
            </p>
          </Alert>
          <Link
            href="/forgot-password"
            className="mt-5 inline-block font-medium text-primary hover:underline"
          >
            {t.t('auth.forgot.send')} &rarr;
          </Link>
        </div>
      ) : (
        <ResetForm
          token={String(token ?? '')}
          email={row.email}
          labels={{
            for: t.t('auth.reset.for'),
            newPassword: t.t('auth.reset.new'),
            confirm: t.t('auth.reset.confirm'),
            hint: t.t('auth.reset.hint'),
            submit: t.t('auth.reset.submit'),
            match: t.t('auth.reset.match'),
            noMatch: t.t('auth.reset.nomatch'),
            doneTitle: t.t('auth.reset.done_title'),
            doneBody: t.t('auth.reset.done_body'),
            doneNote: t.t('auth.reset.done_note'),
            goSignIn: t.t('auth.reset.go_sign_in'),
          }}
        />
      )}
    </AuthShell>
  );
}
