import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback';
import { getLang, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { branchList } from '@/lib/branch/stats';
import { AdminForm, AdminToggle } from './AdminForms';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'aadm.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * Admin accounts, from admin/admins.php.
 *
 * Developer-only when `ORBIT_DEVELOPER_EMAIL` names an account: passwords and
 * access belong to whoever maintains the system, and `requireDeveloper()` in the
 * actions is what enforces it — this page only explains it.
 *
 * Accounts are never deleted. Locking is the way access ends, so the record of
 * who did what survives.
 */
export default async function AdminAdminsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  return (
    <AdminPage active="admins" route="/admin/admins" level="super" title="">
      {async ({ t }) => {
        const developer = (process.env.ORBIT_DEVELOPER_EMAIL ?? '').trim().toLowerCase();
        const me = await requireSuperAdmin();
        const myEmail = me.email.trim().toLowerCase();
        const mayManage = developer === '' || myEmail === developer;

        if (!mayManage) {
          return (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-ink-heading">{t.t('aadm.title')}</h1>
                <p className="mt-1 text-sm text-ink-muted">{t.t('aadm.sub')}</p>
              </div>
              <Card>
                <EmptyState
                  icon="bi-shield-lock"
                  title={t.t('aadm.dev_only_title')}
                  body={t.t('aadm.dev_only_body')}
                />
              </Card>
            </div>
          );
        }

        const [admins, branches] = await Promise.all([
          prisma.admin
            .findMany({
              orderBy: [{ role: 'asc' }, { name: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                status: true,
                branch_id: true,
                last_login: true,
                created_at: true,
              },
            })
            .catch(() => []),
          branchList(),
        ]);

        // Super admins first, as the original orders them.
        const rows = [...admins].sort((a, b) => {
          if (a.role !== b.role) return a.role === 'super_admin' ? -1 : 1;
          return (a.name ?? '').localeCompare(b.name ?? '');
        });

        const activeSupers = rows.filter(
          (row) => row.role === 'super_admin' && row.status === 'active'
        ).length;

        const editId = /^\d+$/.test(params.edit ?? '') ? Number(params.edit) : 0;
        const editing = rows.find((row) => row.id === editId) ?? null;
        const missing = editId > 0 && editing === null;
        const showForm = editing !== null || params.new === '1';

        const branchName = (id: number | null) => {
          const branch = id === null ? undefined : branches.find((row) => row.id === id);
          return branch ? t.pickPair(branch, 'name') : '';
        };

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-ink-heading">{t.t('aadm.title')}</h1>
                <p className="mt-1 text-sm text-ink-muted">{t.t('aadm.sub')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/admin/branches"
                  className="rounded-orbit border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-2"
                >
                  <i className="bi bi-geo-alt me-1" aria-hidden /> {t.t('abr.title')}
                </Link>
                <Link
                  href="/admin/admins?new=1"
                  className="rounded-orbit bg-primary px-3 py-1.5 text-sm font-medium text-white transition hover:bg-primary-hover"
                >
                  <i className="bi bi-plus-circle me-1" aria-hidden /> {t.t('aadm.add')}
                </Link>
              </div>
            </div>

            {missing && <Alert tone="warning">{t.t('error.not_found_body')}</Alert>}

            {showForm && (
              <Card>
                <CardHeader
                  title={t.t(editing ? 'aadm.edit' : 'aadm.new')}
                  icon="bi-person-gear"
                />
                <CardBody>
                  <AdminForm
                    values={{
                      id: editing?.id ?? 0,
                      name: editing?.name ?? '',
                      email: editing?.email ?? '',
                      // A new account starts as a Branch Admin: the narrower role
                      // is the safer default.
                      role: editing?.role ?? 'branch_admin',
                      status: editing?.status ?? 'active',
                      branchId: editing?.branch_id ?? 0,
                      isSelf: editing !== null && editing.id === me.id,
                    }}
                    branches={branches.map((branch) => ({
                      id: branch.id,
                      label: t.pickPair(branch, 'name'),
                    }))}
                    cancelHref="/admin/admins"
                    labels={{
                      name: t.t('aadm.f_name'),
                      email: t.t('aadm.f_email'),
                      emailHelp: t.t('aadm.f_email_help'),
                      role: t.t('aadm.f_role'),
                      roleHelp: t.t('aadm.f_role_help'),
                      roleSuper: t.t('aadm.role_super'),
                      roleBranch: t.t('aadm.role_branch'),
                      status: t.t('common.status'),
                      statusActive: t.t('status.active'),
                      statusLocked: t.t('aadm.status_locked'),
                      statusHelp: t.t('aadm.f_status_help'),
                      selfNote: t.t('aadm.err_self'),
                      branch: t.t('abr.col_branch'),
                      branchChoose: t.t('common.select'),
                      branchHelp: t.t('aadm.f_branch_help'),
                      generate: t.t('aadm.generate'),
                      password: t.t('aadm.f_password'),
                      passwordNew: t.t('aadm.f_password_new'),
                      passwordHelp: t.t('aadm.f_password_help'),
                      passwordEditHelp: t.t('aadm.f_password_edit_help'),
                      passwordTitle: t.t('aadm.password_title'),
                      passwordNote: t.t('aadm.password_note'),
                      save: t.t('common.save'),
                      saving: t.t('common.please_wait'),
                      cancel: t.t('common.cancel'),
                    }}
                  />
                </CardBody>
              </Card>
            )}

            <Card>
              <CardHeader title={t.t('aadm.col_admin')} icon="bi-people" />

              {rows.length === 0 ? (
                <EmptyState icon="bi-person-gear" title={t.t('aadm.title')} body={t.t('aadm.sub')} />
              ) : (
                <ul className="divide-y divide-line-soft">
                  {rows.map((row) => {
                    const isSelf = row.id === me.id;
                    // The last active super admin cannot be locked, so the button
                    // says so rather than failing on click.
                    const lastSuper =
                      row.role === 'super_admin' && row.status === 'active' && activeSupers <= 1;

                    return (
                      <li key={row.id} className="px-5 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-ink-heading">
                                {(row.name ?? '') !== '' ? row.name : row.email}
                              </span>
                              <Badge tone={row.role === 'super_admin' ? 'info' : 'neutral'}>
                                {t.t(
                                  row.role === 'super_admin' ? 'aadm.role_super' : 'aadm.role_branch'
                                )}
                              </Badge>
                              <Badge tone={row.status === 'active' ? 'success' : 'danger'}>
                                {t.t(row.status === 'active' ? 'status.active' : 'aadm.status_locked')}
                              </Badge>
                              {isSelf && <Badge tone="warning">{t.t('abr.you')}</Badge>}
                            </p>

                            <p className="mt-0.5 text-xs text-ink-muted">{row.email}</p>

                            <p className="mt-1 text-xs text-ink-muted">
                              {[
                                row.branch_id !== null ? branchName(row.branch_id) : '',
                                `${t.t('aadm.col_last_login')}: ${
                                  row.last_login
                                    ? t.date(row.last_login, 'd M Y, h:i A')
                                    : t.t('aadm.never')
                                }`,
                              ]
                                .filter((part) => part !== '')
                                .join(' · ')}
                            </p>
                          </div>

                          <span className="flex flex-wrap items-center gap-1.5">
                            <Link
                              href={`/admin/admins?edit=${row.id}`}
                              title={t.t('common.edit')}
                              aria-label={t.t('common.edit')}
                              className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                            >
                              <i className="bi bi-pencil" aria-hidden />
                            </Link>
                            <AdminToggle
                              adminId={row.id}
                              isActive={row.status === 'active'}
                              disabled={isSelf || lastSuper}
                              labels={{
                                lock: t.t('aadm.lock'),
                                unlock: t.t('aadm.unlock'),
                                lockConfirm: t.t('aadm.lock_confirm'),
                                cancel: t.t('common.cancel'),
                                selfNote: isSelf
                                  ? t.t('aadm.err_self')
                                  : t.t('aadm.err_last_super'),
                              }}
                            />
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <CardBody className="text-xs text-ink-muted">{t.t('aadm.footnote')}</CardBody>
            </Card>
          </div>
        );
      }}
    </AdminPage>
  );
}
