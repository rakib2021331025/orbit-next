import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback';
import { Pagination } from '@/components/ui/Pagination';
import { getLang, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { setting } from '@/lib/settings';
import { formatPhone, whatsappUrl } from '@/lib/site/url';
import {
  INQUIRY_STATUSES,
  inquiryCounts,
  inquiryFilters,
  inquiryList,
  inquiryQuery,
  inquiriesDue,
  phoneMatches,
} from '@/lib/inquiries/admin';
import { InquiryActions, NotifyEmailForm, type LinkOption } from './InquiryForms';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'ainq.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * Admission inquiries, from admin/inquiries.php.
 *
 * A lead list, not an archive: each row carries the phone as a `tel:` link and
 * a WhatsApp link, the office note, and the follow-up date that decides where
 * it sits in the queue. Overdue follow-ups are called out at the top, because a
 * lead nobody rang back is the one thing this page exists to prevent.
 */
export default async function AdminInquiriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  return (
    <AdminPage active="inquiries" route="/admin/inquiries" level="super" title="">
      {async ({ t }) => {
        const filters = inquiryFilters(params);
        const counts = await inquiryCounts(filters);
        const total = filters.status === 'all' ? counts.all : counts[filters.status];
        const { rows, pager } = await inquiryList(filters, total);

        const [due, courses, notifyEmail, instituteEmail] = await Promise.all([
          inquiriesDue(),
          prisma.course
            .findMany({
              orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
              select: { id: true, name: true, name_bn: true },
            })
            .catch(() => []),
          setting('inquiry_notify_email', ''),
          setting('institute_email', ''),
        ]);

        const matches = await phoneMatches(rows.map((row) => row.phone));
        const courseById = new Map(courses.map((course) => [course.id, course]));

        const todayIso = new Date().toISOString().slice(0, 10);
        const filtered =
          filters.q !== '' ||
          filters.courseId > 0 ||
          filters.from !== '' ||
          filters.to !== '' ||
          filters.due;

        const tabs: { key: (typeof filters)['status']; label: string; count: number }[] = [
          ...INQUIRY_STATUSES.map((status) => ({
            key: status,
            label: t.t(`inquiry.status_${status}`),
            count: counts[status],
          })),
          { key: 'all' as const, label: t.t('ainq.tab_all'), count: counts.all },
        ];

        const tabHref = (status: string) => {
          const query = inquiryQuery({ ...filters, status: 'new', page: 1 });
          const params = new URLSearchParams(query);
          if (status === 'new') params.delete('status');
          else params.set('status', status);
          const text = params.toString();
          return `/admin/inquiries${text !== '' ? `?${text}` : ''}`;
        };

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-ink-heading">{t.t('ainq.title')}</h1>
                <p className="mt-1 text-sm text-ink-muted">{t.t('ainq.sub')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/inquiry"
                  className="rounded-orbit border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-2"
                >
                  <i className="bi bi-box-arrow-up-right me-1" aria-hidden /> {t.t('ainq.view_page')}
                </Link>
                <a
                  href={`/api/export/inquiries?${inquiryQuery(filters)}`}
                  className="rounded-orbit bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700"
                >
                  <i className="bi bi-filetype-csv me-1" aria-hidden /> {t.t('ainq.export_csv')}
                </a>
              </div>
            </div>

            {due > 0 && !filters.due && (
              <Alert tone="warning">
                {t.t('ainq.due_alert', { count: t.digits(due) })}{' '}
                <Link href="/admin/inquiries?status=all&due=1" className="underline">
                  {t.t('ainq.due_show')}
                </Link>
              </Alert>
            )}

            <div className="flex flex-wrap gap-2">
              {tabs.map((tab) => (
                <Link
                  key={tab.key}
                  href={tabHref(tab.key)}
                  aria-current={filters.status === tab.key ? 'page' : undefined}
                  className={`inline-flex items-center gap-2 rounded-orbit px-3 py-1.5 text-sm font-medium transition ${
                    filters.status === tab.key
                      ? 'bg-primary text-white'
                      : 'border border-line text-ink hover:bg-surface-2'
                  }`}
                >
                  {tab.label}
                  <span className="rounded-full bg-black/10 px-2 text-xs">
                    {t.digits(tab.count)}
                  </span>
                </Link>
              ))}
            </div>

            <Card>
              <form method="get" className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-5">
                {filters.status !== 'new' && (
                  <input type="hidden" name="status" value={filters.status} />
                )}

                <label className="flex flex-col gap-1 text-sm lg:col-span-2">
                  <span className="text-ink-muted">{t.t('common.search')}</span>
                  <input
                    type="search"
                    name="q"
                    maxLength={100}
                    defaultValue={filters.q}
                    placeholder={t.t('ainq.search_ph')}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('common.course')}</span>
                  <select
                    name="course"
                    defaultValue={String(filters.courseId || '')}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="">{t.t('common.all')}</option>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {t.pick(course, 'name')}
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

                <label className="flex items-end gap-2 pb-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    name="due"
                    value="1"
                    defaultChecked={filters.due}
                    className="h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
                  />
                  <span>{t.t('ainq.due_only')}</span>
                </label>

                <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
                  <button
                    type="submit"
                    className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                  >
                    {t.t('common.filter')}
                  </button>
                  {filtered && (
                    <Link
                      href={tabHref(filters.status)}
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
                title={t.t('ainq.title')}
                icon="bi-telephone-inbound"
                actions={
                  <span className="text-xs text-ink-muted">
                    {t.t('ainq.total', { count: t.digits(pager.total) })}
                  </span>
                }
              />

              {rows.length === 0 ? (
                <EmptyState
                  icon="bi-telephone"
                  title={t.t(filtered ? 'ainq.empty_filtered' : 'ainq.empty')}
                  body={t.t('ainq.sub')}
                />
              ) : (
                <ul className="divide-y divide-line-soft">
                  {rows.map((row) => {
                    const course =
                      row.course_id && courseById.has(row.course_id)
                        ? t.pick(courseById.get(row.course_id)!, 'name')
                        : (row.course_name ?? '');
                    const match = matches.get(row.phone);
                    const followUp = row.follow_up_date
                      ? row.follow_up_date.toISOString().slice(0, 10)
                      : '';
                    const overdue =
                      followUp !== '' &&
                      followUp <= todayIso &&
                      (row.status === 'new' || row.status === 'called');

                    const links: LinkOption[] = [
                      ...(match?.admissions ?? []).map((application) => ({
                        value: `admission:${application.id}`,
                        label: t.t('ainq.link_application', {
                          no: application.application_no ?? `#${application.id}`,
                          name: application.fullname,
                        }),
                      })),
                      ...(match?.students ?? []).map((student) => ({
                        value: `student:${student.id}`,
                        label: t.t('ainq.link_student', {
                          id: student.student_id_no ?? `#${student.id}`,
                          name: student.name,
                        }),
                      })),
                    ];

                    return (
                      <li key={row.id} id={`inq-${row.id}`} className="px-5 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-ink-heading">{row.name}</span>
                              <Badge
                                tone={
                                  row.status === 'admitted'
                                    ? 'success'
                                    : row.status === 'called'
                                      ? 'info'
                                      : row.status === 'not_interested'
                                        ? 'neutral'
                                        : 'warning'
                                }
                              >
                                {t.t(`inquiry.status_${row.status}`)}
                              </Badge>
                              {overdue && <Badge tone="danger">{t.t('ainq.overdue')}</Badge>}
                            </p>

                            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                              <a href={`tel:${row.phone}`} className="text-primary hover:underline">
                                <i className="bi bi-telephone me-1" aria-hidden />
                                {formatPhone(row.phone)}
                              </a>
                              <a
                                href={whatsappUrl(row.phone)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-emerald-700 hover:underline dark:text-emerald-400"
                              >
                                <i className="bi bi-whatsapp me-1" aria-hidden />
                                {t.t('ainq.whatsapp')}
                              </a>
                            </p>

                            <p className="mt-1 text-xs text-ink-muted">
                              {[
                                course,
                                row.preferred_time
                                  ? t.t(`inquiry.time_${row.preferred_time}`)
                                  : '',
                                t.t(`inquiry.source_${row.source}`),
                                t.t('ainq.col_received') + ': ' + t.date(row.created_at, 'd M Y'),
                              ]
                                .filter((part) => part !== '')
                                .join(' · ')}
                            </p>

                            {(row.message ?? '').trim() !== '' && (
                              <p className="mt-2 whitespace-pre-line text-sm text-ink">
                                {row.message}
                              </p>
                            )}

                            {(row.admin_note ?? '').trim() !== '' && (
                              <p className="mt-2 rounded-orbit bg-surface-2 p-2 text-sm text-ink">
                                <span className="font-medium">{t.t('ainq.note')}:</span>{' '}
                                {row.admin_note}
                              </p>
                            )}

                            {links.length > 0 && (
                              <p className="mt-2 flex flex-wrap gap-2 text-xs">
                                {(match?.admissions ?? []).map((application) => (
                                  <Link
                                    key={`a${application.id}`}
                                    href={`/admin/applications?id=${application.id}`}
                                    className="rounded-orbit border border-line px-2 py-0.5 text-ink hover:bg-surface-2"
                                  >
                                    {t.t('ainq.match_application', {
                                      no: application.application_no ?? `#${application.id}`,
                                    })}
                                  </Link>
                                ))}
                                {(match?.students ?? []).map((student) => (
                                  <Link
                                    key={`s${student.id}`}
                                    href={`/admin/students/${student.id}`}
                                    className="rounded-orbit border border-line px-2 py-0.5 text-ink hover:bg-surface-2"
                                  >
                                    {t.t(
                                      student.via === 'guardian'
                                        ? 'ainq.match_guardian'
                                        : 'ainq.match_student',
                                      {
                                        name: student.name,
                                        id: student.student_id_no ?? `#${student.id}`,
                                      }
                                    )}
                                  </Link>
                                ))}
                              </p>
                            )}

                            <p className="mt-1 text-xs text-ink-muted">
                              {[
                                followUp !== ''
                                  ? `${t.t('ainq.col_follow_up')}: ${t.date(row.follow_up_date!, 'd M Y')}`
                                  : '',
                                row.called_at
                                  ? t.t('ainq.called_on', { date: t.date(row.called_at, 'd M Y') })
                                  : '',
                                row.admitted_at
                                  ? t.t('ainq.admitted_on', {
                                      date: t.date(row.admitted_at, 'd M Y'),
                                    })
                                  : '',
                              ]
                                .filter((part) => part !== '')
                                .join(' · ')}
                            </p>
                          </div>
                        </div>

                        <InquiryActions
                          inquiryId={row.id}
                          name={row.name}
                          status={row.status}
                          note={row.admin_note ?? ''}
                          followUp={followUp}
                          links={links}
                          labels={{
                            manage: t.t('ainq.manage'),
                            title: t.t('ainq.manage_title', { name: '{name}' }),
                            note: t.t('ainq.note'),
                            notePlaceholder: t.t('ainq.note_ph'),
                            followUp: t.t('ainq.follow_up'),
                            followUpHint: t.t('ainq.follow_up_hint'),
                            link: t.t('ainq.link'),
                            linkNone: t.t('ainq.link_none'),
                            called: t.t('ainq.btn_called'),
                            admitted: t.t('ainq.btn_admitted'),
                            notInterested: t.t('ainq.btn_not_interested'),
                            reopen: t.t('ainq.btn_reopen'),
                            noteOnly: t.t('ainq.btn_note'),
                            remove: t.t('common.delete'),
                            deleteConfirm: t.t('ainq.delete_confirm'),
                            cancel: t.t('common.cancel'),
                            close: t.t('common.close'),
                          }}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}

              {pager.totalPages > 1 && (
                <CardBody>
                  <Pagination
                    page={pager.page}
                    totalPages={pager.totalPages}
                    hrefFor={(page) => {
                      const query = inquiryQuery(filters, page > 1 ? { page: String(page) } : {});
                      return `/admin/inquiries${query !== '' ? `?${query}` : ''}`;
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
            </Card>

            <Card>
              <CardHeader
                title={t.t('ainq.settings_title')}
                subtitle={t.t('ainq.settings_sub')}
                icon="bi-envelope-at"
              />
              <CardBody>
                <NotifyEmailForm
                  email={notifyEmail}
                  labels={{
                    label: t.t('ainq.notify_email'),
                    hint:
                      instituteEmail !== ''
                        ? t.t('ainq.notify_hint', { email: instituteEmail })
                        : t.t('ainq.notify_hint_none'),
                    save: t.t('ainq.settings_save'),
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
