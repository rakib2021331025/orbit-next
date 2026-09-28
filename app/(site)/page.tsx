import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/site/SiteHeader';
import { CourseCard } from '@/components/site/CourseCard';
import { Card, CardBody, StatCard } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { ButtonLink } from '@/components/ui/Button';
import { getTranslator, getLang, translate } from '@/lib/i18n';
import { seoVars } from '@/lib/seo/vars';
import { allSettings, instituteName, settingLocalized } from '@/lib/settings';
import { publicCourses } from '@/lib/site/courses';
import { CLASS_LEVELS, classLabel } from '@/lib/site/classes';
import { publicBranches } from '@/lib/site/branches';
import {
  activeGifts,
  activePromotions,
  homeSections,
  siteStats,
  teamDeveloper,
  teamDirector,
  teamTeachers,
  youtubeId,
} from '@/lib/site/home';
import { uploadUrl } from '@/lib/storage/url';
import { formatPhone, telHref, safeUrl, whatsappUrl, mapSearchUrl } from '@/lib/site/url';

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  const vars = await seoVars(lang);
  return {
    // The brand comes first in the home page's own title, so a search result
    // reads "Orbit Private Care, Rangpur | …" rather than the other way round.
    title: { absolute: translate(lang, 'home.seo_title', vars) },
    description: translate(lang, 'home.meta_description', vars),
    alternates: { canonical: '/' },
  };
}

/**
 * The public home page, from index.php.
 *
 * Every section reads live data or an admin-editable setting; nothing
 * promotional is hard-coded, and a section with no data does not render at all.
 * That is the rule that keeps a half-configured site looking finished instead of
 * showing a row of empty boxes.
 */
