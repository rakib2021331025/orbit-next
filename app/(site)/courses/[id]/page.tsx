import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteHeader } from '@/components/site/SiteHeader';
import { PageHeader, PageBody } from '@/components/site/PageHeader';
import { CourseCard } from '@/components/site/CourseCard';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback';
import { ButtonLink } from '@/components/ui/Button';
import { getTranslator, getLang, translate, makeTranslator } from '@/lib/i18n';
import { publicCourse, publicCourses, courseSummary } from '@/lib/site/courses';
import { enrollableBatches, courseIsOpen, coursePrice, batchFee } from '@/lib/site/batches';
import { helplineNumber } from '@/lib/settings';
import { uploadUrl } from '@/lib/storage/url';
import { telHref, formatPhone } from '@/lib/site/url';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const lang = await getLang();
  const course = await publicCourse(Number(id));
  if (!course) return { title: translate(lang, 'course.not_found') };

  const t = makeTranslator(lang);
  return {
    title: t.pick(course, 'name'),
    description: courseSummary(course, t.pick),
    alternates: { canonical: `/courses/${course.id}` },
  };
}

/**
 * One course, from course.php: description, the batches you can join with their
 * schedule and fee, the teacher, and an "enrol in this batch" button per batch.
 *
 * A missing course is a 404 rather than an empty page — the original sets
 * `http_response_code(404)` for the same reason: a course that was withdrawn
 * should leave the search index, not linger as a soft-404.
 */
