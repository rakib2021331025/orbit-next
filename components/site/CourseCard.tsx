import Link from 'next/link';
import { Badge } from '@/components/ui/Feedback';
import { uploadUrl } from '@/lib/storage/url';
import type { Translator } from '@/lib/i18n';
import { courseSummary, type PublicCourse } from '@/lib/site/courses';

/**
 * One course on the home page, the course list and a branch page.
 *
 * The fee is rendered through `money()` so it comes out as ৳ with Bangla digits
 * on a Bangla page. Printing `{course.fee}` directly would show `3000` on a page
 * where every other number reads ৩,০০০.
 */
export function CourseCard({ course, t }: { course: PublicCourse; t: Translator }) {
  const title = t.pick(course, 'name');
  const summary = courseSummary(course, t.pick);
  const image = uploadUrl(course.image);
  const duration = t.pick(course, 'duration');
  const closed = course.enrollment_status !== 'open';

  return (
    <article className="group flex flex-col overflow-hidden rounded-orbit border border-line-soft bg-surface shadow-orbit transition hover:shadow-orbit-lg">
      <Link href={`/courses/${course.id}`} className="block">
        <div className="relative aspect-[16/9] overflow-hidden bg-surface-3">
          {image !== '' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="grid h-full place-items-center text-3xl text-ink-muted/40">
              <i className="bi bi-journal-bookmark" aria-hidden />
            </div>
          )}

          {course.is_featured && (
            <span className="absolute start-3 top-3">
              <Badge tone="warning" icon="bi-star-fill">
                {t.t('course.featured')}
              </Badge>
            </span>
          )}
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap gap-1.5">
          {course.hasOnline && <Badge tone="info" icon="bi-camera-video">{t.t('course.type_online')}</Badge>}
          {course.hasOffline && <Badge tone="neutral" icon="bi-building">{t.t('course.type_offline')}</Badge>}
          {closed && <Badge tone="danger">{t.t('course.coming_soon')}</Badge>}
        </div>

        <h3 className="mt-3 font-head text-lg font-semibold text-ink-heading">
          <Link href={`/courses/${course.id}`} className="transition hover:text-primary">
            {title}
          </Link>
        </h3>

        {summary !== '' && <p className="mt-2 flex-1 text-sm text-ink-muted">{summary}</p>}

        <dl className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
          {course.fee !== null && (
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">{t.t('course.fee')}</dt>
              <i className="bi bi-cash-coin text-ink-muted" aria-hidden />
              <dd className="font-semibold text-primary">{t.money(Number(course.fee))}</dd>
            </div>
          )}
          {duration !== '' && (
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">{t.t('course.duration')}</dt>
              <i className="bi bi-clock text-ink-muted" aria-hidden />
              <dd className="text-ink-muted">{duration}</dd>
            </div>
          )}
          {course.batches.length > 0 && (
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">{t.t('course.batch')}</dt>
              <i className="bi bi-collection text-ink-muted" aria-hidden />
              <dd className="text-ink-muted">
                {t.t('course.batches_count', { n: t.digits(course.batches.length) })}
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-5 flex gap-2">
          <Link
            href={`/courses/${course.id}`}
            className="inline-flex flex-1 items-center justify-center rounded-orbit border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
          >
            {t.t('common.details')}
          </Link>
          {!closed && (
            <Link
              href={`/apply?course=${course.id}`}
              className="inline-flex flex-1 items-center justify-center rounded-orbit bg-primary px-3 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
            >
              {t.t('nav.enroll_now')}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
