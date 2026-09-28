import type { Metadata } from 'next';
import Link from 'next/link';
import { GuardianPage } from '@/components/portal/GuardianPage';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { Pagination } from '@/components/ui/Pagination';
import { getLang, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { paginate, pageHref } from '@/lib/paginate';
import { studentScope } from '@/lib/student/scope';
import { notificationIcon } from '@/lib/notifications/link';
import { cn } from '@/lib/cn';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'guardian.notices.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * Notices for a child, from guardian/notices.php.
 *
 *   ?tab=board  the notice board the selected child sees — shared notices plus
 *               those of the child's own branches
 *   ?tab=child  the child's own notifications (results, approvals…)
 *
 * The second tab is READ-ONLY: a parent reading a notification here must not
 * mark it read for the child, or the child's badge would clear for messages
 * they never saw.
 */
export default async function GuardianNoticesPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string; tab?: string; page?: string }>;
}) {
  const params = await searchParams;
  const tab = params.tab === 'child' ? 'child' : 'board';

  return (
    <GuardianPage
      active="notices"
      needsChild
      searchParams={params}
      title={(t) => t.t('guardian.notices.title')}
      subtitle={(t, child) => (child ? t.t('guardian.notices.sub', { name: t.pick(child, 'name') }) : '')}
    >
      {async ({ child, t }) => {
        if (!child) return null;

        const base = { student: String(child.id), tab: tab === 'child' ? 'child' : undefined };
        const tabs = [
          { key: 'board', icon: 'bi-megaphone', label: t.t('guardian.notices.tab_board'), href: `/guardian/notices?student=${child.id}` },
          { key: 'child', icon: 'bi-bell', label: t.t('guardian.notices.tab_child'), href: `/guardian/notices?student=${child.id}&tab=child` },
        ];

        let body: React.ReactNode;
        let pager = paginate(0, 10, 1);

        if (tab === 'board') {
          const scope = await studentScope(child);
          const where = {
            status: 'active',
            ...(scope.branchIds.length > 0
              ? { OR: [{ branch_id: null }, { branch_id: { in: scope.branchIds } }] }
              : {}),
          } as const;
          const total = await prisma.notice.count({ where }).catch(() => 0);
          pager = paginate(total, 10, params.page);
          const notices = await prisma.notice
            .findMany({
              where,
              orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
              skip: pager.offset,
              take: pager.perPage,
              select: { id: true, title: true, description: true, created_at: true },
            })
            .catch(() => []);

          body =
            notices.length === 0 ? (
              <EmptyState icon="bi-megaphone" title={t.t('guardian.notices.tab_board')} body={t.t('guardian.notices.none')} />
            ) : (
              <ul className="divide-y divide-line-soft">
                {notices.map((notice) => (
                  <li key={notice.id} id={`notice-${notice.id}`} className="flex gap-3 px-5 py-4">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                      <i className="bi bi-megaphone-fill" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="font-head font-semibold text-ink-heading">{notice.title}</h2>
                      <p className="mb-2 text-xs text-ink-muted">
                        <i className="bi bi-calendar3 me-1" aria-hidden />
                        {t.date(notice.created_at, 'd F Y')}
                      </p>
                      {/* Admin-authored plain text, rendered as text. */}
                      <p className="whitespace-pre-line break-words text-ink">{notice.description}</p>
                    </div>
                  </li>
                ))}
              </ul>
            );
        } else {
          const where = { user_type: 'student', user_id: child.id } as const;
          const total = await prisma.notification.count({ where }).catch(() => 0);
          pager = paginate(total, 15, params.page);
          const items = await prisma.notification
            .findMany({
              where,
              orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
              skip: pager.offset,
              take: pager.perPage,
              select: { id: true, title: true, message: true, icon: true, created_at: true },
            })
            .catch(() => []);

          body =
            items.length === 0 ? (
              <EmptyState icon="bi-bell-slash" title={t.t('guardian.notices.tab_child')} body={t.t('guardian.notices.none_child')} />
            ) : (
              <ul className="divide-y divide-line-soft">
                {items.map((item) => (
                  <li key={item.id} className="flex gap-3 px-5 py-4">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                      <i className={`bi ${notificationIcon(item.icon)}`} aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="font-head font-semibold text-ink-heading">{item.title}</h2>
                      {(item.message ?? '').trim() !== '' && (
                        <p className="mb-1 whitespace-pre-line break-words text-ink">{item.message}</p>
                      )}
                      <p className="text-xs text-ink-muted">{t.date(item.created_at, 'd M Y, h:i A')}</p>
                    </div>
                  </li>
                ))}
              </ul>
            );
        }

        return (
          <div className="space-y-4">
            <nav className="flex flex-wrap gap-2">
              {tabs.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={tab === item.key ? 'page' : undefined}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-orbit px-3 py-1.5 text-sm font-medium transition',
                    tab === item.key ? 'bg-primary text-white' : 'border border-line text-ink hover:bg-surface-2'
                  )}
                >
                  <i className={`bi ${item.icon}`} aria-hidden />
                  {item.label}
                </Link>
              ))}
            </nav>

            <Card>{body}</Card>

            <Pagination
              page={pager.page}
              totalPages={pager.totalPages}
              hrefFor={(page) => pageHref('/guardian/notices', base, page)}
              labels={{
                previous: t.t('common.previous'),
                next: t.t('common.next'),
                pageOf: t.t('gallery.page_of'),
              }}
              format={(value) => t.digits(value)}
            />
          </div>
        );
      }}
    </GuardianPage>
  );
}