export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const courseId = /^\d+$/.test(id) ? Number(id) : 0;
  const course = await publicCourse(courseId);
  if (!course) notFound();

  const t = await getTranslator();
  const [all, helpline] = await Promise.all([publicCourses(), helplineNumber()]);

  const batches = enrollableBatches(course);
  const open = courseIsOpen(course);
  const price = coursePrice(course);
  const image = uploadUrl(course.image);
  const duration = t.pick(course, 'duration');
  const batchInfo = t.pick(course, 'batch_info');
  const description = t.pick(course, 'description');
  const instructor = course.teacher ? t.pick(course.teacher, 'name') : (course.instructor_name ?? '');

  // Same-type courses first, then the rest — as course.php sorts them.
  const related = all
    .filter((other) => other.id !== course.id)
    .sort((a, b) => {
      const sa = a.course_type === course.course_type || a.course_type === 'hybrid' ? 0 : 1;
      const sb = b.course_type === course.course_type || b.course_type === 'hybrid' ? 0 : 1;
      return sa - sb;
    })
    .slice(0, 3);

  const typeLabel = t.t(
    course.course_type === 'online'
      ? 'course.type_online'
      : course.course_type === 'hybrid'
        ? 'course.type_hybrid'
        : 'course.type_offline'
  );

  return (
    <>
      <SiteHeader active="courses" />
      <PageHeader
        title={t.pick(course, 'name')}
        subtitle={courseSummary(course, t.pick, 220)}
        breadcrumb={[
          { href: '/', label: t.t('nav.home') },
          { href: '/courses', label: t.t('nav.courses') },
          { label: t.pick(course, 'name') },
        ]}
        actions={
          open ? (
            <ButtonLink href={`/apply?course=${course.id}`} variant="primary" icon="bi-pencil-square">
              {t.t('nav.enroll_now')}
            </ButtonLink>
          ) : undefined
        }
      />

      <PageBody>
        <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
          <div className="min-w-0 space-y-8">
            {image !== '' && (
              <div className="overflow-hidden rounded-orbit border border-line-soft">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt="" className="aspect-[16/7] w-full object-cover" />
              </div>
            )}

            {description !== '' && (
              <Card>
                <CardHeader title={t.t('course.about')} icon="bi-info-circle" />
                <CardBody>
                  {/* The description is admin-authored plain text with line
                      breaks, not HTML — rendering it as HTML would make the
                      settings form an XSS vector for every visitor. */}
                  <div className="space-y-3 text-ink">
                    {description
                      .split(/\n{2,}/)
                      .map((paragraph, index) => (
                        <p key={index} className="whitespace-pre-line leading-relaxed">
                          {paragraph}
                        </p>
                      ))}
                  </div>
                </CardBody>
              </Card>
            )}

            <Card>
              <CardHeader
                title={t.t('course.available_batches')}
                icon="bi-collection"
                subtitle={batchInfo !== '' ? batchInfo : undefined}
              />
              {batches.length === 0 ? (
                <EmptyState icon="bi-calendar-x" title={t.t('course.coming_soon')} body={t.t('course.no_batches')} />
              ) : (
                <ul className="divide-y divide-line-soft">
                  {batches.map((batch) => {
                    const fee = batchFee(batch, course.fee);
                    return (
                      <li key={batch.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-ink-heading">{t.pick(batch, 'name')}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
                            <Badge tone={batch.batch_type === 'online' ? 'info' : 'neutral'}>
                              {t.t(batch.batch_type === 'online' ? 'course.type_online' : 'course.type_offline')}
                            </Badge>
                            {t.pick(batch, 'schedule_info') !== '' && (
                              <span className="inline-flex items-center gap-1.5">
                                <i className="bi bi-clock" aria-hidden />
                                {t.pick(batch, 'schedule_info')}
                              </span>
                            )}
                            {batch.start_date && (
                              <span className="inline-flex items-center gap-1.5">
                                <i className="bi bi-calendar-event" aria-hidden />
                                {t.t('course.starts_on', { date: t.date(batch.start_date) })}
                              </span>
                            )}
                            {batch.capacity !== null && (
                              <span className="inline-flex items-center gap-1.5">
                                <i className="bi bi-people" aria-hidden />
                                {t.t('course.seats')}: {t.digits(batch.capacity)}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {fee !== null && (
                            <span className="font-head font-semibold text-primary">{t.money(fee)}</span>
                          )}
                          {open && (
                            <ButtonLink
                              href={`/apply?course=${course.id}&batch=${batch.id}`}
                              variant="secondary"
                              size="sm"
                            >
                              {t.t('course.enroll_batch')}
                            </ButtonLink>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>

          <aside className="space-y-6">
            <Card>
              <CardHeader title={t.t('course.at_a_glance')} icon="bi-list-check" />
              <CardBody>
                <dl className="space-y-3 text-sm">
                  <Row label={t.t('course.course_type')} value={typeLabel} />
                  {duration !== '' && <Row label={t.t('course.duration')} value={duration} />}
                  {instructor !== '' && <Row label={t.t('course.instructor')} value={instructor} />}
                  <Row
                    label={t.t('course.price')}
                    value={
                      price.amount === null
                        ? t.t('course.price_ask')
                        : price.from
                          ? `${t.t('course.from')} ${t.money(price.amount)}`
                          : t.money(price.amount)
                    }
                    strong
                  />
                </dl>

                {open ? (
                  <ButtonLink
                    href={`/apply?course=${course.id}`}
                    variant="primary"
                    className="mt-5 w-full"
                    icon="bi-pencil-square"
                  >
                    {t.t('nav.enroll_now')}
                  </ButtonLink>
                ) : (
                  <Alert tone="warning" className="mt-5">
                    {t.t('course.no_batches')}
                  </Alert>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title={t.t('course.how_to_enroll')} icon="bi-question-circle" />
              <CardBody className="space-y-3 text-sm text-ink-muted">
                <p>{t.t('course.payment_note')}</p>
                <p className="font-medium text-ink">{t.t('course.need_help')}</p>
                <p>{t.t('course.need_help_text')}</p>
                {helpline !== '' && (
                  <a
                    href={telHref(helpline)}
                    className="inline-flex items-center gap-2 font-medium text-primary hover:underline"
                  >
                    <i className="bi bi-telephone-fill" aria-hidden />
                    {formatPhone(helpline)}
                  </a>
                )}
              </CardBody>
            </Card>
          </aside>
        </div>

        {related.length > 0 && (
          <section className="mt-12">
            <h2 className="font-head text-xl font-semibold text-ink-heading">{t.t('course.related')}</h2>
            <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((other) => (
                <CourseCard key={other.id} course={other} t={t} />
              ))}
            </div>
            <div className="mt-6">
              <Link href="/courses" className="font-medium text-primary hover:underline">
                {t.t('course.all_courses')} &rarr;
              </Link>
            </div>
          </section>
        )}
      </PageBody>
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={strong ? 'font-head font-semibold text-primary' : 'text-end font-medium text-ink'}>
        {value}
      </dd>
    </div>
  );
}
