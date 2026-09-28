import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { getLang, translate } from '@/lib/i18n';
import { uploadUrl } from '@/lib/storage/url';
import { branchesInUse, branchRows } from '@/lib/branch/manage';
import { BranchRowActions } from './BranchForms';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'abr.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * Branches, from admin/branches.php.
 *
 * Each row says whether the branch can be deleted at all: one with records is
 * deactivated instead, and the main branch is neither — every record made before
 * branches existed belongs to it.
 */
export default async function AdminBranchesPage() {
  return (
    <AdminPage active="branches" route="/admin/branches" level="super" title="">
      {async ({ t }) => {
        const branches = await branchRows();

        // Whether each branch may be deleted — one query for the whole list, not
        // twelve counts per row. If it cannot be answered, nothing is offered
        // for deletion (the delete action re-checks with branchDependents anyway).
        const inUse = await branchesInUse(branches.map((branch) => branch.id));
        const deletable = new Map<number, boolean>();
        for (const branch of branches) {
          deletable.set(branch.id, !branch.is_main && inUse !== null && !inUse.has(branch.id));
        }

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-ink-heading">{t.t('abr.title')}</h1>
                <p className="mt-1 text-sm text-ink-muted">{t.t('abr.sub')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/admin/admins"
                  className="rounded-orbit border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-2"
                >
                  <i className="bi bi-person-gear me-1" aria-hidden /> {t.t('aadm.title')}
                </Link>
                <Link
                  href="/admin/branches/new"
                  className="rounded-orbit bg-primary px-3 py-1.5 text-sm font-medium text-white transition hover:bg-primary-hover"
                >
                  <i className="bi bi-plus-circle me-1" aria-hidden /> {t.t('abr.add')}
                </Link>
              </div>
            </div>

            <Card>
              <CardHeader title={t.t('abr.col_branch')} icon="bi-geo-alt" />

              {branches.length === 0 ? (
                <EmptyState icon="bi-geo-alt" title={t.t('abr.title')} body={t.t('abr.sub')} />
              ) : (
                <ul className="divide-y divide-line-soft">
                  {branches.map((branch) => (
                    <li key={branch.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-start gap-3">
                        {branch.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={uploadUrl(branch.image)}
                            alt=""
                            className="h-16 w-16 shrink-0 rounded-orbit bg-surface-2 object-contain"
                          />
                        ) : (
                          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-orbit bg-surface-2 text-ink-muted">
                            <i className="bi bi-geo-alt" aria-hidden />
                          </span>
                        )}

                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-ink-heading">
                              {t.pickPair(branch, 'name')}
                            </span>
                            {branch.is_main && <Badge tone="info">{t.t('abr.set_main')}</Badge>}
                            <Badge tone={branch.status === 'active' ? 'success' : 'neutral'}>
                              {t.t(
                                branch.status === 'active' ? 'status.active' : 'status.inactive'
                              )}
                            </Badge>
                          </p>

                          <p className="mt-1 text-xs text-ink-muted">
                            {[
                              t.pickPair(branch, 'address'),
                              branch.phone ?? '',
                              branch.email ?? '',
                            ]
                              .filter((part) => part !== '')
                              .join(' · ')}
                          </p>

                          <p className="mt-1 text-xs text-ink-muted">
                            {t.t('abr.numbers', {
                              students: t.digits(branch.students),
                              batches: t.digits(branch.batches),
                              courses: t.digits(branch.courses.length),
                            })}
                          </p>

                          {branch.courses.length > 0 && (
                            <p className="mt-1 flex flex-wrap gap-1.5 text-xs">
                              {branch.courses.map((course) => (
                                <span
                                  key={course.id}
                                  className="rounded-orbit bg-surface-2 px-2 py-0.5 text-ink-muted"
                                >
                                  {t.pick(course, 'name')}
                                </span>
                              ))}
                            </p>
                          )}

                          {branch.teachers.length > 0 && (
                            <p className="mt-1 text-xs text-ink-muted">
                              {t.t('abr.teachers')}:{' '}
                              {branch.teachers.map((teacher) => teacher.name).join(', ')}
                            </p>
                          )}

                          <p className="mt-1">
                            <a
                              href={`/branches/${branch.slug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline"
                            >
                              <i className="bi bi-box-arrow-up-right me-1" aria-hidden />
                              {t.t('abr.view_page')}
                            </a>
                          </p>
                        </div>

                        <BranchRowActions
                          branchId={branch.id}
                          status={branch.status}
                          isMain={branch.is_main}
                          hasRecords={deletable.get(branch.id) !== true}
                          labels={{
                            setMain: t.t('abr.set_main'),
                            activate: t.t('abr.activate'),
                            deactivate: t.t('abr.deactivate'),
                            edit: t.t('common.edit'),
                            remove: t.t('common.delete'),
                            confirm: t.t('abr.delete_confirm'),
                            cancel: t.t('common.cancel'),
                            cantDelete: t.t('abr.cant_delete_hint'),
                            mainDelete: t.t('abr.err_main_delete'),
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        );
      }}
    </AdminPage>
  );
}
