import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site/SiteHeader';
import { PageHeader, PageBody } from '@/components/site/PageHeader';
import { Alert } from '@/components/ui/Feedback';
import { getTranslator, getLang, translate } from '@/lib/i18n';
import { helplineNumber } from '@/lib/settings';
import { formatPhone } from '@/lib/site/url';
import { StatusLookup } from './StatusLookup';

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title: translate(lang, 'track.page_title'),
    description: translate(lang, 'track.sub'),
    // A lookup form has nothing for a search result, and indexing it invites
    // enumeration traffic.
    robots: { index: false, follow: true },
  };
}

/**
 * The enrolment status lookup, from check_status.php.
 *
 * Both the application number and the mobile number are required. The original
 * says why in its own header: an earlier version matched on phone or email alone
 * and showed a student's photo and attendance to anyone who knew their number.
 */
export default async function CheckStatusPage() {
  const t = await getTranslator();
  const helpline = await helplineNumber();

  // The six admission states, each with the wording and tone the applicant
  // should see. `payment_rejected` is a warning rather than an error: the
  // application is still open, only the payment needs redoing.
  const statusLabels: Record<
    string,
    { text: string; tone: 'info' | 'success' | 'warning' | 'danger' | 'neutral' }
  > = {
    pending: { text: t.t('track.pending_unpaid_text'), tone: 'info' },
    under_review: { text: t.t('track.pending_text'), tone: 'info' },
    payment_verified: { text: t.t('track.pending_text'), tone: 'info' },
    payment_rejected: { text: t.t('appstatus.payment_rejected'), tone: 'warning' },
    approved: { text: t.t('track.approved_text'), tone: 'success' },
    rejected: { text: t.t('track.rejected_text'), tone: 'danger' },
  };

  return (
    <>
      <SiteHeader />
      <PageHeader
        title={t.t('track.page_title')}
        subtitle={t.t('track.sub')}
        breadcrumb={[{ href: '/', label: t.t('nav.home') }, { label: t.t('track.page_title') }]}
      />

      <PageBody className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 lg:px-6">
        <StatusLookup
          labels={{
            heading: t.t('track.heading'),
            sub: t.t('track.sub'),
            appNo: t.t('track.f_app_no'),
            mobile: t.t('track.f_mobile'),
            course: t.t('common.course'),
            batch: t.t('course.batch'),
            studentId: t.t('common.student_id'),
            submit: t.t('track.submit'),
            privacy: t.t('track.privacy'),
            needHelp: t.t('admin.apps.note'),
            submittedOn: t.t('track.submitted_on'),
            applyNew: t.t('track.apply_new'),
            login: t.t('track.login'),
          }}
          statusLabels={statusLabels}
        />

        {helpline !== '' && (
          <Alert tone="info" className="mt-6" icon="bi-headset">
            {t.t('track.need_help', { phone: formatPhone(helpline) })}
          </Alert>
        )}
      </PageBody>
    </>
  );
}
