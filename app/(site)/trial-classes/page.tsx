import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site/SiteHeader';
import { PageHeader, PageBody } from '@/components/site/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { ButtonLink } from '@/components/ui/Button';
import { getTranslator, getLang, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { cachedQuery, TAGS } from '@/lib/cache';
import { youtubeId } from '@/lib/site/home';

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title: translate(lang, 'trial.title'),
    description: translate(lang, 'trial.sub'),
  };
}

/**
 * Free trial classes, from trial_classes.php.
 *
 * Two things the original is careful about and this keeps:
 *
 *   - Only a **validated video id** ever reaches the embed URL. An admin pastes
 *     a link, and an unvalidated one would let any URL become an iframe `src`.
 *   - The embed is `youtube-nocookie.com`, so no tracking cookie is set on a
 *     visitor who never presses play.
 */
export default async function TrialClassesPage() {
  const t = await getTranslator();

  // `trial_classes` has no bilingual columns and stores the link as `video_url`.
  let trials: {
    id: number;
    title: string;
    description: string | null;
    course_name: string | null;
    teacher_name: string | null;
    video_url: string | null;
  }[] = [];
  try {
    trials = await cachedQuery(['site:trial-classes'], { tags: [TAGS.home], revalidate: 600 }, () =>
      prisma.trialClass.findMany({
      where: { status: 'active' },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        title: true,
        description: true,
        course_name: true,
        teacher_name: true,
        video_url: true,
      },
    })
    );
  } catch {
    // Requires database configuration.
  }

  return (
    <>
      <SiteHeader />
      <PageHeader
        title={t.t('trial.title')}
        subtitle={t.t('trial.sub')}
        breadcrumb={[{ href: '/', label: t.t('nav.home') }, { label: t.t('trial.title') }]}
        actions={
          <ButtonLink href="/apply" variant="primary" icon="bi-pencil-square">
            {t.t('trial.enroll')}
          </ButtonLink>
        }
      />

      <PageBody>
        {trials.length === 0 ? (
          <Card>
            <EmptyState icon="bi-play-btn" title={t.t('trial.none_title')} body={t.t('trial.none')} />
          </Card>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {trials.map((trial) => {
              const video = youtubeId(trial.video_url);
              const title = trial.title;
              return (
                <li key={trial.id}>
                  <Card className="h-full overflow-hidden">
                    {video !== '' && (
                      <div className="aspect-video bg-black">
                        <iframe
                          src={`https://www.youtube-nocookie.com/embed/${video}`}
                          title={t.t('trial.play', { title })}
                          loading="lazy"
                          allowFullScreen
                          className="h-full w-full border-0"
                        />
                      </div>
                    )}
                    <CardBody>
                      <h2 className="font-head font-semibold text-ink-heading">{title}</h2>
                      <p className="mt-1 text-sm text-ink-muted">
                        {[trial.course_name, trial.teacher_name].filter(Boolean).join(' · ')}
                      </p>
                      {trial.description && (
                        <p className="mt-2 text-sm text-ink">{trial.description}</p>
                      )}
                    </CardBody>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </PageBody>
    </>
  );
}
