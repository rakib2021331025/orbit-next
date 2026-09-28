import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { getLang, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { formatPhone, absoluteUrl } from '@/lib/site/url';
import { instituteName } from '@/lib/settings';
import { paginate, pageHref } from '@/lib/paginate';
import { guardianList, unlinkedGroups } from '@/lib/guardians/manage';
import {
  UnlinkedGroupActions,
  ManualCreateForm,
  GuardianRowActions,
  ChildActions,
  LinkChildForm,
} from './GuardianForms';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'aguardian.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * Guardian logins, from admin/guardians.php.
 *
 * Two lists, because there are two jobs: the accounts that exist, and the
 * students whose guardian phone has **no** account yet — grouped by number, so
 * siblings become one login rather than three.
 */
export default async function AdminGuardiansPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; unlinked?: string; new?: string; view?: string; page?: string }>;
}) {
  const params = await searchParams;

  return (
    <AdminPage active="guardians" route="/admin/guardians" title="">
      {async ({ t }) => {
        const search = (params.q ?? '').trim().slice(0, 100);
        const unlinkedSearch = (params.unlinked ?? '').trim().slice(0, 100);
        const viewId = /^\d+$/.test(params.view ?? '') ? Number(params.view) : 0;

        const pager = paginate(
          (await guardianList(search, 1, 0)).total,
          20,
          Number(params.page ?? 1)
        );

        const [list, groups, institute] = await Promise.all([
          guardianList(search, pager.perPage, pager.offset),
          unlinkedGroups(unlinkedSearch),
          instituteName(),
        ]);

        // Students with no guardian account at all, offered when linking a
        // child by hand to an account being viewed.
        const linkable =
          viewId > 0
            ? await prisma.student
                .findMany({
                  where: {
                    status: 'approved',
                    guardianStudent_student: { none: { guardian_id: viewId } },
                  },
                  orderBy: { name: 'asc' },
                  take: 200,
                  select: { id: true, name: true, student_id_no: true },
                })
                .catch(() => [])
            : [];

        const whatsappMessage = t.t('aguardian.wa_message', {
          institute,
          url: absoluteUrl('/guardian/login'),
          phone: '{phone}',
          password: '{password}',
        });

        const credentialLabels = {
          credTitle: t.t('aguardian.cred_created_title'),
          credOnce: t.t('aguardian.cred_once'),
          phone: t.t('aguardian.col_phone'),
          tempPassword: t.t('aguardian.temp_password'),
          shareWhatsapp: t.t('aguardian.share_whatsapp'),
        };

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-ink-heading">{t.t('aguardian.title')}</h1>
                <p className="mt-1 text-sm text-ink-muted">{t.t('aguardian.sub')}</p>
              </div>
              <Link
                href="/guardian/login"
                target="_blank"
                className="rounded-orbit border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
              >
                {t.t('aguardian.open_portal')}
              </Link>
            </div>

            <Card>
              <CardHeader
                title={t.t('aguardian.unlinked_title', { count: t.digits(groups.length) })}
                subtitle={t.t('aguardian.unlinked_sub')}
                icon="bi-person-plus"
              />

              <CardBody>
                <form method="get" className="flex flex-wrap items-end gap-3">
                  {search !== '' && <input type="hidden" name="q" value={search} />}
                  <label className="flex flex-1 flex-col gap-1 text-sm">
                    <span className="text-ink-muted">{t.t('aguardian.unlinked_search')}</span>
                    <input
                      type="search"
                      name="unlinked"
                      defaultValue={unlinkedSearch}
                      className="w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                    />
                  </label>
                  <button
                    type="submit"
                    className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                  >
                    {t.t('common.search')}
                  </button>
                </form>
              </CardBody>

              {groups.length === 0 ? (
                <CardBody className="text-sm text-ink-muted">
                  {t.t(unlinkedSearch !== '' ? 'aguardian.link_none' : 'aguardian.unlinked_none')}
                </CardBody>
              ) : (
                <ul className="divide-y divide-line-soft">
                  {groups.map((group) => (
                    <li key={group.phone} className="px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-ink-heading">{formatPhone(group.phone)}</p>
                          <p className="text-xs text-ink-muted">
                            {t.t('aguardian.col_suggested')}: {group.name ?? '—'} ·{' '}
                            {t.t(`guardian.relation.${group.relation}`)}
                          </p>
                          <ul className="mt-1 space-y-0.5 text-xs text-ink">
                            {group.students.map((student) => (
                              <li key={student.id}>
                                {student.name}
                                {student.student_id_no ? ` — ${student.student_id_no}` : ''}
                                {student.course ? ` · ${student.course}` : ''}
                              </li>
                            ))}
                          </ul>
                        </div>

                        <UnlinkedGroupActions
                          phone={group.phone}
                          guardianId={group.guardianId}
                          count={group.students.length}
                          whatsappMessage={whatsappMessage}
                          labels={{
                            ...credentialLabels,
                            hasAccount: t.t('aguardian.has_account'),
                            createLogin: t.t('aguardian.create_login', { count: '{count}' }),
                            linkExisting: t.t('aguardian.link_existing', { count: '{count}' }),
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader title={t.t('aguardian.create')} icon="bi-person-badge" />
              <CardBody>
                <ManualCreateForm
                  whatsappMessage={whatsappMessage}
                  labels={{
                    ...credentialLabels,
                    name: t.t('common.name'),
                    email: t.t('common.email'),
                    studentRef: t.t('aguardian.student_ref'),
                    createHint: t.t('aguardian.create_hint'),
                    createSubmit: t.t('aguardian.create_submit'),
                  }}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title={t.t('aguardian.accounts', { count: t.digits(list.total) })}
                icon="bi-people-fill"
                subtitle={t.t('aguardian.access_hint')}
              />

              <CardBody>
                <form method="get" className="flex flex-wrap items-end gap-3">
                  {unlinkedSearch !== '' && (
                    <input type="hidden" name="unlinked" value={unlinkedSearch} />
                  )}
                  <label className="flex flex-1 flex-col gap-1 text-sm">
                    <span className="text-ink-muted">{t.t('aguardian.search')}</span>
                    <input
                      type="search"
                      name="q"
                      defaultValue={search}
                      className="w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                    />
                  </label>
                  <button
                    type="submit"
                    className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                  >
                    {t.t('common.search')}
                  </button>
                  {search !== '' && (
                    <Link
                      href="/admin/guardians"
                      className="rounded-orbit border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
                    >
                      {t.t('common.clear')}
                    </Link>
                  )}
                </form>
              </CardBody>

              {list.rows.length === 0 ? (
                <EmptyState
                  icon="bi-people"
                  title={t.t(search !== '' ? 'aguardian.none_found' : 'aguardian.none')}
                  body={t.t('aguardian.sub')}
                />
              ) : (
                <ul className="divide-y divide-line-soft">
                  {list.rows.map((guardian) => (
                    <li key={guardian.id} className="px-5 py-4" id={`guardian-${guardian.id}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-ink-heading">
                              {guardian.name ?? formatPhone(guardian.phone)}
                            </span>
                            <Badge tone={guardian.status === 'active' ? 'success' : 'neutral'}>
                              {t.t(
                                guardian.status === 'active' ? 'status.active' : 'status.inactive'
                              )}
                            </Badge>
                            {guardian.must_change_password && (
                              <Badge tone="warning">{t.t('aguardian.temp_active')}</Badge>
                            )}
                          </p>
                          <p className="text-xs text-ink-muted">
                            {[
                              formatPhone(guardian.phone),
                              guardian.email ?? '',
                              guardian.last_login
                                ? `${t.t('aguardian.last_login')}: ${t.date(guardian.last_login, 'd M Y')}`
                                : `${t.t('aguardian.last_login')}: ${t.t('aguardian.never')}`,
                            ]
                              .filter((part) => part !== '')
                              .join(' · ')}
                          </p>

                          <div className="mt-2">
                            <p className="text-xs font-semibold uppercase text-ink-muted">
                              {t.t('aguardian.linked_students')}
                            </p>
                            {guardian.guardianStudent_guardian.length === 0 ? (
                              <p className="text-xs text-ink-muted">{t.t('aguardian.no_linked')}</p>
                            ) : (
                              <ul className="mt-1 space-y-1">
                                {guardian.guardianStudent_guardian.map((link) => (
                                  <li
                                    key={link.student.id}
                                    className="flex flex-wrap items-center gap-2 text-sm"
                                  >
                                    <span className="text-ink">
                                      {t.pick(link.student, 'name')}
                                      <span className="ms-2 text-xs text-ink-muted">
                                        {[
                                          link.student.student_id_no ?? '',
                                          link.relation ? t.t(`guardian.relation.${link.relation}`) : '',
                                        ]
                                          .filter((part) => part !== '')
                                          .join(' · ')}
                                      </span>
                                    </span>
                                    <ChildActions
                                      guardianId={guardian.id}
                                      studentId={link.student.id}
                                      studentName={link.student.name}
                                      labels={{
                                        unlink: t.t('aguardian.unlink'),
                                        confirm: t.t('aguardian.unlink_confirm'),
                                        dismiss: t.t('common.cancel'),
                                        profile: t.t('astd.profile'),
                                      }}
                                    />
                                  </li>
                                ))}
                              </ul>
                            )}

                            {viewId === guardian.id && (
                              <div className="mt-3">
                                <LinkChildForm
                                  guardianId={guardian.id}
                                  students={linkable.map((student) => ({
                                    id: student.id,
                                    label: `${student.name}${
                                      student.student_id_no ? ` — ${student.student_id_no}` : ''
                                    }`,
                                  }))}
                                  labels={{
                                    linkTitle: t.t('aguardian.link_title'),
                                    linkNone: t.t('aguardian.link_none'),
                                    relation: t.t('aguardian.relation'),
                                    relationAuto: t.t('aguardian.relation_auto'),
                                    father: t.t('guardian.relation.father'),
                                    mother: t.t('guardian.relation.mother'),
                                    guardian: t.t('guardian.relation.guardian'),
                                    link: t.t('aguardian.link'),
                                  }}
                                />
                              </div>
                            )}

                            {viewId !== guardian.id && (
                              <Link
                                href={`/admin/guardians?view=${guardian.id}#guardian-${guardian.id}`}
                                className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
                              >
                                {t.t('aguardian.link_title')}
                              </Link>
                            )}
                          </div>
                        </div>

                        <GuardianRowActions
                          guardianId={guardian.id}
                          phone={guardian.phone}
                          name={guardian.name ?? ''}
                          email={guardian.email ?? ''}
                          status={guardian.status}
                          whatsappMessage={whatsappMessage}
                          labels={{
                            ...credentialLabels,
                            credTitle: t.t('aguardian.cred_reset_title'),
                            edit: t.t('common.edit'),
                            name: t.t('common.name'),
                            email: t.t('common.email'),
                            resetPassword: t.t('aguardian.reset_password'),
                            resetConfirm: t.t('aguardian.reset_confirm'),
                            activate: t.t('aguardian.activate'),
                            deactivate: t.t('aguardian.deactivate'),
                            remove: t.t('common.delete'),
                            deleteConfirm: t.t('aguardian.delete_confirm'),
                            save: t.t('common.save'),
                            cancel: t.t('common.cancel'),
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
                        href={pageHref('/admin/guardians', { q: search || undefined }, pager.page - 1)}
                        className="rounded-orbit border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-2"
                      >
                        {t.t('common.previous')}
                      </Link>
                    )}
                    {pager.page < pager.totalPages && (
                      <Link
                        href={pageHref('/admin/guardians', { q: search || undefined }, pager.page + 1)}
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
        );
      }}
    </AdminPage>
  );
}
