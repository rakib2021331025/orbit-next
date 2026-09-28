import type { Metadata } from 'next';
import { StudentPage } from '@/components/portal/StudentPage';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { getLang, translate } from '@/lib/i18n';
import { studentScope } from '@/lib/student/scope';
import { studentNotices, studentNotifications } from '@/lib/student/data';
import { markNotificationsRead } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'student.notices.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * Notices and the student's own notifications, from student/notices.php.
 *
 * Two different things on one page, and deliberately not merged: a notice is
 * addressed to a batch, a notification to this student. Opening the page marks
 * the notifications read, which is what clears the badge in the sidebar.
 */
export default async function StudentNoticesPage() {
  return (
    <StudentPage
      active="notices"
      title={(t) => t.t('student.notices.title')}
      subtitle={(t) => t.t('student.notices.sub')}
    >
      {async ({ student, t }) => {
        const scope = await studentScope(student);
        const [notices, notifications] = await Promise.all([
          studentNotices(scope, 50),
          studentNotifications(student.id, 30),
        ]);

        // Reading the page is what marks them read.
        await markNotificationsRead();

        const newSince = new Date(Date.now() - 7 * 86_400_000);

        return (
          <div className="space-y-8">
            {notifications.length > 0 && (
              <section>
                <h2 className="mb-3 font-head text-lg font-semibold text-ink-heading">
                  {t.t('student.notifications')}
                </h2>
                <ul className="space-y-3">
                  {notifications.map((row) => (
                    <li key={row.id}>
                      <Card className={row.is_read ? undefined : 'border-primary/40'}>
                        <CardBody className="flex items-start gap-3">
                          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                            <i className={`bi bi-${row.icon ?? 'bell'}`} aria-hidden />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-ink">{row.title}</p>
                            {row.message && (
                              <p className="mt-0.5 text-sm text-ink-muted">{row.message}</p>
                            )}
                            <p className="mt-1 text-xs text-ink-muted">
                              {t.date(row.created_at, 'd M Y, h:i A')}
                            </p>
                          </div>
                          {!row.is_read && <Badge tone="info">{t.t('notice.new')}</Badge>}
                        </CardBody>
                      </Card>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h2 className="mb-3 font-head text-lg font-semibold text-ink-heading">
                {t.t('student.notices.title')}
              </h2>
              {notices.length === 0 ? (
                <Card>
                  <EmptyState
                    icon="bi-megaphone"
                    title={t.t('notice.none_title')}
                    body={t.t('student.notices.none')}
                  />
                </Card>
              ) : (
                <ul className="space-y-3">
                  {notices.map((notice) => (
                    <li key={notice.id}>
                      <Card>
                        <CardBody>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                            <time dateTime={notice.created_at.toISOString()}>
                              {t.date(notice.created_at, 'd M Y')}
                            </time>
                            {notice.created_at >= newSince && (
                              <Badge tone="success">{t.t('notice.new')}</Badge>
                            )}
                          </div>
                          <h3 className="mt-2 font-head font-semibold text-ink-heading">
                            {notice.title}
                          </h3>
                          {/* Admin-authored plain text, rendered as text. */}
                          <p className="mt-1.5 whitespace-pre-line text-ink">{notice.description}</p>
                        </CardBody>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        );
      }}
    </StudentPage>
  );
}
