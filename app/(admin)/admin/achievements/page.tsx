import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert, EmptyState } from '@/components/ui/Feedback';
import { Pagination } from '@/components/ui/Pagination';
import { getLang, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { paginate } from '@/lib/paginate';
import { uploadUrl } from '@/lib/storage/url';
import { AchievementForm, DeleteAchievement } from './AchievementForms';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'aach.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * Achievements, from admin/achievements.php.
 *
 * Everything listed here is on the public homepage slider, which is why the page
 * says so rather than offering a status switch the table does not have.
 */
export default async function AdminAchievementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  return (
    <AdminPage active="achievements" route="/admin/achievements" title="">
      {async ({ t }) => {
        const total = await prisma.achievement.count().catch(() => 0);
        const pager = paginate(total, 25, Number(params.page ?? 1));

        const rows = await prisma.achievement
          .findMany({
            orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
            take: pager.perPage,
            skip: pager.offset,
          })
          .catch(() => []);

        const editId = /^\d+$/.test(params.edit ?? '') ? Number(params.edit) : 0;
        const editing =
          editId > 0
            ? await prisma.achievement.findUnique({ where: { id: editId } }).catch(() => null)
            : null;
        const missing = editId > 0 && editing === null;

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-ink-heading">{t.t('aach.title')}</h1>
                <p className="mt-1 text-sm text-ink-muted">{t.t('aach.sub')}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-ink-muted">
                  {t.t('aach.count', { count: t.digits(total) })}
                </span>
                <a
                  href="/#achievements"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-orbit border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-2"
                >
                  <i className="bi bi-box-arrow-up-right me-1" aria-hidden />
                  {t.t('aach.view_site')}
                </a>
              </div>
            </div>

            {missing && <Alert tone="warning">{t.t('aach.not_found')}</Alert>}

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-1">
                <Card>
                  <CardHeader
                    title={t.t(editing ? 'aach.edit' : 'aach.new')}
                    icon="bi-trophy"
                  />
                  <CardBody>
                    <AchievementForm
                      values={{
                        id: editing?.id ?? 0,
                        title: editing?.title ?? '',
                        description: editing?.description ?? '',
                        imageUrl: editing ? uploadUrl(editing.image) : '',
                      }}
                      labels={{
                        title: t.t('aach.f_title'),
                        description: t.t('aach.f_desc'),
                        descriptionHelp: t.t('aach.f_desc_help'),
                        image: t.t('aach.f_image'),
                        imageHelp: t.t('aach.f_image_help'),
                        imageKeep: t.t('aach.f_image_keep'),
                        currentImage: t.t('aach.current_image'),
                        save: t.t('aach.save'),
                        saving: t.t('common.please_wait'),
                        cancelEdit: t.t('aach.cancel_edit'),
                      }}
                    />
                  </CardBody>
                </Card>
              </div>

              <div className="lg:col-span-2">
                <Card>
                  <CardHeader title={t.t('aach.title')} icon="bi-trophy-fill" />

                  {rows.length === 0 ? (
                    <EmptyState
                      icon="bi-trophy"
                      title={t.t('aach.none')}
                      body={t.t('aach.sub')}
                    />
                  ) : (
                    <ul className="divide-y divide-line-soft">
                      {rows.map((row) => (
                        <li key={row.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={uploadUrl(row.image)}
                            alt=""
                            className="h-14 w-22 shrink-0 rounded-orbit bg-surface-2 object-cover"
                          />

                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-ink-heading">{row.title}</p>
                            {(row.description ?? '').trim() !== '' && (
                              <p className="mt-0.5 line-clamp-2 text-sm text-ink-muted">
                                {row.description}
                              </p>
                            )}
                            <p className="mt-1 text-xs text-ink-muted">
                              {t.t('aach.col_added')}: {t.date(row.created_at, 'd M Y')}
                            </p>
                          </div>

                          <span className="flex shrink-0 items-center gap-1.5">
                            <Link
                              href={`/admin/achievements?edit=${row.id}#achievementForm`}
                              title={t.t('common.edit')}
                              aria-label={t.t('common.edit')}
                              className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                            >
                              <i className="bi bi-pencil" aria-hidden />
                            </Link>
                            <DeleteAchievement
                              achievementId={row.id}
                              labels={{
                                remove: t.t('common.delete'),
                                confirm: t.t('aach.delete_confirm'),
                                cancel: t.t('common.cancel'),
                              }}
                            />
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {pager.totalPages > 1 && (
                    <CardBody>
                      <Pagination
                        page={pager.page}
                        totalPages={pager.totalPages}
                        hrefFor={(page) =>
                          `/admin/achievements${page > 1 ? `?page=${page}` : ''}`
                        }
                        labels={{
                          previous: t.t('common.previous'),
                          next: t.t('common.next'),
                          pageOf: t.t('gallery.page_of'),
                        }}
                        format={t.digits}
                      />
                    </CardBody>
                  )}
                </Card>
              </div>
            </div>
          </div>
        );
      }}
    </AdminPage>
  );
}
