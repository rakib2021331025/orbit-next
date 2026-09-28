import type { Metadata } from 'next';
import { TeacherPage } from '@/components/portal/TeacherPage';
import { Card, CardFooter } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { getLang, translate } from '@/lib/i18n';
import { recentNotifications, unreadCount } from '@/lib/notifications/counts';
import { readCount } from '@/lib/notifications/manage';
import { notificationLink, notificationIcon } from '@/lib/notifications/link';
import { HeaderActions, RowActions } from './Controls';

export const dynamic = 'force-dynamic';

const LIMIT = 50;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'tch.nav.notifications'),
    robots: { index: false, follow: false },
  };
}

/**
 * The teacher's notification centre, from teacher/notifications.php.
 *
 * The fifty most recent, newest first, with the unread ones marked. Every action
 * is scoped to the signed-in teacher inside the library, so nothing on this page
 * can reach another teacher's rows.
 */
export default async function TeacherNotificationsPage() {
  return (
    <TeacherPage active="notifications" title={(t) => t.t('tch.nav.notifications')}>
      {async ({ teacher, t }) => {
        const [rows, unread, read] = await Promise.all([
          recentNotifications('teacher', teacher.id, LIMIT),
          unreadCount('teacher', teacher.id),
          readCount('teacher', teacher.id),
        ]);

        return (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ink-muted">
                {t.t('tch.notif.unread', { count: t.digits(unread) })}
              </p>
              <HeaderActions
                unread={unread}
                readCount={read}
                labels={{
                  markAll: t.t('tch.notif.mark_all'),
                  clearRead: t.t('tch.notif.clear_read'),
                  confirmClear: t.t('tch.notif.clear_confirm'),
                  dismiss: t.t('common.cancel'),
                }}
              />
            </div>

            <Card>
              {rows.length === 0 ? (
                <EmptyState
                  icon="bi-bell-slash"
                  title={t.t('tch.notif.empty_title')}
                  body={t.t('tch.notif.empty')}
                />
              ) : (
                <>
                  <ul className="divide-y divide-line-soft">
                    {rows.map((row) => {
                      const target = notificationLink(row.link, 'teacher');

                      return (
                        <li
                          key={row.id}
                          className={`flex gap-3 px-5 py-4 ${row.is_read ? '' : 'bg-primary/5'}`}
                        >
                          <i
                            className={`bi ${notificationIcon(row.icon)} mt-0.5 text-lg text-ink-muted`}
                            aria-hidden
                          />

                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-ink-heading">{row.title}</span>
                              {!row.is_read && <Badge tone="info">{t.t('tch.notif.new')}</Badge>}
                            </p>

                            {row.message && row.message.trim() !== '' && (
                              <p className="mt-0.5 whitespace-pre-line text-sm text-ink">
                                {row.message}
                              </p>
                            )}

                            <p className="mt-1 text-xs text-ink-muted">
                              {t.date(row.created_at, 'd M Y, h:i A')}
                            </p>

                            <RowActions
                              notificationId={row.id}
                              href={target?.href ?? null}
                              external={target?.external ?? false}
                              unread={!row.is_read}
                              labels={{
                                open: t.t('tch.notif.open'),
                                markRead: t.t('tch.notif.mark_read'),
                              }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  {rows.length >= LIMIT && (
                    <CardFooter className="text-xs text-ink-muted">
                      {t.t('tch.notif.latest', { count: t.digits(LIMIT) })}
                    </CardFooter>
                  )}
                </>
              )}
            </Card>
          </div>
        );
      }}
    </TeacherPage>
  );
}