export default async function HomePage() {
  const t = await getTranslator();
  const vars = await seoVars(t.lang);

  const [
    courses,
    branches,
    stats,
    sections,
    gifts,
    heroPromos,
    sectionPromos,
    settings,
    siteName,
    director,
    teachers,
    developer,
  ] = await Promise.all([
    publicCourses(),
    publicBranches(),
    siteStats(),
    homeSections(),
    activeGifts(6),
    activePromotions('hero', 1),
    activePromotions('home_section', 6),
    allSettings(),
    instituteName(),
    teamDirector(t.lang),
    teamTeachers(),
    teamDeveloper(t.lang),
  ]);

  const heroPromo = heroPromos[0] ?? null;
  // The student count is hidden for now (owner's request, 2026-09-28), as on the
  // PHP site. home_show_students = 1 in site_settings brings it back.
  const showStudentCount = (settings.home_show_students ?? '0') === '1';
  const featured = courses.filter((course) => course.is_featured).slice(0, 3);
  const homeCourses = courses.slice(0, 9);

  const heroTitle = (await settingLocalized('hero_title', '')) || t.t('home.hero_title', { hl: t.t('home.hero_title_hl') });
  const heroSub = (await settingLocalized('hero_subtitle', '')) || t.t('home.hero_sub');

  const helpline = (settings.helpline_number ?? '').trim();
  const helplineLabel = (await settingLocalized('helpline_label', '')) || t.t('common.helpline');
  const helplineNote = await settingLocalized('helpline_note', '');

  const contactPhone = (settings.contact_phone ?? '').trim();
  const contactEmail = (settings.institute_email ?? '').trim();
  const contactAddress = await settingLocalized('institute_address', '');
  const contactWa = whatsappUrl(settings.whatsapp_number ?? '');
  const contactMap = safeUrl(settings.map_url ?? '') || mapSearchUrl(contactAddress);

  const steps = [1, 2, 3, 4].map((n) => ({
    title: t.t(`home.step${n}_title`),
    text: t.t(`home.step${n}_text`),
  }));
  const reasons = [1, 2, 3, 4, 5, 6].map((n) => ({
    title: t.t(`home.why${n}_title`),
    text: t.t(`home.why${n}_text`),
  }));
  const benefits = [1, 2, 3, 4, 5, 6].map((n) => t.t(`home.benefit${n}`));

  return (
    <>
      <SiteHeader active="home" />

      <main id="main">
        {/* ------------------------------------------------------------ hero */}
        <section className="relative overflow-hidden bg-brand-deep text-white">
          <div aria-hidden className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-mid/40 blur-3xl" />
          <div aria-hidden className="absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-brand-yellow/10 blur-3xl" />

          <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-16 lg:grid-cols-2 lg:items-center lg:px-6 lg:py-24">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm">
                <i className="bi bi-stars" aria-hidden />
                {t.t('home.hero_badge')}
              </span>

              <h1 className="mt-5 font-head text-3xl font-semibold leading-tight sm:text-4xl lg:text-5xl">
                {heroTitle}
              </h1>
              <p className="mt-2 text-sm text-white/60">{t.t('home.hero_brand', vars)}</p>
              <p className="mt-5 max-w-xl leading-relaxed text-white/80">{heroSub}</p>

              <div className="mt-8 flex flex-wrap gap-3">
                <ButtonLink href="/apply" variant="accent" size="lg" icon="bi-pencil-square">
                  {t.t('nav.enroll_now')}
                </ButtonLink>
                <ButtonLink
                  href="/courses"
                  variant="secondary"
                  size="lg"
                  className="border-white/30 bg-white/10 text-white hover:bg-white/20"
                >
                  {t.t('home.cta_courses')}
                </ButtonLink>
              </div>

              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/70">
                <li className="flex items-center gap-2">
                  <i className="bi bi-journal-check" aria-hidden />
                  {t.t('home.float_exams')}
                </li>
                <li className="flex items-center gap-2">
                  <i className="bi bi-phone" aria-hidden />
                  {t.t('home.float_pay')}
                </li>
              </ul>

              {/* Course by class: each opens that class's courses, where they can be bought or applied for. */}
              <nav aria-label={t.t('home.class_nav')} className="mt-8 max-w-xl">
                <p className="mb-3 flex items-center gap-2 font-semibold text-brand-yellow">
                  <i className="bi bi-mortarboard-fill" aria-hidden />
                  {t.t('home.class_title')}
                </p>
                <ul className="grid grid-cols-2 gap-2.5 min-[381px]:grid-cols-4">
                  {CLASS_LEVELS.map((level) => (
                    <li key={level.key}>
                      <Link
                        href={`/courses?class=${level.key}`}
                        className="flex min-h-[52px] items-center justify-center rounded-xl border border-brand-yellow/35 bg-white/10 px-1.5 py-2 text-center text-sm font-bold leading-tight text-white transition hover:-translate-y-0.5 hover:border-brand-yellow hover:bg-brand-yellow hover:text-brand-deep focus-visible:bg-brand-yellow focus-visible:text-brand-deep"
                      >
                        {classLabel(level, t.lang)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>

            {heroPromo && (
              <aside className="rounded-orbit border border-white/15 bg-white/10 p-6 backdrop-blur">
                <Badge tone="warning" icon="bi-megaphone-fill">
                  {t.t('home.promos_eyebrow')}
                </Badge>
                <h2 className="mt-3 font-head text-xl font-semibold">{t.pick(heroPromo, 'title')}</h2>
                {t.pick(heroPromo, 'description') !== '' && (
                  <p className="mt-2 text-white/80">{t.pick(heroPromo, 'description')}</p>
                )}
                {safeUrl(heroPromo.button_url) !== '' && (
                  <ButtonLink
                    href={safeUrl(heroPromo.button_url)}
                    variant="accent"
                    className="mt-5"
                  >
                    {t.pick(heroPromo, 'button_text') || t.t('common.learn_more')}
                  </ButtonLink>
                )}
              </aside>
            )}
          </div>
        </section>

        {/* ------------------------------------------- free gift with admission */}
        {gifts.length > 0 && (
          <Section id="free-gift" eyebrow={t.t('gift.badge')} title={t.t('gift.title')} tight>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {gifts.map((gift) => {
                const image = uploadUrl(gift.image);
                return (
                  <li key={gift.id}>
                    <Card className="flex h-full items-center gap-4 p-4">
                      {image !== '' ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={image} alt="" loading="lazy" className="h-16 w-16 rounded-orbit object-cover" />
                      ) : (
                        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-orbit bg-accent-soft text-2xl text-accent-text">
                          <i className="bi bi-gift-fill" aria-hidden />
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-ink-heading">{t.pick(gift, 'title')}</p>
                        {t.pick(gift, 'description') !== '' && (
                          <p className="mt-0.5 text-sm text-ink-muted">{t.pick(gift, 'description')}</p>
                        )}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        {/* ------------------------------------------------------- promotions */}
        {sectionPromos.length > 0 && (
          <Section id="offers" eyebrow={t.t('home.promos_eyebrow')} title={t.t('home.promos_title')} tight>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sectionPromos.map((promo) => {
                const link = safeUrl(promo.button_url);
                return (
                  <li key={promo.id}>
                    <Card className="h-full">
                      <CardBody>
                        <h3 className="font-head font-semibold text-ink-heading">
                          {t.pick(promo, 'title')}
                        </h3>
                        {t.pick(promo, 'description') !== '' && (
                          <p className="mt-2 text-sm text-ink-muted">{t.pick(promo, 'description')}</p>
                        )}
                        {link !== '' && (
                          <Link href={link} className="mt-3 inline-block font-medium text-primary hover:underline">
                            {t.pick(promo, 'button_text') || t.t('common.learn_more')} &rarr;
                          </Link>
                        )}
                      </CardBody>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        {/* ----------------------------------------------------------- courses */}
        <Section
          id="courses"
          alt
          eyebrow={t.t('home.courses_eyebrow')}
          title={t.t('home.courses_title')}
          subtitle={t.t('home.courses_sub')}
        >
          {homeCourses.length === 0 ? (
            <Card>
              <EmptyState icon="bi-journal-x" title={t.t('course.none')} />
            </Card>
          ) : (
            <>
              {featured.length > 0 && (
                <>
                  <h3 className="mb-4 font-head text-lg font-semibold text-ink-heading">
                    {t.t('home.featured_title')}
                  </h3>
                  <div className="mb-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {featured.map((course) => (
                      <CourseCard key={course.id} course={course} t={t} />
                    ))}
                  </div>
                </>
              )}

              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {homeCourses
                  .filter((course) => !featured.some((f) => f.id === course.id))
                  .map((course) => (
                    <CourseCard key={course.id} course={course} t={t} />
                  ))}
              </div>

              <div className="mt-8 text-center">
                <ButtonLink href="/courses" variant="secondary">
                  {t.t('home.view_all_courses')}
                </ButtonLink>
              </div>
            </>
          )}
        </Section>

        {/* ---------------------------------------------------------- branches */}
        {branches.length > 0 && (
          <Section id="branches" eyebrow={t.t('pbr.nav')} title={t.t('pbr.title')} subtitle={t.t('pbr.sub')}>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {branches.map((branch) => (
                <li key={branch.id}>
                  <Link href={`/branches/${branch.slug}`} className="block h-full">
                    <Card className="h-full p-5 transition hover:border-primary/40 hover:shadow-orbit-lg">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-head font-semibold text-ink-heading">
                          {t.pickPair(branch, 'name')}
                        </h3>
                        {branch.is_main && <Badge tone="info">{t.t('branch.main')}</Badge>}
                      </div>
                      {t.pickPair(branch, 'address') !== '' && (
                        <p className="mt-2 text-sm text-ink-muted">{t.pickPair(branch, 'address')}</p>
                      )}
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* ----------------------------------------------------- how to enroll */}
        <Section
          id="how-it-works"
          eyebrow={t.t('home.how_eyebrow')}
          title={t.t('home.how_title')}
          subtitle={t.t('home.how_sub')}
        >
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <li key={step.title}>
                <Card className="h-full p-5">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-soft font-head font-semibold text-primary">
                    {t.digits(index + 1)}
                  </span>
                  <h3 className="mt-4 font-head font-semibold text-ink-heading">{step.title}</h3>
                  <p className="mt-1.5 text-sm text-ink-muted">{step.text}</p>
                </Card>
              </li>
            ))}
          </ol>
        </Section>

        {/* -------------------------------------------------------- why orbit */}
        <Section
          id="why-orbit"
          alt
          eyebrow={t.t('home.why_eyebrow')}
          title={t.t('home.why_title')}
          subtitle={t.t('home.why_sub')}
        >
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {reasons.map((reason, index) => (
              <li key={reason.title}>
                <Card className="h-full p-5">
                  <span className="grid h-10 w-10 place-items-center rounded-orbit bg-primary-soft text-primary">
                    <i className={`bi ${['bi-person-badge', 'bi-people', 'bi-journal-check', 'bi-camera-video', 'bi-calendar-check', 'bi-cash-coin'][index]}`} aria-hidden />
                  </span>
                  <h3 className="mt-4 font-head font-semibold text-ink-heading">{reason.title}</h3>
                  <p className="mt-1.5 text-sm text-ink-muted">{reason.text}</p>
                </Card>
              </li>
            ))}
          </ul>
        </Section>

        {/* ------------------------------------------------- benefits + stats */}
        <Section
          id="benefits"
          eyebrow={t.t('home.benefits_eyebrow')}
          title={t.t('home.benefits_title')}
          subtitle={t.t('home.benefits_sub')}
        >
          <div className="grid gap-8 lg:grid-cols-2">
            <ul className="space-y-3">
              {benefits.map((benefit) => (
                <li key={benefit} className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary-soft text-xs text-primary">
                    <i className="bi bi-check-lg" aria-hidden />
                  </span>
                  <span className="text-ink">{benefit}</span>
                </li>
              ))}
            </ul>

            <div>
              <h3 className="mb-4 font-head text-lg font-semibold text-ink-heading">
                {t.t('home.stats_title')}
              </h3>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <StatCard label={t.t('home.stat_courses')} value={t.digits(stats.courses)} icon="bi-journal-bookmark" />
                {showStudentCount && (
                  <StatCard label={t.t('home.stat_students')} value={t.digits(stats.students)} icon="bi-people" />
                )}
                <StatCard label={t.t('home.stat_batches')} value={t.digits(stats.batches)} icon="bi-collection" />
                <StatCard label={t.t('home.stat_teachers')} value={t.digits(stats.teachers)} icon="bi-person-badge" />
                <StatCard label={t.t('home.stat_results')} value={t.digits(stats.results)} icon="bi-award" />
              </div>
            </div>
          </div>
        </Section>

        {/* --------------------------------------------- director and teachers */}
        {(director || teachers.length > 0) && (
          <Section
            id="team"
            alt
            eyebrow={t.t('home.team_eyebrow')}
            title={t.t('home.team_title')}
            subtitle={t.t('home.team_sub')}
          >
            {director && (
              <Card className="mb-10 overflow-hidden">
                <div className="grid gap-6 p-6 sm:grid-cols-[10rem_1fr]">
                  <div>
                    {uploadUrl(director.photo) !== '' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img loading="lazy" decoding="async"
                        src={uploadUrl(director.photo)}
                        alt={t.t('home.team_photo_alt', { name: director.name })}
                        className="aspect-square w-full rounded-orbit object-cover"
                      />
                    ) : (
                      <div className="grid aspect-square w-full place-items-center rounded-orbit bg-primary-soft text-4xl font-semibold text-primary">
                        {director.name.charAt(0)}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <Badge tone="info">{t.t('home.team_director')}</Badge>
                    <h3 className="mt-2 font-head text-xl font-semibold text-ink-heading">
                      {director.name}
                    </h3>
                    {director.nameAlt !== '' && (
                      <p className="text-sm text-ink-muted">{director.nameAlt}</p>
                    )}
                    {director.designation !== '' && (
                      <p className="mt-1 text-primary">{director.designation}</p>
                    )}

                    <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                      {director.education !== '' && (
                        <Detail label={t.t('home.director_education')} value={director.education} />
                      )}
                      {director.experience !== '' && (
                        <Detail label={t.t('home.director_experience')} value={director.experience} />
                      )}
                    </dl>

                    {director.message !== '' && (
                      <blockquote className="mt-4 border-s-2 border-primary ps-4 italic text-ink-muted">
                        {director.message}
                      </blockquote>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {teachers.length > 0 && (
              <>
                <h3 className="mb-4 font-head text-lg font-semibold text-ink-heading">
                  {t.t('home.team_teachers')}
                </h3>
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {teachers.map((teacher) => {
                    const photo = uploadUrl(teacher.photo);
                    return (
                      <li key={teacher.id}>
                        <Card className="h-full p-5 text-center">
                          {photo !== '' ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={photo}
                              alt=""
                              loading="lazy"
                              className="mx-auto h-20 w-20 rounded-full object-cover"
                            />
                          ) : (
                            <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-primary-soft text-2xl font-semibold text-primary">
                              {t.pick(teacher, 'name').charAt(0)}
                            </span>
                          )}
                          <h4 className="mt-3 font-head font-semibold text-ink-heading">
                            {t.pick(teacher, 'name')}
                          </h4>
                          {t.pick(teacher, 'designation') !== '' && (
                            <p className="mt-0.5 text-sm text-primary">{t.pick(teacher, 'designation')}</p>
                          )}
                          {teacher.subjects.length > 0 && (
                            <p className="mt-2 text-xs text-ink-muted">{teacher.subjects.join(', ')}</p>
                          )}
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </Section>
        )}

        {/* ----------------------------------------------------- achievements */}
        {sections.achievements.length > 0 && (
          <Section
            id="achievements"
            eyebrow={t.t('home.achievements_eyebrow')}
            title={t.t('home.achievements_title')}
            subtitle={t.t('home.achievements_sub')}
          >
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {sections.achievements.map((item) => {
                const image = uploadUrl((item as { image?: string }).image);
                return (
                  <li key={item.id}>
                    <Card className="h-full overflow-hidden">
                      {image !== '' && (
                        <div className="aspect-[4/3] overflow-hidden bg-surface-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={image} alt="" loading="lazy" className="h-full w-full object-cover" />
                        </div>
                      )}
                      <CardBody>
                        <h3 className="font-head font-semibold text-ink-heading">
                          {t.pick(item as object, 'title')}
                        </h3>
                        {t.pick(item as object, 'description') !== '' && (
                          <p className="mt-1.5 text-sm text-ink-muted">
                            {t.pick(item as object, 'description')}
                          </p>
                        )}
                      </CardBody>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        {/* ---------------------------------------------------- trial classes */}
        {sections.trial.length > 0 && (
          <Section
            id="trial"
            alt
            eyebrow={t.t('home.trial_eyebrow')}
            title={t.t('home.trial_title')}
            subtitle={t.t('home.trial_sub')}
          >
            <ul className="grid gap-6 lg:grid-cols-3">
              {sections.trial.map((item) => {
                const video = youtubeId((item as { video_url?: string | null }).video_url);
                return (
                  <li key={item.id}>
                    <Card className="h-full overflow-hidden">
                      {video !== '' && (
                        <div className="aspect-video bg-black">
                          {/* youtube-nocookie: no tracking cookie is set unless
                              the visitor actually plays the video. */}
                          <iframe
                            src={`https://www.youtube-nocookie.com/embed/${video}`}
                            title={t.pick(item as object, 'title') || t.t('home.trial_play')}
                            loading="lazy"
                            allowFullScreen
                            className="h-full w-full border-0"
                          />
                        </div>
                      )}
                      <CardBody>
                        <h3 className="font-head font-semibold text-ink-heading">
                          {t.pick(item as object, 'title')}
                        </h3>
                        <p className="mt-1 text-sm text-ink-muted">
                          {[
                            (item as { course_name?: string }).course_name,
                            (item as { teacher_name?: string }).teacher_name,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </CardBody>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        {/* ----------------------------------------------------------- gallery */}
        {sections.gallery.length > 0 && (
          <Section
            id="gallery"
            eyebrow={t.t('home.gallery_eyebrow')}
            title={t.t('home.gallery_title')}
            subtitle={t.t('home.gallery_sub')}
          >
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {sections.gallery.slice(0, 12).map((photo) => {
                const src = uploadUrl(photo.image);
                return (
                  <li key={photo.id}>
                    <Link href="/gallery" className="block overflow-hidden rounded-orbit bg-surface-3">
                      <div className="aspect-square">
                        {src !== '' && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={src}
                            alt={photo.title}
                            loading="lazy"
                            className="h-full w-full object-cover transition hover:scale-105"
                          />
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="mt-6 text-center">
              <ButtonLink href="/gallery" variant="secondary">
                {t.t('home.gallery_all')}
              </ButtonLink>
            </div>
          </Section>
        )}

        {/* ------------------------------------------------------ testimonials */}
        <Section
          id="feedback"
          alt
          eyebrow={t.t('home.testimonials_eyebrow')}
          title={t.t('home.testimonials_title')}
          subtitle={t.t('home.testimonials_sub')}
        >
          {sections.feedbacks.length === 0 ? (
            <Card>
              <EmptyState icon="bi-chat-quote" title={t.t('home.testimonials_empty')} />
            </Card>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sections.feedbacks.map((review) => (
                <li key={review.id}>
                  <Card className="h-full p-5">
                    <div
                      className="flex gap-0.5 text-accent"
                      aria-label={t.t('home.stars', { n: t.digits(review.rating ?? 5) })}
                    >
                      {Array.from({ length: 5 }).map((_, index) => (
                        <i
                          key={index}
                          className={`bi ${index < (review.rating ?? 5) ? 'bi-star-fill' : 'bi-star'}`}
                          aria-hidden
                        />
                      ))}
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-ink">{review.feedback}</p>
                    <p className="mt-4 text-sm font-medium text-ink-heading">{review.name}</p>
                    {review.course_name && (
                      <p className="text-xs text-ink-muted">{review.course_name}</p>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-8 text-center">
            <ButtonLink href="/feedback" variant="secondary" icon="bi-pencil">
              {t.t('home.feedback_form_title')}
            </ButtonLink>
          </div>
        </Section>

        {/* ---------------------------------------------------------- helpline */}
        {helpline !== '' && (
          <section id="helpline" className="bg-primary text-white">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-4 py-10 lg:px-6">
              <div>
                <h2 className="font-head text-xl font-semibold">{t.t('home.helpline_title')}</h2>
                {helplineNote !== '' && <p className="mt-1 text-white/85">{helplineNote}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={telHref(helpline)}
                  className="inline-flex items-center gap-2 rounded-orbit bg-white px-5 py-2.5 font-head text-lg font-semibold text-primary transition hover:bg-white/90"
                >
                  <i className="bi bi-telephone-fill" aria-hidden />
                  <span>
                    <span className="block text-xs font-normal text-primary/70">{helplineLabel}</span>
                    {formatPhone(helpline)}
                  </span>
                </a>
                <ButtonLink
                  href="/apply"
                  variant="secondary"
                  className="border-white/40 bg-white/10 text-white hover:bg-white/20"
                >
                  {t.t('home.helpline_apply')}
                </ButtonLink>
              </div>
            </div>
          </section>
        )}

        {/* ----------------------------------------------------------- contact */}
        <Section
          id="contact"
          eyebrow={t.t('home.contact_eyebrow')}
          title={t.t('home.contact_title')}
          subtitle={t.t('home.contact_sub')}
        >
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {contactPhone !== '' && (
              <ContactCard icon="bi-telephone-fill" label={t.t('home.contact_phone')} value={formatPhone(contactPhone)} href={telHref(contactPhone)} />
            )}
            {contactEmail !== '' && (
              <ContactCard icon="bi-envelope-fill" label={t.t('home.contact_email')} value={contactEmail} href={`mailto:${contactEmail}`} />
            )}
            {contactWa !== '' && (
              <ContactCard icon="bi-whatsapp" label={t.t('home.contact_whatsapp')} value={t.t('footer.chat_whatsapp')} href={contactWa} external />
            )}
            {contactAddress !== '' && (
              <ContactCard icon="bi-geo-alt-fill" label={t.t('home.contact_address')} value={contactAddress} href={contactMap} external />
            )}
          </ul>
        </Section>

        {/* --------------------------------------------------------- developer */}
        {developer && (
          <Section id="developer" alt eyebrow={t.t('home.dev_eyebrow')} title={t.t('home.dev_title')} tight>
            <Card className="mx-auto flex max-w-xl flex-wrap items-center gap-4 p-5">
              {uploadUrl(developer.photo) !== '' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img loading="lazy" decoding="async" src={uploadUrl(developer.photo)} alt="" className="h-16 w-16 rounded-full object-cover" />
              ) : (
                <span className="grid h-16 w-16 place-items-center rounded-full bg-primary-soft text-xl font-semibold text-primary">
                  {developer.name.charAt(0)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-head font-semibold text-ink-heading">{developer.name}</p>
                {developer.title !== '' && <p className="text-sm text-ink-muted">{developer.title}</p>}
                {developer.note !== '' && <p className="mt-1 text-sm text-ink-muted">{developer.note}</p>}
              </div>
              <div className="flex gap-2">
                {developer.email !== '' && (
                  <a href={`mailto:${developer.email}`} aria-label="Email" className="grid h-9 w-9 place-items-center rounded-full bg-surface-3 text-ink-muted transition hover:text-primary">
                    <i className="bi bi-envelope-fill" aria-hidden />
                  </a>
                )}
                {safeUrl(developer.website) !== '' && (
                  <a href={safeUrl(developer.website)} target="_blank" rel="noopener noreferrer" aria-label="Website" className="grid h-9 w-9 place-items-center rounded-full bg-surface-3 text-ink-muted transition hover:text-primary">
                    <i className="bi bi-globe2" aria-hidden />
                  </a>
                )}
                {safeUrl(developer.facebook) !== '' && (
                  <a href={safeUrl(developer.facebook)} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="grid h-9 w-9 place-items-center rounded-full bg-surface-3 text-ink-muted transition hover:text-primary">
                    <i className="bi bi-facebook" aria-hidden />
                  </a>
                )}
              </div>
            </Card>
          </Section>
        )}

        {/* --------------------------------------------------------------- cta */}
        <section className="bg-brand-deep text-white">
          <div className="mx-auto max-w-3xl px-4 py-16 text-center lg:px-6">
            <h2 className="font-head text-2xl font-semibold sm:text-3xl">{t.t('home.cta_title')}</h2>
            <p className="mt-2 text-white/75">{t.t('home.cta_sub')}</p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <ButtonLink href="/apply" variant="accent" size="lg" icon="bi-pencil-square">
                {t.t('nav.enroll_now')}
              </ButtonLink>
              <ButtonLink
                href="/courses"
                variant="secondary"
                size="lg"
                className="border-white/30 bg-white/10 text-white hover:bg-white/20"
              >
                {t.t('home.cta_courses')}
              </ButtonLink>
            </div>
            <p className="mt-6 text-sm text-white/60">{siteName}</p>
          </div>
        </section>
      </main>
    </>
  );
}

function Section({
  id,
  eyebrow,
  title,
  subtitle,
  alt,
  tight,
  children,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  alt?: boolean;
  tight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={alt ? 'bg-page-alt' : 'bg-page'}>
      <div className={`mx-auto max-w-7xl px-4 lg:px-6 ${tight ? 'py-10' : 'py-14 lg:py-20'}`}>
        <div className="mb-8 max-w-2xl">
          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>
          )}
          <h2 className="mt-1.5 font-head text-2xl font-semibold text-ink-heading sm:text-3xl">
            {title}
          </h2>
          {subtitle && <p className="mt-2 text-ink-muted">{subtitle}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{value}</dd>
    </div>
  );
}

function ContactCard({
  icon,
  label,
  value,
  href,
  external,
}: {
  icon: string;
  label: string;
  value: string;
  href: string;
  external?: boolean;
}) {
  const body = (
    <Card className="h-full p-5 transition hover:border-primary/40">
      <span className="grid h-10 w-10 place-items-center rounded-orbit bg-primary-soft text-primary">
        <i className={`bi ${icon}`} aria-hidden />
      </span>
      <p className="mt-3 text-xs uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-0.5 break-words font-medium text-ink">{value}</p>
    </Card>
  );

  if (href === '') return <li>{body}</li>;

  return (
    <li>
      {external ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="block h-full">
          {body}
        </a>
      ) : (
        <a href={href} className="block h-full">
          {body}
        </a>
      )}
    </li>
  );
}
