import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site/SiteHeader';
import { PageHeader, PageBody } from '@/components/site/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { InquiryForm } from '@/components/site/InquiryForm';
import { getTranslator, getLang, translate } from '@/lib/i18n';
import { allSettings, helplineNumber } from '@/lib/settings';
import { inquiryCourses, inquiryFormToken, HONEYPOT_FIELD, PREFERRED_TIMES } from '@/lib/site/inquiry';
import { formatPhone, telHref, whatsappUrl } from '@/lib/site/url';

// The form token is minted per render, so this page is never cached.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title: translate(lang, 'inquiry.page_title'),
    description: translate(lang, 'inquiry.page_sub'),
  };
}

/**
 * The "call me back" page, from inquiry.php.
 *
 * `dynamic = 'force-dynamic'` is not an optimisation footnote: the form carries
 * a freshly signed token, and a cached page would serve everyone the same
 * expired one.
 */
export default async function InquiryPage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string }>;
}) {
  const params = await searchParams;
  const t = await getTranslator();

  const [courses, settings, helpline] = await Promise.all([
    inquiryCourses(),
    allSettings(),
    helplineNumber(),
  ]);

  const whatsapp = whatsappUrl(settings.whatsapp_number ?? '');
  const defaultCourse = /^\d+$/.test(params.course ?? '') ? Number(params.course) : undefined;

  return (
    <>
      <SiteHeader />
      <PageHeader
        title={t.t('inquiry.page_title')}
        subtitle={t.t('inquiry.page_sub')}
        breadcrumb={[{ href: '/', label: t.t('nav.home') }, { label: t.t('inquiry.page_title') }]}
      />

      <PageBody>
        <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
          <Card>
            <CardHeader title={t.t('inquiry.heading')} icon="bi-telephone-outbound" />
            <CardBody>
              <InquiryForm
                formToken={inquiryFormToken()}
                honeypotField={HONEYPOT_FIELD}
                courses={courses.map((course) => ({ id: course.id, name: t.pick(course, 'name') }))}
                source="page"
                defaultCourseId={defaultCourse}
                labels={{
                  name: t.t('inquiry.f_name'),
                  namePlaceholder: t.t('inquiry.f_name_ph'),
                  phone: t.t('inquiry.f_phone'),
                  phonePlaceholder: t.t('inquiry.f_phone_ph'),
                  course: t.t('inquiry.f_course'),
                  courseNone: t.t('inquiry.course_none'),
                  time: t.t('inquiry.f_time'),
                  times: PREFERRED_TIMES.map((value) => ({
                    value,
                    label: t.t(`inquiry.time_${value}`),
                  })),
                  message: t.t('inquiry.f_message'),
                  messagePlaceholder: t.t('inquiry.f_message_ph'),
                  optional: t.t('inquiry.optional'),
                  submit: t.t('inquiry.submit'),
                  privacy: t.t('inquiry.privacy'),
                  honeypot: t.t('inquiry.hp_label'),
                  errorSummary: t.t('inquiry.err_summary'),
                  doneTitle: t.t('inquiry.done_title'),
                  doneText: t.t('inquiry.done_text'),
                  doneAgain: t.t('inquiry.done_again'),
                }}
              />
            </CardBody>
          </Card>

          <aside>
            <Card>
              <CardHeader title={t.t('inquiry.side_title')} icon="bi-chat-dots" />
              <CardBody>
                <ul className="space-y-2.5 text-sm text-ink">
                  {[1, 2, 3].map((n) => (
                    <li key={n} className="flex items-start gap-2">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary-soft text-[11px] text-primary">
                        <i className="bi bi-check-lg" aria-hidden />
                      </span>
                      {t.t(`inquiry.side_${n}`)}
                    </li>
                  ))}
                </ul>

                {helpline !== '' && (
                  <div className="mt-5 border-t border-line-soft pt-4">
                    <p className="text-xs uppercase tracking-wide text-ink-muted">
                      {t.t('inquiry.side_call')}
                    </p>
                    <a
                      href={telHref(helpline)}
                      className="mt-1 inline-flex items-center gap-2 font-head font-semibold text-primary hover:underline"
                    >
                      <i className="bi bi-telephone-fill" aria-hidden />
                      {formatPhone(helpline)}
                    </a>
                  </div>
                )}

                {whatsapp !== '' && (
                  <a
                    href={whatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                  >
                    <i className="bi bi-whatsapp" aria-hidden />
                    {t.t('inquiry.side_whatsapp')}
                  </a>
                )}
              </CardBody>
            </Card>
          </aside>
        </div>
      </PageBody>
    </>
  );
}
