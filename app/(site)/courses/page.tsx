import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/site/SiteHeader';
import { PageHeader, PageBody } from '@/components/site/PageHeader';
import { CourseCard } from '@/components/site/CourseCard';
import { EmptyState } from '@/components/ui/Feedback';
import { ButtonLink } from '@/components/ui/Button';
import { getTranslator, getLang, translate } from '@/lib/i18n';
import { publicCourses } from '@/lib/site/courses';
import { CLASS_LEVELS, classLabel, classLevel, coursesForLevel } from '@/lib/site/classes';
import { cn } from '@/lib/cn';

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ class?: string }>;
}): Promise<Metadata> {
  const lang = await getLang();
  const level = classLevel((await searchParams).class);
  return {
    title: level ? translate(lang, 'course.class_title', { class: classLabel(level, lang) }) : translate(lang, 'nav.courses'),
    description: translate(lang, 'course.all_courses'),
  };
}

/**
 * The course list, from courses.php.
 *
 * The online/offline filter is a set of links rather than a script, so each view
 * has its own URL and can be shared, bookmarked and indexed. A `hybrid` course
 * appears under both filters, which is what orbit_public_courses($type) does.
 *
 * `?class=6|7|8|9|10|ssc|hsc|admission` — the home page's class buttons land
 * here, as courses.php?class= does. An unknown value is ignored.
 */
export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; class?: string }>;
}) {
  const { type, class: classKey } = await searchParams;
  const t = await getTranslator();
  const level = classLevel(classKey);
  const levelName = level ? classLabel(level, t.lang) : '';
  const all = level ? coursesForLevel(await publicCourses(), level) : await publicCourses();

  const filter = type === 'online' || type === 'offline' ? type : 'all';
  const courses =
    filter === 'all'
      ? all
      : all.filter((course) => course.course_type === filter || course.course_type === 'hybrid');

  // The type filter keeps the chosen class, and the class chips keep nothing else.
  const withClass = (query: string) => (level ? `${query}${query ? '&' : '?'}class=${level.key}` : query);
  const filters = [
    { key: 'all', href: `/courses${withClass('')}`, label: t.t('course.filter_all') },
    { key: 'online', href: `/courses${withClass('?type=online')}`, label: t.t('course.filter_online') },
    { key: 'offline', href: `/courses${withClass('?type=offline')}`, label: t.t('course.filter_offline') },
  ];
  const chip = (active: boolean) =>
    cn(
      'rounded-full border px-4 py-1.5 text-sm font-medium transition',
      active ? 'border-brand-deep bg-brand-deep text-white' : 'border-line bg-surface text-ink hover:bg-surface-2'
    );

  return (
    <>
      <SiteHeader active="courses" />
      <PageHeader
        title={level ? t.t('course.class_title', { class: levelName }) : t.t('nav.courses')}
        subtitle={t.t('course.all_courses')}
        breadcrumb={[{ href: '/', label: t.t('nav.home') }, { label: t.t('nav.courses') }]}
      />

      <PageBody>
        <nav aria-label={t.t('home.class_nav')} className="mb-4 flex flex-wrap gap-2">
          <Link href="/courses" aria-current={!level ? 'page' : undefined} className={chip(!level)}>
            {t.t('course.filter_all')}
          </Link>
          {CLASS_LEVELS.map((item) => (
            <Link
              key={item.key}
              href={`/courses?class=${item.key}`}
              aria-current={item.key === level?.key ? 'page' : undefined}
              className={chip(item.key === level?.key)}
            >
              {classLabel(item, t.lang)}
            </Link>
          ))}
        </nav>

        <div role="group" aria-label={t.t('common.filter')} className="mb-8 flex flex-wrap gap-2">
          {filters.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={item.key === filter ? 'true' : undefined}
              className={cn(
                'rounded-full border px-4 py-1.5 text-sm font-medium transition',
                item.key === filter
                  ? 'border-primary bg-primary text-white'
                  : 'border-line bg-surface text-ink hover:bg-surface-2'
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>

        {courses.length === 0 && level ? (
          <div className="py-10 text-center">
            <i className="bi bi-journal-x text-4xl text-ink-muted" aria-hidden />
            <p className="mx-auto mt-3 max-w-lg text-ink-muted">{t.t('course.class_none', { class: levelName })}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <ButtonLink href="/apply" variant="accent" icon="bi-pencil-square">
                {t.t('nav.enroll_now')}
              </ButtonLink>
              <ButtonLink href="/courses" variant="secondary">
                {t.t('course.class_all')}
              </ButtonLink>
            </div>
          </div>
        ) : courses.length === 0 ? (
          <EmptyState
            icon="bi-journal-x"
            title={t.t('course.none')}
            body={filter !== 'all' ? t.t('course.no_match') : undefined}
          />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => (
              <CourseCard key={course.id} course={course} t={t} />
            ))}
          </div>
        )}
      </PageBody>
    </>
  );
}
