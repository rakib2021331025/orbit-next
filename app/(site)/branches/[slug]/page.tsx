import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteHeader } from '@/components/site/SiteHeader';
import { PageHeader, PageBody } from '@/components/site/PageHeader';
import { CourseCard } from '@/components/site/CourseCard';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { ButtonLink } from '@/components/ui/Button';
import { getTranslator, getLang, translate, makeTranslator } from '@/lib/i18n';
import { publicBranches, branchBySlug, branchCourseIds } from '@/lib/site/branches';
import { publicCourses } from '@/lib/site/courses';
import { prisma } from '@/lib/db/prisma';
import { cached, TAGS } from '@/lib/cache';
import { uploadUrl } from '@/lib/storage/url';
import { formatPhone, telHref, safeUrl, mapSearchUrl } from '@/lib/site/url';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const lang = await getLang();
  const branch = await branchBySlug(slug);
  if (!branch) return { title: translate(lang, 'pbr.not_found') };

  const t = makeTranslator(lang);
  const name = t.pickPair(branch, 'name');
  return {
    title: name,
    description: translate(lang, 'pbr.page_meta', { branch: name, brand_bn: 'অরবিট প্রাইভেট কেয়ার' }),
    alternates: { canonical: `/branches/${branch.slug}` },
  };
}

/**
 * One branch, from branch.php: address, phone, map, its courses, its batches and
 * its teachers.
 *
 * A branch that was deactivated is a 404, not an empty page — the same reason the
 * course page 404s. Its notices are linked with `?branch=<slug>`, which the notice
 * board reads as "this branch plus the institute-wide ones".
 */
/** A branch's batches and public teachers — the same for every visitor. */
const loadBranchDetail = cached(
  (branchId: number) =>
    Promise.all([
      prisma.batch.findMany({
        where: { branch_id: branchId, status: 'active' },
        orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          name_bn: true,
          batch_type: true,
          schedule_info: true,
          schedule_info_bn: true,
          start_date: true,
          course: { select: { id: true, name: true, name_bn: true } },
        },
      }),
      prisma.branchTeacher.findMany({
        where: { branch_id: branchId, teacher: { status: 'active', show_on_website: true } },
        orderBy: { teacher: { sort_order: 'asc' } },
        select: {
          teacher: {
            select: {
              id: true,
              name: true,
              name_bn: true,
              designation: true,
              designation_bn: true,
              photo: true,
            },
          },
        },
      }),
    ]),
  ['site:branch-detail'],
  { tags: [TAGS.branches, TAGS.teachers, TAGS.courses], revalidate: 600 }
);

