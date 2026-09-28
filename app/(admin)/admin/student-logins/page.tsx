import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { getLang, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { branchWhere } from '@/lib/auth/guards';
import { formatPhone } from '@/lib/site/url';
import { paginate, pageHref } from '@/lib/paginate';
import { CreateLoginForm, LoginRowActions } from './LoginForms';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'alogin.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * Student portal logins, from admin/student_login_management.php.
 *
 * The list is of **students**, not of logins, with the login shown beside each —
 * because the question being answered is "who cannot sign in yet", and a list of
 * existing logins cannot answer it.
 */
export default async function AdminStudentLoginsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; state?: string; create?: string; page?: string }>;
}) {
  const params = await searchParams;

  return (
    <AdminPage active="logins" route="/admin/student-logins" title="">
      {async ({ t }) => {
        const search = (params.q ?? '').trim().slice(0, 100);
        const state = params.state === 'with' || params.state === 'without' ? params.state : '';
        const preselect = /^\d+$/.test(params.create ?? '') ? Number(params.create) : 0;

        const branchScope = await branchWhere();
        const base = { status: 'approved' as const, ...branchScope };

        const where = {
          ...base,
          ...(state === 'with' ? { studentLogin_student: { some: {} } } : {}),
          ...(state === 'without' ? { studentLogin_student: { none: {} } } : {}),
          ...(search !== ''
            ? {
                OR: [
                  { name: { contains: search, mode: 'insensitive' as const } },
                  { name_bn: { contains: search, mode: 'insensitive' as const } },
                  { phone: { contains: search } },
                  { student_id_no: { contains: search, mode: 'insensitive' as const } },
                  {
                    studentLogin_student: {
                      some: { username: { contains: search, mode: 'insensitive' as const } },
                    },
                  },
                ],
              }
            : {}),
        };

        const [total, withLogin, matching] = await Promise.all([
          prisma.student.count({ where: base }).catch(() => 0),
          prisma.student
            .count({ where: { ...base, studentLogin_student: { some: {} } } })
            .catch(() => 0),
          prisma.student.count({ where }).catch(() => 0),
        ]);

        const pager = paginate(matching, 20, Number(params.page ?? 1));

        const [rows, without] = await Promise.all([
          prisma.student
            .findMany({
              where,
              orderBy: { name: 'asc' },
              take: pager.perPage,
              skip: pager.offset,
              select: {
                id: true,
                name: true,
                name_bn: true,
                student_id_no: true,
                course: true,
                phone: true,
                studentLogin_student: {
                  select: { id: true, username: true, last_login: true },
                },
              },
            })
            .catch(() => []),
          prisma.student
            .findMany({
              where: { ...base, studentLogin_student: { none: {} } },
              orderBy: { name: 'asc' },
              take: 500,
              select: { id: true, name: true, course: true, student_id_no: true },
            })
            .catch(() => []),
        ]);

        const query = { q: search || undefined, state: state || undefined };

        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-ink-heading">{t.t('alogin.title')}</h1>
              <p className="mt-1 text-sm text-ink-muted">{t.t('alogin.sub')}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { label: t.t('alogin.stat_students'), value: total, href: '/admin/student-logins' },
                {
                  label: t.t('alogin.has_login'),
                  value: withLogin,
                  href: '/admin/student-logins?state=with',
                },
                {
                  label: t.t('alogin.no_login'),
                  value: total - withLogin,
                  href: '/admin/student-logins?state=without',
                },
              ].map((stat) => (
                <Link
                  key={stat.label}
                  href={stat.href}
                  className="rounded-orbit border border-line bg-surface p-4 transition hover:border-primary"
                >
                  <span className="block text-xl font-bold text-ink-heading">
                    {t.digits(stat.value)}
                  </span>
                  <span className="block text-sm text-ink-muted">{stat.label}</span>
                </Link>
              ))}
            </div>

            <Card>
              <CardHeader title={t.t('alogin.create')} icon="bi-key" />
              <CardBody>
                <CreateLoginForm
                  students={without.map((student) => ({
                    id: student.id,
                    label: `${student.name}${student.student_id_no ? ` — ${student.student_id_no}` : ''}${
                      student.course ? ` · ${student.course}` : ''
                    }`,
                    studentId: student.student_id_no ?? '',
                  }))}
                  preselect={preselect}
                  labels={{
                    selectStudent: t.t('alogin.select_student'),
                    username: t.t('alogin.f_username'),
                    usernameHelp: t.t('alogin.f_username_help'),
                    password: t.t('alogin.f_password'),
                    create: t.t('alogin.create'),
                    noneWithout: t.t('alogin.none_without'),
                  }}
                />
              </CardBody>
            </Card>

            <Card>
              <form method="get" className="flex flex-wrap items-end gap-3 px-5 py-4">
                <label className="flex flex-1 flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('common.search')}</span>
                  <input
                    type="search"
                    name="q"
                    defaultValue={search}
                    placeholder={t.t('alogin.search_ph')}
                    className="w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('alogin.col_login')}</span>
                  <select
                    name="state"
                    defaultValue={state}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="">{t.t('common.all')}</option>
                    <option value="with">{t.t('alogin.has_login')}</option>
                    <option value="without">{t.t('alogin.no_login')}</option>
                  </select>
                </label>

                <button
                  type="submit"
                  className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                >
                  {t.t('common.filter')}
                </button>
                <Link
                  href="/admin/student-logins"
                  className="rounded-orbit border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
                >
                  {t.t('common.clear')}
                </Link>
              </form>
            </Card>

            <Card>
              <CardHeader title={t.t('alogin.list_title')} icon="bi-person-lock" />

              {rows.length === 0 ? (
                <EmptyState
                  icon="bi-person-x"
                  title={t.t(
                    search !== '' || state !== '' ? 'alogin.empty_filtered' : 'alogin.empty'
                  )}
                  body={t.t('alogin.sub')}
                />
              ) : (
                <TableWrap>
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>{t.t('common.student')}</Th>
                        <Th>{t.t('alogin.col_login')}</Th>
                        <Th alignment="end">{t.t('common.actions')}</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {rows.map((row) => {
                        const login = row.studentLogin_student[0];

                        return (
                          <Tr key={row.id}>
                            <Td>
                              <Link
                                href={`/admin/students/${row.id}`}
                                className="font-medium text-ink hover:text-primary"
                              >
                                {t.pick(row, 'name')}
                              </Link>
                              <span className="block text-xs text-ink-muted">
                                {[
                                  row.student_id_no ?? '',
                                  row.course,
                                  row.phone ? formatPhone(row.phone) : '',
                                ]
                                  .filter((part) => part !== '')
                                  .join(' · ')}
                              </span>
                            </Td>

                            <Td>
                              {login ? (
                                <>
                                  <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">
                                    {login.username}
                                  </code>
                                  <span className="block text-xs text-ink-muted">
                                    {login.last_login
                                      ? t.date(login.last_login, 'd M Y, h:i A')
                                      : t.t('atch.never')}
                                  </span>
                                </>
                              ) : (
                                <Badge tone="warning">{t.t('alogin.no_login')}</Badge>
                              )}
                            </Td>

                            <Td alignment="end">
                              {login ? (
                                <LoginRowActions
                                  loginId={login.id}
                                  studentName={row.name}
                                  username={login.username}
                                  labels={{
                                    reset: t.t('alogin.reset'),
                                    resetFor: t.t('alogin.reset_for', {
                                      name: '{name}',
                                      username: '{username}',
                                    }),
                                    resetNote: t.t('alogin.reset_note'),
                                    delete: t.t('alogin.delete'),
                                    deleteConfirm: t.t('alogin.delete_confirm', {
                                      name: '{name}',
                                      username: '{username}',
                                    }),
                                    cancel: t.t('common.cancel'),
                                  }}
                                />
                              ) : (
                                <Link
                                  href={`/admin/student-logins?create=${row.id}#loginForm`}
                                  className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                                >
                                  {t.t('alogin.create')}
                                </Link>
                              )}
                            </Td>
                          </Tr>
                        );
                      })}
                    </Tbody>
                  </Table>
                </TableWrap>
              )}

              {pager.totalPages > 1 && (
                <CardBody className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft text-sm">
                  <span className="text-ink-muted">
                    {t.t('alogin.showing', {
                      from: t.digits(pager.from),
                      to: t.digits(pager.to),
                      total: t.digits(pager.total),
                    })}
                  </span>
                  <span className="flex gap-2">
                    {pager.page > 1 && (
                      <Link
                        href={pageHref('/admin/student-logins', query, pager.page - 1)}
                        className="rounded-orbit border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-2"
                      >
                        {t.t('common.previous')}
                      </Link>
                    )}
                    {pager.page < pager.totalPages && (
                      <Link
                        href={pageHref('/admin/student-logins', query, pager.page + 1)}
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
