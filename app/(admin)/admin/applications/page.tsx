import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback';
import { getLang, translate } from '@/lib/i18n';
import { pageHref } from '@/lib/paginate';
import { applicantPhotoUrl, paymentScreenshotUrl } from '@/lib/storage/url';
import { formatPhone, telHref } from '@/lib/site/url';
import { publicCourses } from '@/lib/site/courses';
import { applicationList, applicationSummary, type EnrollmentState } from '@/lib/enrollment/list';
import { ApplicationActions } from './ApplicationCard';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'admin.apps.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * The enrollment verification queue, from admin/applications.php.
 *
 * **Nothing here verifies a payment automatically.** What the applicant submitted
 * is a claim; the screen's job is to put the claim, the screenshot and the
 * expected fee side by side so a human can compare them with the bKash/Nagad
 * statement. The banner says so, and the approve panel makes the admin tick a box
 * to that effect.
 *
 * Two warnings earn their prominence: a transaction id that appears on another
 * application, and an amount that does not match the fee.
 */
export default async function AdminApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    state?: string;
    q?: string;
    method?: string;
    course?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;

  return (
    <AdminPage active="applications" route="/admin/applications" title="">
      {async ({ t }) => {
        const state: EnrollmentState = (['pending', 'approved', 'rejected', 'all'] as const).includes(
          params.state as EnrollmentState
        )
          ? (params.state as EnrollmentState)
          : 'pending';

        const search = (params.q ?? '').trim();
        const method = params.method ?? '';
        const courseId = /^\d+$/.test(params.course ?? '') ? Number(params.course) : 0;
        const from = params.from ?? '';
        const to = params.to ?? '';

        const [list, summary, courses] = await Promise.all([
          applicationList({
            state,
            search,
            method,
            courseId,
            from,
            to,
            page: Number(params.page ?? 1),
          }),
          applicationSummary(),
          publicCourses(),
        ]);

        const query = {
          state,
          q: search || undefined,
          method: method || undefined,
          course: courseId > 0 ? String(courseId) : undefined,
          from: from || undefined,
          to: to || undefined,
        };

        const tabs: { key: EnrollmentState; label: string; count: number }[] = [
          { key: 'pending', label: t.t('admin.apps.tab_pending'), count: summary.tabs.pending },
          { key: 'approved', label: t.t('admin.apps.tab_approved'), count: summary.tabs.approved },
          { key: 'rejected', label: t.t('admin.apps.tab_rejected'), count: summary.tabs.rejected },
          { key: 'all', label: t.t('admin.apps.tab_all'), count: summary.tabs.all },
        ];

        const statusTone = (status: string) =>
          status === 'approved'
            ? 'success'
            : status === 'rejected' || status === 'payment_rejected'
              ? 'danger'
              : status === 'payment_verified'
                ? 'info'
                : 'warning';

        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-ink-heading">{t.t('admin.apps.title')}</h1>
              <p className="mt-1 text-sm text-ink-muted">{t.t('admin.apps.subtitle')}</p>
            </div>

            {/* Said once at the top of the page, every time. */}
            <Alert tone="warning" icon="bi-shield-exclamation">
              {t.t('admin.apps.warning')}
            </Alert>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-orbit border border-line bg-surface p-4">
                <span className="block text-xl font-bold text-ink-heading">
                  {t.digits(summary.tabs.pending)}
                </span>
                <span className="block text-sm text-ink-muted">{t.t('admin.apps.stat_pending')}</span>
              </div>
              <div className="rounded-orbit border border-line bg-surface p-4">
                <span className="block text-xl font-bold text-ink-heading">
                  {t.digits(summary.approvedMonth)}
                </span>
                <span className="block text-sm text-ink-muted">
                  {t.t('admin.apps.stat_approved_month')}
                </span>
              </div>
              <div className="rounded-orbit border border-line bg-surface p-4">
                <span className="block text-xl font-bold text-ink-heading">
                  {t.money(summary.collectedMonth)}
                </span>
                <span className="block text-sm text-ink-muted">
                  {t.t('admin.apps.stat_collected_month')}
                </span>
              </div>
              <div className="rounded-orbit border border-line bg-surface p-4">
                <span className="block text-xl font-bold text-ink-heading">
                  {t.digits(summary.tabs.rejected)}
                </span>
                <span className="block text-sm text-ink-muted">{t.t('admin.apps.stat_rejected')}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {tabs.map((tab) => (
                <Link
                  key={tab.key}
                  href={`/admin/applications?state=${tab.key}`}
                  className={`inline-flex items-center gap-2 rounded-orbit px-3 py-1.5 text-sm font-medium transition ${
                    tab.key === state
                      ? 'bg-primary text-white'
                      : 'border border-line text-ink hover:bg-surface-2'
                  }`}
                >
                  {tab.label}
                  <span
                    className={`rounded-full px-1.5 text-xs ${
                      tab.key === state ? 'bg-white/20' : 'bg-surface-2'
                    }`}
                  >
                    {t.digits(tab.count)}
                  </span>
                </Link>
              ))}
            </div>

            <Card>
              <form method="get" className="flex flex-wrap items-end gap-3 px-5 py-4">
                <input type="hidden" name="state" value={state} />

                <label className="flex flex-1 flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('common.search')}</span>
                  <input
                    type="search"
                    name="q"
                    defaultValue={search}
                    placeholder={t.t('admin.apps.search_ph')}
                    className="w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('admin.apps.f_method')}</span>
                  <select
                    name="method"
                    defaultValue={method}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="">{t.t('common.all')}</option>
                    <option value="bkash">{t.t('apay.method_bkash')}</option>
                    <option value="nagad">{t.t('apay.method_nagad')}</option>
                    <option value="none">{t.t('admin.apps.no_payment_short')}</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('common.course')}</span>
                  <select
                    name="course"
                    defaultValue={String(courseId)}
                    className="max-w-xs rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="0">{t.t('common.all')}</option>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {t.pick(course, 'name')}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('lcl.date_from')}</span>
                  <input
                    type="date"
                    name="from"
                    defaultValue={from}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('lcl.date_to')}</span>
                  <input
                    type="date"
                    name="to"
                    defaultValue={to}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  />
                </label>

                <button
                  type="submit"
                  className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                >
                  {t.t('common.filter')}
                </button>
                <Link
                  href={`/admin/applications?state=${state}`}
                  className="rounded-orbit border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
                >
                  {t.t('common.clear')}
                </Link>
              </form>
            </Card>

            {list.rows.length === 0 ? (
              <Card>
                <EmptyState
                  icon="bi-inbox"
                  title={t.t(
                    search !== '' || method !== '' || courseId > 0
                      ? 'admin.apps.empty_filtered'
                      : 'admin.apps.empty'
                  )}
                  body={t.t('admin.apps.subtitle')}
                />
              </Card>
            ) : (
              <div className="space-y-4">
                {list.rows.map((row) => {
                  const amount = Number(row.payment_amount ?? 0);
                  const shortfall = row.fee !== null ? row.fee - amount : 0;
                  const screenshot = paymentScreenshotUrl(row);
                  const photo = applicantPhotoUrl(row);

                  return (
                    <Card key={row.id}>
                      <CardHeader
                        title={t.pick(row, 'fullname')}
                        subtitle={[row.application_no, row.course, row.batchName]
                          .filter(Boolean)
                          .join(' · ')}
                        icon="bi-person-lines-fill"
                        actions={
                          <span className="flex flex-wrap items-center gap-2">
                            <Badge tone={statusTone(row.status)}>{t.t(`appstatus.${row.status}`)}</Badge>
                            {row.applicant_student_id !== null && (
                              <Badge tone="info">{t.t('admin.apps.signed_in')}</Badge>
                            )}
                          </span>
                        }
                      />

                      <CardBody className="space-y-4">
                        {row.trxDupes > 0 && (
                          <Alert tone="danger" icon="bi-exclamation-triangle-fill">
                            {t.t('admin.apps.trx_duplicate', { n: t.digits(row.trxDupes) })}
                          </Alert>
                        )}

                        <div className="grid gap-5 lg:grid-cols-3">
                          <div className="space-y-1.5 text-sm">
                            <p className="text-xs font-semibold uppercase text-ink-muted">
                              {t.t('admin.apps.applicant')}
                            </p>
                            <p className="flex items-center gap-2">
                              {photo !== '' && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={photo}
                                  alt=""
                                  className="h-10 w-10 rounded-full border border-line-soft object-cover"
                                />
                              )}
                              <span>
                                <a href={telHref(row.mobile)} className="block hover:underline">
                                  {formatPhone(row.mobile)}
                                </a>
                                {row.email && (
                                  <a
                                    href={`mailto:${row.email}`}
                                    className="block text-xs text-ink-muted hover:underline"
                                  >
                                    {row.email}
                                  </a>
                                )}
                              </span>
                            </p>
                            {row.guardian_phone && (
                              <p className="text-xs text-ink-muted">
                                {t.t('admin.apps.guardian')}: {formatPhone(row.guardian_phone)}
                              </p>
                            )}
                            {row.institution && (
                              <p className="text-xs text-ink-muted">
                                {t.t('admin.apps.institution')}: {row.institution}
                              </p>
                            )}
                            {row.date_of_birth && (
                              <p className="text-xs text-ink-muted">
                                {t.t('admin.apps.dob')}: {t.date(row.date_of_birth, 'd M Y')}
                              </p>
                            )}
                            <p className="text-xs text-ink-muted">
                              {t.t('admin.apps.submitted', {
                                date: t.date(row.created_at, 'd M Y, h:i A'),
                              })}
                            </p>
                            {row.status === 'approved' && row.approved_at && (
                              <p className="text-xs text-emerald-700 dark:text-emerald-400">
                                {t.t('admin.apps.approved_on', {
                                  date: t.date(row.approved_at, 'd M Y'),
                                })}
                              </p>
                            )}
                            {row.rejected_at && (
                              <p className="text-xs text-red-600">
                                {t.t('admin.apps.rejected_on', {
                                  date: t.date(row.rejected_at, 'd M Y'),
                                })}
                              </p>
                            )}
                            {row.studentIdNo && (
                              <p className="text-xs">
                                {t.t('admin.apps.student_id_given')}:{' '}
                                <code className="rounded bg-surface-2 px-1.5 py-0.5">
                                  {row.studentIdNo}
                                </code>
                              </p>
                            )}
                          </div>

                          <div className="space-y-1.5 text-sm">
                            <p className="text-xs font-semibold uppercase text-ink-muted">
                              {t.t('admin.apps.payment')}
                            </p>
                            {row.payment_method ? (
                              <>
                                <p className="text-lg font-bold text-ink-heading">
                                  {t.money(amount)}
                                </p>
                                <p>{t.t(`apay.method_${row.payment_method}`)}</p>
                                {row.transaction_id && (
                                  <p className="break-all font-mono text-xs">{row.transaction_id}</p>
                                )}
                                {row.sender_number && (
                                  <p className="text-xs text-ink-muted">
                                    {t.t('admin.apps.sender')}: {formatPhone(row.sender_number)}
                                  </p>
                                )}
                                {row.fee !== null && (
                                  <p className="text-xs">
                                    {t.t('admin.apps.batch_fee')}: {t.money(row.fee)}
                                    <span
                                      className={`ms-2 ${
                                        shortfall > 0
                                          ? 'text-red-600'
                                          : shortfall < 0
                                            ? 'text-amber-600'
                                            : 'text-emerald-700 dark:text-emerald-400'
                                      }`}
                                    >
                                      {shortfall > 0
                                        ? t.t('admin.apps.amount_less', {
                                            amount: t.money(shortfall),
                                          })
                                        : shortfall < 0
                                          ? t.t('admin.apps.amount_more', {
                                              amount: t.money(-shortfall),
                                            })
                                          : t.t('admin.apps.amount_ok')}
                                    </span>
                                  </p>
                                )}
                              </>
                            ) : (
                              <p className="text-ink-muted">{t.t('admin.apps.no_payment')}</p>
                            )}
                          </div>

                          <div className="space-y-2 text-sm">
                            <p className="text-xs font-semibold uppercase text-ink-muted">
                              {t.t('admin.apps.screenshot')}
                            </p>
                            {screenshot !== '' ? (
                              <>
                                {/* Served only through the media route, which
                                    authorises by record id. */}
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={screenshot}
                                  alt={t.t('admin.apps.screenshot')}
                                  className="max-h-44 w-full rounded-orbit border border-line-soft object-contain"
                                />
                                <span className="flex gap-2">
                                  <a
                                    href={screenshot}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                                  >
                                    {t.t('admin.apps.open_full')}
                                  </a>
                                  <a
                                    href={`${screenshot}?download=1`}
                                    className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                                  >
                                    {t.t('admin.apps.download')}
                                  </a>
                                </span>
                              </>
                            ) : (
                              <p className="text-ink-muted">{t.t('admin.apps.no_screenshot')}</p>
                            )}
                          </div>
                        </div>

                        {row.review_note && (
                          <p className="rounded-orbit bg-surface-2 p-3 text-sm text-ink">
                            <span className="font-medium">{t.t('admin.apps.note')}:</span>{' '}
                            {row.review_note}
                          </p>
                        )}

                        <a
                          href={`/admission-print?id=${row.id}`}
                          target="_blank"
                          rel="noopener"
                          className="inline-flex items-center gap-1.5 rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                        >
                          <i className="bi bi-printer" aria-hidden />
                          {t.t('admin.apps.print')}
                        </a>

                        <ApplicationActions
                          applicationId={row.id}
                          applicantName={row.fullname}
                          status={row.status}
                          note={row.review_note ?? ''}
                          canDelete={row.status !== 'approved'}
                          labels={{
                            approve: t.t('admin.apps.approve'),
                            approveTitle: t.t('admin.apps.approve_title'),
                            approveText: t.t('admin.apps.approve_text', { name: '{name}' }),
                            approveCheck: t.t('admin.apps.approve_check'),
                            reject: t.t('admin.apps.reject'),
                            rejectTitle: t.t('admin.apps.reject_title'),
                            rejectReason: t.t('admin.apps.reject_reason'),
                            rejectReasonPlaceholder: t.t('admin.apps.reject_reason_ph'),
                            rejectPayment: t.t('admin.apps.reject_payment'),
                            sendEmail: t.t('admin.apps.send_email'),
                            markReview: t.t('admin.apps.mark_review'),
                            markVerified: t.t('admin.apps.mark_verified'),
                            markPending: t.t('admin.apps.mark_pending'),
                            note: t.t('admin.apps.note'),
                            notePlaceholder: t.t('admin.apps.note_ph'),
                            saveNote: t.t('admin.apps.save_note'),
                            delete: t.t('admin.apps.delete'),
                            confirmDelete: t.t('admin.apps.confirm_delete'),
                            cancel: t.t('common.cancel'),
                            credTitle: t.t('admin.apps.cred_title'),
                            credTitleExisting: t.t('admin.apps.cred_title_existing'),
                            credUsername: t.t('admin.apps.cred_username'),
                            credPassword: t.t('admin.apps.cred_password'),
                            credText: t.t('admin.apps.cred_text'),
                            studentIdGiven: t.t('admin.apps.student_id_given'),
                            viewStudent: t.t('admin.apps.view_student'),
                          }}
                        />
                      </CardBody>
                    </Card>
                  );
                })}

                {list.pager.totalPages > 1 && (
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-ink-muted">
                      {t.t('astd.showing', {
                        from: t.digits(list.pager.from),
                        to: t.digits(list.pager.to),
                        total: t.digits(list.pager.total),
                      })}
                    </span>
                    <span className="flex gap-2">
                      {list.pager.page > 1 && (
                        <Link
                          href={pageHref('/admin/applications', query, list.pager.page - 1)}
                          className="rounded-orbit border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-2"
                        >
                          {t.t('common.previous')}
                        </Link>
                      )}
                      {list.pager.page < list.pager.totalPages && (
                        <Link
                          href={pageHref('/admin/applications', query, list.pager.page + 1)}
                          className="rounded-orbit border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-2"
                        >
                          {t.t('common.next')}
                        </Link>
                      )}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      }}
    </AdminPage>
  );
}
