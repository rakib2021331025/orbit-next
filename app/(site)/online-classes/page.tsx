import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site/SiteHeader';
import { PageHeader, PageBody } from '@/components/site/PageHeader';
import { CourseCard } from '@/components/site/CourseCard';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback';
import { ButtonLink } from '@/components/ui/Button';
import { getTranslator, getLang, translate } from '@/lib/i18n';
import { publicCoursesByType } from '@/lib/site/courses';
import { helplineNumber } from '@/lib/settings';
import { prisma } from '@/lib/db/prisma';
import { cachedQuery, TAGS } from '@/lib/cache';
import { formatPhone, telHref } from '@/lib/site/url';

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title: translate(lang, 'online.title'),
    description: translate(lang, 'online.sub'),
  };
}

/**
 * The online classes page, from online_classes.php.
 *
 * The timetable is public; **the join links are not**. The original shows
 * subject, teacher and time to a visitor and keeps `meet_url` inside the student
 * portal, because a public meeting link is an open door into a live class. That
 * is why `meet_url` is never selected here.
 */
export default async function OnlineClassesPage() {
  const t = await getTranslator();
  const [courses, helpline] = await Promise.all([
    publicCoursesByType('online'),
    helplineNumber(),
  ]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let upcoming: {
    id: number;
    subject: string;
    topic: string | null;
    teacher_name: string | null;
    course: string | null;
    batch: string | null;
    class_date: Date;
    start_time: Date;
    duration_minutes: number;
  }[] = [];
  try {
    upcoming = await cachedQuery(['site:online-classes', today.toISOString().slice(0, 10)], { tags: [TAGS.classes], revalidate: 300 }, () =>
      prisma.liveClass.findMany({
      where: { status: 'scheduled', class_mode: 'online', class_date: { gte: today } },
      orderBy: [{ class_date: 'asc' }, { start_time: 'asc' }],
      take: 12,
      // No meet_url: the join link belongs to the signed-in student, not to the
      // public page.
      select: {
        id: true,
        subject: true,
        topic: true,
        teacher_name: true,
        course: true,
        batch: true,
        class_date: true,
        start_time: true,
        duration_minutes: true,
      },
    })
    );
  } catch {
    // Requires database configuration.
  }

  const steps = [1, 2, 3, 4].map((n) => ({
    title: t.t(`online.step${n}_title`),
    body: t.t(`online.step${n}`),
  }));

  return (
    <>
      <SiteHeader active="online" />
      <PageHeader
        title={t.t('online.title')}
        subtitle={t.t('online.sub')}
        breadcrumb={[{ href: '/', label: t.t('nav.home') }, { label: t.t('nav.online_classes') }]}
        actions={
          <ButtonLink href="/apply" variant="primary" icon="bi-pencil-square">
            {t.t('online.apply')}
          </ButtonLink>
        }
      />

      <PageBody>
        <section>
          <h2 className="font-head text-xl font-semibold text-ink-heading">
            {t.t('online.upcoming_title')}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">{t.t('online.upcoming_sub')}</p>

          <div className="mt-5">
            {upcoming.length === 0 ? (
              <Card>
                <EmptyState icon="bi-calendar-x" title={t.t('online.upcoming_title')} body={t.t('online.none')} />
              </Card>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {upcoming.map((item) => (
                  <li key={item.id}>
                    <Card className="h-full">
                      <CardBody>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                          <Badge tone="info" icon="bi-camera-video">
                            {t.t('course.type_online')}
                          </Badge>
                          <span>{t.date(item.class_date, 'd M Y')}</span>
                          <span aria-hidden>·</span>
                          <span>{t.date(item.start_time, 'h:i A')}</span>
                        </div>

                        <h3 className="mt-2 font-head font-semibold text-ink-heading">
                          {item.subject}
                        </h3>
                        {item.topic && <p className="mt-1 text-sm text-ink-muted">{item.topic}</p>}

                        <dl className="mt-3 space-y-1 text-sm text-ink-muted">
                          {item.teacher_name && (
                            <div className="flex items-center gap-1.5">
                              <i className="bi bi-person-badge" aria-hidden />
                              <dd>{item.teacher_name}</dd>
                            </div>
                          )}
                          {(item.course || item.batch) && (
                            <div className="flex items-center gap-1.5">
                              <i className="bi bi-collection" aria-hidden />
                              <dd>{[item.course, item.batch].filter(Boolean).join(' · ')}</dd>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            <i className="bi bi-clock" aria-hidden />
                            <dd>{t.t('online.duration', { count: t.digits(item.duration_minutes) })}</dd>
                          </div>
                        </dl>
                      </CardBody>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Alert tone="info" className="mt-4" icon="bi-lock">
            {t.t('online.sign_in_join')}
          </Alert>
        </section>

        <section className="mt-12">
          <h2 className="font-head text-xl font-semibold text-ink-heading">
            {t.t('online.how_title')}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">{t.t('online.how_sub')}</p>

          <ol className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <li key={step.title}>
                <Card className="h-full">
                  <CardBody>
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-primary-soft font-head font-semibold text-primary">
                      {t.digits(index + 1)}
                    </span>
                    <h3 className="mt-3 font-head font-semibold text-ink-heading">{step.title}</h3>
                    <p className="mt-1.5 text-sm text-ink-muted">{step.body}</p>
                  </CardBody>
                </Card>
              </li>
            ))}
          </ol>
        </section>

        {courses.length > 0 && (
          <section className="mt-12">
            <h2 className="font-head text-xl font-semibold text-ink-heading">
              {t.t('online.courses_title')}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">{t.t('online.courses_sub')}</p>
            <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {courses.slice(0, 6).map((course) => (
                <CourseCard key={course.id} course={course} t={t} />
              ))}
            </div>
          </section>
        )}

        <section className="mt-12">
          <Card>
            <CardHeader title={t.t('online.help_title')} icon="bi-headset" />
            <CardBody className="flex flex-wrap items-center gap-4">
              <p className="flex-1 text-sm text-ink-muted">{t.t('course.need_help_text')}</p>
              <div className="flex gap-2">
                {helpline !== '' && (
                  <ButtonLink href={telHref(helpline)} variant="secondary" icon="bi-telephone-fill">
                    {formatPhone(helpline)}
                  </ButtonLink>
                )}
                <ButtonLink href="/student/login" variant="primary" icon="bi-box-arrow-in-right">
                  {t.t('online.student_login')}
                </ButtonLink>
              </div>
            </CardBody>
          </Card>
        </section>
      </PageBody>
    </>
  );
}
