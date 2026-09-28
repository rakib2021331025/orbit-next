import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { Pagination } from '@/components/ui/Pagination';
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { getLang, hasTranslation, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { mailIsConfigured } from '@/lib/email/send';
import { paginate } from '@/lib/paginate';
import { PruneForm } from './PruneForm';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'elog.title'),
    robots: { index: false, follow: false },
  };
}

const AGES = [30, 90, 180];

function validDate(value: string | undefined): string {
  const text = (value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(text)) ? text : '';
}

/**
 * The email delivery log, from admin/email_log.php.
 *
 * Message bodies are **not** stored — only who it went to, what it was about
 * and whether it arrived. Nothing can be re-sent from here, and a log full of
 * old message text is a liability nobody asked for.
 */
export default async function AdminEmailLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  return (
    <AdminPage active="email_log" route="/admin/email-log" title="">
      {async ({ t }) => {
        const filters = {
          status: params.status === 'sent' || params.status === 'failed' ? params.status : '',
          template: /^[a-z0-9_]{1,60}$/.test(params.template ?? '') ? (params.template as string) : '',
          from: validDate(params.from),
          to: validDate(params.to),
          q: (params.q ?? '').trim().slice(0, 100),
        };
        const hasFilters = Object.values(filters).some((value) => value !== '');

        const and: Record<string, unknown>[] = [];
        if (filters.status !== '') and.push({ status: filters.status });
        if (filters.template !== '') and.push({ template: filters.template });
        if (filters.from !== '') {
          and.push({ created_at: { gte: new Date(`${filters.from}T00:00:00.000Z`) } });
        }
        if (filters.to !== '') {
          and.push({ created_at: { lte: new Date(`${filters.to}T23:59:59.999Z`) } });
        }
        if (filters.q !== '') {
          and.push({
            OR: [
              { recipient: { contains: filters.q, mode: 'insensitive' } },
              { subject: { contains: filters.q, mode: 'insensitive' } },
            ],
          });
        }
        const where = and.length > 0 ? { AND: and } : {};

        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const [monthly, templates, total] = await Promise.all([
          // Sent and failed in the last 30 days from one grouped count.
          prisma.emailLog
            .groupBy({
              by: ['status'],
              where: { status: { in: ['sent', 'failed'] }, created_at: { gte: monthAgo } },
              _count: { _all: true },
            })
            .catch(() => []),
          prisma.emailLog
            .findMany({
              where: { NOT: { template: null } },
              distinct: ['template'],
              orderBy: { template: 'asc' },
              select: { template: true },
            })
            .catch(() => []),
          prisma.emailLog.count({ where }).catch(() => 0),
        ]);

        const sent = monthly.find((row) => row.status === 'sent')?._count._all ?? 0;
        const failed = monthly.find((row) => row.status === 'failed')?._count._all ?? 0;

        const pager = paginate(total, 25, Number(params.page ?? 1));
        const rows = await prisma.emailLog
          .findMany({
            where,
            orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
            take: pager.perPage,
            skip: pager.offset,
          })
          .catch(() => []);

        // The student and the admin who sent it are separate reads: email_logs
        // holds plain ids, not foreign keys.
        const studentIds = [
          ...new Set(rows.map((row) => row.student_id).filter((id): id is number => !!id)),
        ];
        const adminIds = [
          ...new Set(rows.map((row) => row.sent_by).filter((id): id is number => !!id)),
        ];
        const [students, admins] = await Promise.all([
          studentIds.length > 0
            ? prisma.student
                .findMany({
                  where: { id: { in: studentIds } },
                  select: { id: true, name: true, name_bn: true, student_id_no: true },
                })
                .catch(() => [])
            : [],
          adminIds.length > 0
            ? prisma.admin
                .findMany({ where: { id: { in: adminIds } }, select: { id: true, email: true } })
                .catch(() => [])
            : [],
        ]);
        const studentById = new Map(students.map((student) => [student.id, student]));
        const adminById = new Map(admins.map((admin) => [admin.id, admin]));

        const mailOn = mailIsConfigured();

        /** A template's own label when the catalogue has one, else its code. */
        const templateLabel = (code: string | null) => {
          const value = (code ?? '').trim();
          if (value === '') return t.t('elog.tpl_other');
          const key = `elog.tpl.${value}`;
          if (hasTranslation(key)) return t.t(key);
          const words = value.replace(/_/g, ' ');
          return words.charAt(0).toUpperCase() + words.slice(1);
        };

        const listQuery = new URLSearchParams();
        for (const [key, value] of Object.entries(filters)) {
          if (value !== '') listQuery.set(key, value);
        }

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-ink-heading">{t.t('elog.title')}</h1>
                <p className="mt-1 text-sm text-ink-muted">{t.t('elog.sub')}</p>
              </div>
              <Link
                href="/admin/settings?tab=email"
                className="rounded-orbit border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-2"
              >
                <i className="bi bi-sliders me-1" aria-hidden /> {t.t('elog.settings')}
              </Link>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-orbit border border-line bg-surface p-4">
                <span className="block text-xl font-bold text-ink-heading">{t.digits(sent)}</span>
                <span className="block text-sm text-ink-muted">{t.t('elog.stat_sent')}</span>
              </div>
              <Link
                href="/admin/email-log?status=failed"
                className="rounded-orbit border border-line bg-surface p-4 transition hover:border-primary"
              >
                <span className="block text-xl font-bold text-red-600">{t.digits(failed)}</span>
                <span className="block text-sm text-ink-muted">{t.t('elog.stat_failed')}</span>
              </Link>
              <div className="rounded-orbit border border-line bg-surface p-4">
                <span className="block text-base font-bold text-ink-heading">
                  {t.t(mailOn ? 'elog.mail_on' : 'elog.mail_off')}
                </span>
                <span className="block text-sm text-ink-muted">
                  {t.t(mailOn ? 'elog.mail_on_sub' : 'elog.mail_off_sub')}
                </span>
              </div>
            </div>

            <Card>
              <form method="get" className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-5">
                <label className="flex flex-col gap-1 text-sm lg:col-span-2">
                  <span className="text-ink-muted">{t.t('common.search')}</span>
                  <input
                    type="search"
                    name="q"
                    defaultValue={filters.q}
                    placeholder={t.t('elog.search_ph')}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('common.status')}</span>
                  <select
                    name="status"
                    defaultValue={filters.status}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="">{t.t('common.all')}</option>
                    <option value="sent">{t.t('elog.status_sent')}</option>
                    <option value="failed">{t.t('elog.status_failed')}</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('elog.col_type')}</span>
                  <select
                    name="template"
                    defaultValue={filters.template}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="">{t.t('common.all')}</option>
                    {templates.map((row) => (
                      <option key={row.template} value={row.template ?? ''}>
                        {templateLabel(row.template)}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-ink-muted">{t.t('common.from')}</span>
                    <input
                      type="date"
                      name="from"
                      defaultValue={filters.from}
                      className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-ink-muted">{t.t('common.to')}</span>
                    <input
                      type="date"
                      name="to"
                      defaultValue={filters.to}
                      className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                    />
                  </label>
                </div>

                <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
                  <button
                    type="submit"
                    className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                  >
                    {t.t('common.filter')}
                  </button>
                  {hasFilters && (
                    <Link
                      href="/admin/email-log"
                      className="rounded-orbit border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
                    >
                      {t.t('common.clear')}
                    </Link>
                  )}
                </div>
              </form>
            </Card>

            <Card>
              <CardHeader
                title={t.t('elog.list_title')}
                icon="bi-envelope-paper"
                actions={
                  <span className="text-xs text-ink-muted">
                    {t.t('elog.count', { count: t.digits(pager.total) })}
                  </span>
                }
              />

              {rows.length === 0 ? (
                <EmptyState
                  icon="bi-envelope"
                  title={t.t(hasFilters ? 'elog.empty_filtered' : 'elog.empty')}
                  body={t.t('elog.sub')}
                />
              ) : (
                <>
                  <TableWrap>
                    <Table>
                      <Thead>
                        <Tr>
                          <Th>{t.t('elog.col_when')}</Th>
                          <Th>{t.t('elog.col_recipient')}</Th>
                          <Th>{t.t('elog.col_subject')}</Th>
                          <Th>{t.t('common.status')}</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {rows.map((row) => {
                          const student = row.student_id ? studentById.get(row.student_id) : null;
                          const admin = row.sent_by ? adminById.get(row.sent_by) : null;
                          const error = (row.error_message ?? '').trim();

                          return (
                            <Tr key={row.id}>
                              <Td className="whitespace-nowrap text-xs">
                                <span className="block">{t.date(row.created_at, 'd M Y')}</span>
                                <span className="block text-ink-muted">
                                  {t.date(row.created_at, 'h:i A')}
                                </span>
                              </Td>

                              <Td className="text-xs">
                                <span className="block break-words">{row.recipient}</span>
                                {student && (
                                  <Link
                                    href={`/admin/students/${student.id}`}
                                    className="text-primary hover:underline"
                                  >
                                    {t.pick(student, 'name')}
                                    {student.student_id_no ? ` · ${student.student_id_no}` : ''}
                                  </Link>
                                )}
                              </Td>

                              <Td className="text-xs">
                                <span className="block font-semibold break-words">{row.subject}</span>
                                <span className="block text-ink-muted">
                                  {templateLabel(row.template)}
                                  {admin?.email ? ` · ${t.t('elog.by', { email: admin.email })}` : ''}
                                </span>
                              </Td>

                              <Td className="text-xs">
                                <Badge tone={row.status === 'sent' ? 'success' : 'danger'}>
                                  {t.t(row.status === 'sent' ? 'elog.status_sent' : 'elog.status_failed')}
                                </Badge>
                                {row.status !== 'sent' && error !== '' && (
                                  <span
                                    title={error}
                                    className="mt-1 block max-w-88 break-words text-ink-muted"
                                  >
                                    {error.length > 140 ? `${error.slice(0, 140)}…` : error}
                                  </span>
                                )}
                              </Td>
                            </Tr>
                          );
                        })}
                      </Tbody>
                    </Table>
                  </TableWrap>

                  {pager.totalPages > 1 && (
                    <CardBody>
                      <Pagination
                        page={pager.page}
                        totalPages={pager.totalPages}
                        hrefFor={(page) => {
                          const query = new URLSearchParams(listQuery);
                          if (page > 1) query.set('page', String(page));
                          const text = query.toString();
                          return `/admin/email-log${text !== '' ? `?${text}` : ''}`;
                        }}
                        labels={{
                          previous: t.t('common.previous'),
                          next: t.t('common.next'),
                          pageOf: t.t('gallery.page_of'),
                        }}
                        format={t.digits}
                      />
                    </CardBody>
                  )}
                </>
              )}
            </Card>

            <Card>
              <CardBody>
                <PruneForm
                  ages={AGES.map((days) => ({
                    value: days,
                    label: t.t('elog.days', { count: t.digits(days) }),
                  }))}
                  labels={{
                    label: t.t('elog.prune_label'),
                    prune: t.t('elog.prune_btn'),
                    confirm: t.t('elog.prune_confirm'),
                    cancel: t.t('common.cancel'),
                    note: t.t('elog.note'),
                  }}
                />
              </CardBody>
            </Card>
          </div>
        );
      }}
    </AdminPage>
  );
}
