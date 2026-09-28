import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site/SiteHeader';
import { PageHeader, PageBody } from '@/components/site/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { getTranslator, getLang, translate } from '@/lib/i18n';
import { FeedbackForm } from './FeedbackForm';

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title: translate(lang, 'home.feedback_form_title'),
    description: translate(lang, 'home.testimonials_sub'),
  };
}

/**
 * The review form on its own page.
 *
 * In the PHP app this was an inline section on the home page posting to
 * submit_feedback.php, which redirected back with `?feedback_status=`. Here it is
 * a page of its own: a server action returns the result in place, so nothing
 * needs to be smuggled through the URL and a reload does not resubmit.
 */
export default async function FeedbackPage() {
  const t = await getTranslator();

  return (
    <>
      <SiteHeader />
      <PageHeader
        title={t.t('home.feedback_form_title')}
        subtitle={t.t('home.testimonials_sub')}
        breadcrumb={[
          { href: '/', label: t.t('nav.home') },
          { label: t.t('home.feedback_form_title') },
        ]}
      />

      <PageBody className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 lg:px-6">
        <Card>
          <CardHeader title={t.t('home.testimonials_title')} icon="bi-chat-quote" />
          <CardBody>
            <FeedbackForm
              labels={{
                name: t.t('home.feedback_name'),
                course: t.t('home.feedback_course'),
                coursePlaceholder: t.t('home.feedback_course_ph'),
                rating: t.t('home.feedback_rating'),
                stars: t.t('home.stars'),
                feedback: t.t('home.feedback_text'),
                feedbackPlaceholder: t.t('home.feedback_text_ph'),
                submit: t.t('home.feedback_submit'),
                success: t.t('home.feedback_success'),
              }}
            />
          </CardBody>
        </Card>
      </PageBody>
    </>
  );
}