export default async function BranchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const branch = await branchBySlug(slug);
  if (!branch) notFound();

  const t = await getTranslator();
  const [allBranches, allCourses, courseIds] = await Promise.all([
    publicBranches(),
    publicCourses(),
    branchCourseIds(branch.id),
  ]);

  const courses = allCourses.filter((course) => courseIds.includes(course.id));
  const others = allBranches.filter((other) => other.id !== branch.id);

  let batches: {
    id: number;
    name: string;
    name_bn: string | null;
    batch_type: string;
    schedule_info: string | null;
    schedule_info_bn: string | null;
    start_date: Date | null;
    course: { id: number; name: string; name_bn: string | null } | null;
  }[] = [];
  let teachers: { id: number; name: string; name_bn: string | null; designation: string | null; designation_bn: string | null; photo: string | null }[] = [];
  try {
    const [batchRows, teacherRows] = await loadBranchDetail(branch.id);
    batches = batchRows;
    teachers = teacherRows.map((row) => row.teacher);
  } catch {
    // Requires database configuration.
  }

  const name = t.pickPair(branch, 'name');
  const address = t.pickPair(branch, 'address');
  const description = t.pickPair(branch, 'description');
  const image = uploadUrl(branch.image);
  const map = safeUrl(branch.map_url) || mapSearchUrl(address);

  return (
    <>
      <SiteHeader active="branches" />
      <PageHeader
        title={name}
        subtitle={address !== '' ? address : undefined}
        breadcrumb={[
          { href: '/', label: t.t('nav.home') },
          { href: '/branches', label: t.t('pbr.nav') },
          { label: name },
        ]}
        actions={
          <ButtonLink href={`/apply?branch=${branch.id}`} variant="primary" icon="bi-pencil-square">
            {t.t('pbr.enroll_here')}
          </ButtonLink>
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
                <CardHeader title={t.t('pbr.details')} icon="bi-info-circle" />
                <CardBody>
                  <p className="whitespace-pre-line leading-relaxed text-ink">{description}</p>
                </CardBody>
              </Card>
            )}

            <Card>
              <CardHeader title={t.t('pbr.batches')} icon="bi-collection" />
              {batches.length === 0 ? (
                <EmptyState icon="bi-calendar-x" title={t.t('pbr.batches')} body={t.t('pbr.no_batches')} />
              ) : (
                <ul className="divide-y divide-line-soft">
                  {batches.map((batch) => (
                    <li key={batch.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink-heading">{t.pick(batch, 'name')}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
                          <Badge tone={batch.batch_type === 'online' ? 'info' : 'neutral'}>
                            {t.t(batch.batch_type === 'online' ? 'course.type_online' : 'course.type_offline')}
                          </Badge>
                          {batch.course && (
                            <Link
                              href={`/courses/${batch.course.id}`}
                              className="hover:text-primary hover:underline"
                            >
                              {t.pick(batch.course, 'name')}
                            </Link>
                          )}
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
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {teachers.length > 0 && (
              <Card>
                <CardHeader title={t.t('pbr.teachers')} icon="bi-person-badge" />
                <CardBody>
                  <ul className="grid gap-4 sm:grid-cols-2">
                    {teachers.map((teacher) => {
                      const photo = uploadUrl(teacher.photo);
                      return (
                        <li key={teacher.id} className="flex items-center gap-3">
                          {photo !== '' ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={photo}
                              alt=""
                              loading="lazy"
                              className="h-12 w-12 rounded-full object-cover"
                            />
                          ) : (
                            <span className="grid h-12 w-12 place-items-center rounded-full bg-primary-soft font-semibold text-primary">
                              {t.pick(teacher, 'name').trim().charAt(0) || '?'}
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink">{t.pick(teacher, 'name')}</p>
                            <p className="truncate text-sm text-ink-muted">
                              {t.pick(teacher, 'designation')}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </CardBody>
              </Card>
            )}
          </div>

          <aside className="space-y-6">
            <Card>
              <CardHeader title={t.t('footer.contact_us')} icon="bi-telephone" />
              <CardBody className="space-y-3 text-sm">
                {address !== '' && (
                  <p className="flex gap-2 text-ink-muted">
                    <i className="bi bi-geo-alt-fill mt-0.5 shrink-0" aria-hidden />
                    <span>{address}</span>
                  </p>
                )}
                {branch.phone && (
                  <a
                    href={telHref(branch.phone)}
                    className="flex items-center gap-2 font-medium text-primary hover:underline"
                  >
                    <i className="bi bi-telephone-fill" aria-hidden />
                    {formatPhone(branch.phone)}
                  </a>
                )}
                {branch.email && (
                  <a
                    href={`mailto:${branch.email}`}
                    className="flex items-center gap-2 break-all text-primary hover:underline"
                  >
                    <i className="bi bi-envelope-fill" aria-hidden />
                    {branch.email}
                  </a>
                )}
                {map !== '' && (
                  <ButtonLink href={map} external variant="secondary" icon="bi-map" className="w-full">
                    {t.t('pbr.directions')}
                  </ButtonLink>
                )}
                <ButtonLink
                  href={`/notices?branch=${branch.slug}`}
                  variant="ghost"
                  icon="bi-megaphone"
                  className="w-full"
                >
                  {t.t('nav.notices')}
                </ButtonLink>
              </CardBody>
            </Card>

            {others.length > 0 && (
              <Card>
                <CardHeader title={t.t('pbr.other_branches')} icon="bi-diagram-3" />
                <CardBody>
                  <ul className="space-y-2 text-sm">
                    {others.map((other) => (
                      <li key={other.id}>
                        <Link
                          href={`/branches/${other.slug}`}
                          className="flex items-center gap-2 text-ink transition hover:text-primary"
                        >
                          <i className="bi bi-chevron-right text-xs text-ink-muted" aria-hidden />
                          {t.pickPair(other, 'name')}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            )}
          </aside>
        </div>

        <section className="mt-12">
          <h2 className="font-head text-xl font-semibold text-ink-heading">{t.t('pbr.courses')}</h2>
          {courses.length === 0 ? (
            <Card className="mt-5">
              <EmptyState icon="bi-journal-x" title={t.t('pbr.courses')} body={t.t('pbr.no_courses')} />
            </Card>
          ) : (
            <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {courses.map((course) => (
                <CourseCard key={course.id} course={course} t={t} />
              ))}
            </div>
          )}
        </section>
      </PageBody>
    </>
  );
}
