import type { Metadata } from 'next';
import { StudentPage } from '@/components/portal/StudentPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { getLang, translate } from '@/lib/i18n';
import { studentScope } from '@/lib/student/scope';
import { studentLiveClasses, startsAt, endsAt } from '@/lib/student/data';
import { prisma } from '@/lib/db/prisma';
import { uploadUrl } from '@/lib/storage/url';
import { safeUrl } from '@/lib/site/url';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'lcl.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * Live classes for the student, from student/live_classes.php.
 *
 * The join button appears **ten minutes before the start** and stays until the
 * class ends. Showing it earlier puts students in an empty room; hiding it at the
 * exact start time locks out anyone running late.
 *
 * `meet_url` is only ever rendered for a signed-in student whose scope matches the
 * class. That is why the public online-classes page shows the timetable but never
 * the link.
 */
export default async function StudentLiveClassesPage() {
  return (
    <StudentPage
      active="live"
      title={(t) => t.t('lcl.title')}
      subtitle={(t) => t.t('student.live.sub')}
    >
      {async ({ student, t }) => {
        const scope = await studentScope(student);
        const all = await studentLiveClasses(scope, false, 100);

        const now = Date.now();
        const upcoming = all
          .filter(
            (row) =>
              row.status === 'scheduled' &&
              endsAt(row.class_date, row.start_time, row.duration_minutes) >= now
          )
          .sort(
            (a, b) =>
              startsAt(a.class_date, a.start_time) - startsAt(b.class_date, b.start_time)
          );

        const finished = all
          .filter(
            (row) =>
              row.status === 'completed' ||
              (row.status === 'scheduled' &&
                endsAt(row.class_date, row.start_time, row.duration_minutes) < now)
          )
          .slice(0, 20);

        const cancelled = all.filter((row) => row.status === 'cancelled').slice(0, 10);

        // Materials for the classes on screen, in one query rather than per class.
        const ids = [...upcoming, ...finished].map((row) => row.id);
        let materials: { id: number; live_class_id: number; title: string; file_path: string }[] = [];
        if (ids.length > 0) {
          try {
            materials = await prisma.liveClassMaterial.findMany({
              where: { live_class_id: { in: ids } },
              orderBy: { id: 'asc' },
              select: { id: true, live_class_id: true, title: true, file_path: true },
            });
          } catch {
            materials = [];
          }
        }

        const materialsFor = (classId: number) =>
          materials.filter((row) => row.live_class_id === classId);

        const Row = ({ row, joinable }: { row: (typeof all)[number]; joinable: boolean }) => {
          const starts = startsAt(row.class_date, row.start_time);
          const ends = endsAt(row.class_date, row.start_time, row.duration_minutes);
          const live = now >= starts && now < ends;
          const files = materialsFor(row.id);
          const link = safeUrl(row.meet_url);

          return (
            <li className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-head font-semibold text-ink-heading">{row.subject}</h3>
                    {live ? (
                      <Badge tone="danger" icon="bi-broadcast">
                        {t.t('student.live.happening_now')}
                      </Badge>
                    ) : row.status === 'cancelled' ? (
                      <Badge tone="neutral">{t.t('student.live.state_cancelled')}</Badge>
                    ) : now >= ends ? (
                      <Badge tone="neutral">{t.t('student.live.state_finished')}</Badge>
                    ) : (
                      <Badge tone="info">{t.t('student.live.state_upcoming')}</Badge>
                    )}
                  </div>

                  {row.topic && <p className="mt-1 text-sm text-ink">{row.topic}</p>}

                  <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
                    <span>
                      {t.date(row.class_date, 'd M Y')} · {t.date(row.start_time, 'h:i A')}
                    </span>
                    <span>{t.t('student.live.duration', { count: t.digits(row.duration_minutes) })}</span>
                    {row.teacher_name && <span>{row.teacher_name}</span>}
                    {(row.course || row.batch) && (
                      <span>
                        {t.t('student.live.for', {
                          names: [row.course, row.batch].filter(Boolean).join(' · '),
                        })}
                      </span>
                    )}
                  </p>

                  {row.description && (
                    <p className="mt-2 whitespace-pre-line text-sm text-ink-muted">
                      {row.description}
                    </p>
                  )}

                  {files.length > 0 && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm font-medium text-primary">
                        {t.t('student.live.materials', { count: t.digits(files.length) })}
                      </summary>
                      <ul className="mt-2 space-y-1.5">
                        {files.map((file) => {
                          const href = uploadUrl(file.file_path);
                          return (
                            <li key={file.id} className="flex items-center gap-2 text-sm">
                              <i className="bi bi-file-earmark text-ink-muted" aria-hidden />
                              {href !== '' ? (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-ink hover:text-primary hover:underline"
                                >
                                  {file.title}
                                </a>
                              ) : (
                                <span className="text-ink">{file.title}</span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  )}
                </div>

                {joinable && row.status === 'scheduled' && now < ends && (
                  <div className="shrink-0">
                    {link !== '' ? (
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                      >
                        <i className="bi bi-camera-video-fill" aria-hidden />
                        {live ? t.t('student.live.join_now') : t.t('student.live.join')}
                      </a>
                    ) : (
                      <span className="text-xs text-ink-muted">{t.t('student.live.link_soon')}</span>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        };

        return (
          <div className="space-y-6">
            <Card>
              <CardHeader title={t.t('student.live.tab_upcoming')} icon="bi-camera-video" />
              {upcoming.length === 0 ? (
                <EmptyState
                  icon="bi-camera-video-off"
                  title={t.t('student.live.empty_upcoming_title')}
                  body={t.t('student.live.empty_upcoming')}
                />
              ) : (
                <ul className="divide-y divide-line-soft">
                  {upcoming.map((row) => (
                    <Row
                      key={row.id}
                      row={row}
                      // Ten minutes before the start, and until it ends.
                      joinable={now >= startsAt(row.class_date, row.start_time) - 10 * 60_000}
                    />
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader title={t.t('student.live.tab_completed')} icon="bi-check2-circle" />
              {finished.length === 0 ? (
                <EmptyState
                  icon="bi-clock-history"
                  title={t.t('student.live.empty_completed_title')}
                  body={t.t('student.live.empty_completed')}
                />
              ) : (
                <ul className="divide-y divide-line-soft">
                  {finished.map((row) => (
                    <Row key={row.id} row={row} joinable={false} />
                  ))}
                </ul>
              )}
            </Card>

            {cancelled.length > 0 && (
              <Card>
                <CardHeader title={t.t('student.live.cancelled_title')} icon="bi-x-circle" />
                <ul className="divide-y divide-line-soft">
                  {cancelled.map((row) => (
                    <Row key={row.id} row={row} joinable={false} />
                  ))}
                </ul>
              </Card>
            )}
          </div>
        );
      }}
    </StudentPage>
  );
}
