import type { Metadata } from 'next';
import Link from 'next/link';
import { StudentPage } from '@/components/portal/StudentPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { SearchBox } from '@/components/site/SearchBox';
import { getLang, translate } from '@/lib/i18n';
import { studentScope } from '@/lib/student/scope';
import { studentRecordings } from '@/lib/student/data';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'rec.student_title'),
    robots: { index: false, follow: false },
  };
}

/** "1 hour 20 minutes", from the rec.dur_* keys. */
function duration(
  minutes: number | null,
  t: (key: string, vars?: Record<string, string | number>) => string,
  digits: (value: string | number) => string
): string {
  if (!minutes || minutes <= 0) return '';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours > 0 && rest > 0) return t('rec.dur_hm', { h: digits(hours), m: digits(rest) });
  if (hours > 0) return t('rec.dur_h', { h: digits(hours) });
  return t('rec.dur_m', { m: digits(rest) });
}

/**
 * Recorded classes for the student, from student/recordings.php.
 *
 * Only PUBLISHED recordings in the student's own scope. The video itself lives in
 * Google Drive and is played on the watch page; this list never embeds it, so
 * twenty recordings do not mean twenty iframes.
 */
export default async function StudentRecordingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const query = (params.q ?? '').trim().toLowerCase().slice(0, 100);

  return (
    <StudentPage
      active="recordings"
      title={(t) => t.t('rec.student_title')}
      subtitle={(t) => t.t('rec.student_sub')}
    >
      {async ({ student, t }) => {
        const scope = await studentScope(student);
        const all = await studentRecordings(scope, 200);

        // Filtered in memory: the list is capped at 200 and the student is
        // searching their own small set, so a second query buys nothing.
        const recordings =
          query === ''
            ? all
            : all.filter((row) =>
                [row.title, row.subject, row.description]
                  .filter(Boolean)
                  .some((value) => String(value).toLowerCase().includes(query))
              );

        return (
          <div className="space-y-6">
            <SearchBox
              action="/student/recordings"
              name="q"
              defaultValue={query}
              label={t.t('rec.search')}
              placeholder={t.t('rec.search_ph_student')}
            />

            {recordings.length === 0 ? (
              <Card>
                <EmptyState
                  icon="bi-collection-play"
                  title={t.t('rec.student_title')}
                  body={query !== '' ? t.t('rec.none_search') : t.t('rec.none_student')}
                />
              </Card>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {recordings.map((row) => (
                  <li key={row.id}>
                    <Card className="flex h-full flex-col">
                      <CardHeader
                        title={row.title}
                        subtitle={row.subject ?? undefined}
                        icon="bi-play-btn"
                      />
                      <CardBody className="flex flex-1 flex-col">
                        {row.description && (
                          <p className="line-clamp-3 text-sm text-ink-muted">{row.description}</p>
                        )}

                        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                          {row.class_date && <span>{t.date(row.class_date, 'd M Y')}</span>}
                          {duration(row.duration_minutes, t.t, t.digits) !== '' && (
                            <span>{duration(row.duration_minutes, t.t, t.digits)}</span>
                          )}
                          <span>{row.teacher_name ?? t.t('rec.no_teacher')}</span>
                        </p>

                        <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                          {(row.course || row.batch) && (
                            <Badge tone="neutral">
                              {[row.course, row.batch].filter(Boolean).join(' · ')}
                            </Badge>
                          )}
                          <Link
                            href={`/student/recordings/${row.id}`}
                            className="ms-auto inline-flex items-center gap-1.5 rounded-orbit bg-primary px-3 py-1.5 text-sm font-medium text-white transition hover:bg-primary-hover"
                          >
                            <i className="bi bi-play-fill" aria-hidden />
                            {t.t('rec.watch')}
                          </Link>
                        </div>
                      </CardBody>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      }}
    </StudentPage>
  );
}
