import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { getLang, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { branchWhere } from '@/lib/auth/guards';
import { activeBranchId, branchesEnabled } from '@/lib/branch/active';
import { branchList } from '@/lib/branch/stats';
import { paginate, pageHref } from '@/lib/paginate';
import { NoticeForm, NoticeRowActions } from './NoticeForms';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'anotice.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * Notices, from admin/notice_management.php.
 *
 * Only active notices reach the public board and the student portal, so the
 * status filter is the main thing this list is for: "what is on the board right
 * now" versus "what have we posted at all".
 *
 * The branch in focus sees its own notices **plus the shared ones**, because a
 * shared notice really is on that branch's board too.
 */
export default async function AdminNoticesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; edit?: string; page?: string }>;
}) {
  const params = await searchParams;

  return (
    <AdminPage active="notices" route="/admin/notices" title="">
      {async ({ t }) => {
        const filter = params.status === 'active' || params.status === 'inactive' ? params.status : '';
        const branchScope = await branchWhere();

        const where = {
          ...branchScope,
          ...(filter === 'active' ? { status: 'active' as const } : {}),
          ...(filter === 'inactive' ? { NOT: { status: 'active' as const } } : {}),
        };

        const [total, active, multiBranch, focus] = await Promise.all([
          prisma.notice.count({ where: branchScope }).catch(() => 0),
          prisma.notice.count({ where: { ...branchScope, status: 'active' } }).catch(() => 0),
          branchesEnabled(),
          activeBranchId(),
        ]);

        const counts = { '': total, active, inactive: total - active };
        const pager = paginate(counts[filter], 25, Number(params.page ?? 1));

        const [notices, branches] = await Promise.all([
          prisma.notice
            .findMany({
              where,
              orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
              take: pager.perPage,
              skip: pager.offset,
            })
            .catch(() => []),
          multiBranch ? branchList() : [],
        ]);

        const editId = /^\d+$/.test(params.edit ?? '') ? Number(params.edit) : 0;
        const editing =
          editId > 0
            ? await prisma.notice.findUnique({ where: { id: editId } }).catch(() => null)
            : null;

        const listHref = `/admin/notices${filter !== '' ? `?status=${filter}` : ''}`;
        const branchName = new Map(branches.map((branch) => [branch.id, t.pickPair(branch, 'name')]));

        const tabs: { key: '' | 'active' | 'inactive'; label: string }[] = [
          { key: '', label: t.t('common.all') },
          { key: 'active', label: t.t('status.active') },
          { key: 'inactive', label: t.t('status.inactive') },
        ];

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-ink-heading">{t.t('anotice.title')}</h1>
                <p className="mt-1 text-sm text-ink-muted">{t.t('anotice.sub')}</p>
              </div>
              <Link
                href="/notices"
                target="_blank"
                className="rounded-orbit border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
              >
                {t.t('anotice.view_board')}
              </Link>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <Card>
                <CardHeader
                  title={t.t(editing ? 'anotice.edit' : 'anotice.add')}
                  icon="bi-megaphone"
                />
                <CardBody>
                  <NoticeForm
                    values={{
                      id: editing?.id ?? 0,
                      title: editing?.title ?? '',
                      description: editing?.description ?? '',
                      status: editing?.status ?? 'active',
                      // A new notice while one branch is in focus is for that branch.
                      branch_id: editing ? editing.branch_id : focus || null,
                    }}
                    branches={branches.map((branch) => ({
                      id: branch.id,
                      name: t.pickPair(branch, 'name'),
                    }))}
                    cancelHref={listHref}
                    labels={{
                      title: t.t('anotice.f_title'),
                      description: t.t('anotice.f_desc'),
                      descriptionHelp: t.t('anotice.f_desc_help'),
                      status: t.t('common.status'),
                      statusActive: t.t('status.active'),
                      statusInactive: t.t('status.inactive'),
                      statusHelp: t.t('anotice.f_status_help'),
                      branch: t.t('branch.label'),
                      branchAll: t.t('branch.all_branches_shared'),
                      branchHelp: t.t('branch.shared_help'),
                      save: t.t('anotice.save'),
                      cancelEdit: t.t('anotice.cancel_edit'),
                    }}
                  />
                </CardBody>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader
                  title={t.t('anotice.title')}
                  icon="bi-bell"
                  actions={
                    <span className="flex flex-wrap gap-1.5">
                      {tabs.map((tab) => (
                        <Link
                          key={tab.key}
                          href={tab.key === '' ? '/admin/notices' : `/admin/notices?status=${tab.key}`}
                          className={`rounded-orbit px-2.5 py-1 text-xs font-medium transition ${
                            tab.key === filter
                              ? 'bg-primary text-white'
                              : 'border border-line text-ink hover:bg-surface-2'
                          }`}
                        >
                          {tab.label} ({t.digits(counts[tab.key])})
                        </Link>
                      ))}
                    </span>
                  }
                />

                {notices.length === 0 ? (
                  <EmptyState
                    icon="bi-megaphone"
                    title={t.t(filter === '' ? 'anotice.none' : 'anotice.none_filtered')}
                    body={t.t('anotice.sub')}
                  />
                ) : (
                  <ul className="divide-y divide-line-soft">
                    {notices.map((notice) => (
                      <li key={notice.id} className="px-5 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-ink-heading">{notice.title}</span>
                              <Badge tone={notice.status === 'active' ? 'success' : 'neutral'}>
                                {t.t(
                                  notice.status === 'active' ? 'status.active' : 'status.inactive'
                                )}
                              </Badge>
                              {multiBranch && (
                                <Badge tone="neutral">
                                  {notice.branch_id
                                    ? (branchName.get(notice.branch_id) ?? '')
                                    : t.t('branch.all_branches')}
                                </Badge>
                              )}
                            </p>
                            <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-ink">
                              {notice.description}
                            </p>
                            <p className="mt-1 text-xs text-ink-muted">
                              {t.t('anotice.col_posted')}: {t.date(notice.created_at, 'd M Y')}
                            </p>
                          </div>

                          <NoticeRowActions
                            noticeId={notice.id}
                            status={notice.status ?? 'active'}
                            editHref={`${listHref}${listHref.includes('?') ? '&' : '?'}edit=${notice.id}`}
                            labels={{
                              edit: t.t('common.edit'),
                              activate: t.t('anotice.activate'),
                              deactivate: t.t('anotice.deactivate'),
                              remove: t.t('common.delete'),
                              confirmDelete: t.t('anotice.delete_confirm'),
                              dismiss: t.t('common.cancel'),
                            }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {pager.totalPages > 1 && (
                  <CardBody className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft text-sm">
                    <span className="text-ink-muted">
                      {t.t('astd.showing', {
                        from: t.digits(pager.from),
                        to: t.digits(pager.to),
                        total: t.digits(pager.total),
                      })}
                    </span>
                    <span className="flex gap-2">
                      {pager.page > 1 && (
                        <Link
                          href={pageHref('/admin/notices', { status: filter || undefined }, pager.page - 1)}
                          className="rounded-orbit border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-2"
                        >
                          {t.t('common.previous')}
                        </Link>
                      )}
                      {pager.page < pager.totalPages && (
                        <Link
                          href={pageHref('/admin/notices', { status: filter || undefined }, pager.page + 1)}
                          className="rounded-orbit border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-2"
                        >
                          {t.t('common.next')}
                        </Link>
                      )}
                    </span>
                  </CardBody>
                )}
              </Card>
            </div>
          </div>
        );
      }}
    </AdminPage>
  );
}
