import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback';
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { getLang, translate } from '@/lib/i18n';
import { activeBranchId, branchesEnabled } from '@/lib/branch/active';
import { branchStats, branchList } from '@/lib/branch/stats';
import { startOf } from '@/lib/classes/data';
import {
  dashboardCounts,
  attendanceToday,
  moneySummary,
  mailHealth,
  pendingAdmissions,
  classesToday,
  recentMonthlyExams,
  recentPayments,
  recentNotices,
  dashboardReviews,
  monthWindow,
  todayDate,
} from '@/lib/admin/dashboard';
import { ReviewRow } from './ReviewRow';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'adash.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * The admin dashboard, from admin/index.php.
 *
 * The day at a glance: what is waiting, today's register and classes, the
 * month's money, and review moderation — the one place a student review becomes
 * visible on the public website.
 *
 * Everything follows the branch the admin is focused on, and a branch-locked
 * admin is always on their own. The branch comparison table is therefore shown
 * only to an all-branch admin; there is nothing for a locked one to compare.
 */
export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ reviews?: string }>;
}) {
  const params = await searchParams;

  return (
    <AdminPage active="dashboard" route="/admin" title="">
      {async ({ t }) => {
        const branchId = await activeBranchId();
        const showAllReviews = params.reviews === 'all';

        const [counts, attendance, money, mail, pending, classes, exams, payments, notices, reviews] =
          await Promise.all([
            dashboardCounts(branchId),
            attendanceToday(branchId),
            moneySummary(branchId),
            mailHealth(),
            pendingAdmissions(branchId),
            classesToday(branchId),
            recentMonthlyExams(branchId),
            recentPayments(branchId),
            recentNotices(branchId),
            dashboardReviews(showAllReviews),
          ]);

        // Only an all-branch admin on a multi-branch install compares branches.
        const multiBranch = await branchesEnabled();
        const { start, next } = monthWindow();
        const perBranch =
          multiBranch && branchId === 0 ? await branchStats(start, next, todayDate()) : null;
        const branches = perBranch ? await branchList() : [];

        const tiles = [
          {
            href: '/admin/students',
            icon: 'bi-people',
            tone: 'bg-primary/10 text-primary',
            value: t.digits(counts.studentsActive),
            label: t.t('adash.stat_students'),
            sub: t.t('adash.stat_students_sub', { count: t.digits(counts.studentsTotal) }),
          },
          {
            href: '/admin/applications?state=pending',
            icon: 'bi-person-check',
            tone: 'bg-amber-500/10 text-amber-600',
            value: t.digits(counts.pendingApps),
            label: t.t('adash.stat_pending'),
            sub: t.t('adash.stat_pending_sub'),
          },
          {
            href: '/admin/courses',
            icon: 'bi-journal-bookmark',
            tone: 'bg-sky-500/10 text-sky-600',
            value: t.digits(counts.coursesActive),
            label: t.t('adash.stat_courses'),
            sub: t.t('adash.stat_courses_sub', { count: t.digits(counts.batchesActive) }),
          },
          {
            href: '/admin/attendance',
            icon: 'bi-calendar-check',
            tone: 'bg-emerald-500/10 text-emerald-600',
            value:
              attendance.rate === null
                ? t.t('adash.stat_attendance_none')
                : `${t.number(attendance.rate, 0)}%`,
            label: t.t('adash.stat_attendance'),
            sub: t.t('adash.stat_attendance_sub', { count: t.digits(attendance.total) }),
          },
          {
            href: '/admin/payment-tracking',
            icon: 'bi-cash-stack',
            tone: 'bg-emerald-500/10 text-emerald-600',
            value: t.money(money.collectedMonth),
            label: t.t('adash.stat_collected'),
            sub: t.t('adash.stat_collected_sub', { count: t.digits(money.collectedCount) }),
          },
          {
            href: '/admin/fees',
            icon: 'bi-alarm',
            tone: 'bg-red-500/10 text-red-600',
            value: t.money(money.duesTotal),
            label: t.t('adash.stat_due'),
            sub: t.t('adash.stat_due_sub', { count: t.digits(money.duesStudents) }),
          },
        ];

        // The queue of things that actually need a decision today. An entry
        // appears only when it has something in it.
        const todos = [
          counts.newInquiries > 0 && {
            href: '/admin/inquiries?status=new',
            icon: 'bi-telephone-inbound',
            tone: 'text-emerald-700 dark:text-emerald-400',
            text: t.t('adash.todo_inquiries', { count: t.digits(counts.newInquiries) }),
          },
          money.overdueTotal > 0 && {
            href: '/admin/fees?overdue=1',
            icon: 'bi-alarm',
            tone: 'text-red-600',
            text: t.t('adash.todo_overdue', {
              amount: t.money(money.overdueTotal),
              count: t.digits(money.overdueStudents),
            }),
          },
          counts.pendingEval > 0 && {
            href: '/admin/exam-evaluation',
            icon: 'bi-clipboard-check',
            tone: 'text-amber-600',
            text: t.t('adash.todo_eval', { count: t.digits(counts.pendingEval) }),
          },
          counts.draftExams > 0 && {
            href: '/admin/monthly-exams',
            icon: 'bi-clipboard-data',
            tone: 'text-sky-600',
            text: t.t('adash.todo_drafts', { count: t.digits(counts.draftExams) }),
          },
          counts.pendingReviews > 0 && {
            href: '#reviews',
            icon: 'bi-chat-square-quote',
            tone: 'text-ink',
            text: t.t('adash.todo_reviews', { count: t.digits(counts.pendingReviews) }),
          },
        ].filter(Boolean) as { href: string; icon: string; tone: string; text: string }[];

        const attendanceBars = [
          { key: 'present', value: attendance.present, cls: 'bg-emerald-500' },
          { key: 'late', value: attendance.late, cls: 'bg-amber-500' },
          { key: 'half_day', value: attendance.half_day, cls: 'bg-sky-500' },
          { key: 'absent', value: attendance.absent, cls: 'bg-red-500' },
        ];

        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-ink-heading">{t.t('adash.title')}</h1>
              <p className="mt-1 text-sm text-ink-muted">
                {t.t('adash.sub', { date: t.date(new Date(), 'l, d M Y') })}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/admin/applications?state=pending"
                className="inline-flex items-center gap-2 rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
              >
                <i className="bi bi-person-check" aria-hidden />
                {t.t('adash.btn_enrollments')}
              </Link>
              <Link
                href="/admin/attendance"
                className="inline-flex items-center gap-2 rounded-orbit border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
              >
                <i className="bi bi-calendar-check" aria-hidden />
                {t.t('adash.btn_attendance')}
              </Link>
              <Link
                href="/admin/monthly-exams"
                className="inline-flex items-center gap-2 rounded-orbit border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
              >
                <i className="bi bi-clipboard-data" aria-hidden />
                {t.t('adash.btn_marks')}
              </Link>
            </div>

            {todos.length > 0 && (
              <div className="flex flex-wrap gap-3 rounded-orbit border border-line bg-surface p-4">
                {todos.map((todo) => (
                  <Link
                    key={todo.text}
                    href={todo.href}
                    className={`inline-flex items-center gap-1.5 text-sm font-medium hover:underline ${todo.tone}`}
                  >
                    <i className={`bi ${todo.icon}`} aria-hidden />
                    {todo.text}
                  </Link>
                ))}
              </div>
            )}

            {/* Email being off is worth saying loudly: approvals, results and
                password mails all go silently nowhere until it is set up. */}
            {!mail.configured && (
              <Alert tone="warning" icon="bi-envelope-exclamation">
                <span className="flex flex-wrap items-center gap-3">
                  <span className="flex-1">{t.t('adash.mail_off')}</span>
                  <Link href="/admin/settings?tab=email" className="font-medium underline">
                    {t.t('adash.mail_off_cta')}
                  </Link>
                </span>
              </Alert>
            )}
            {mail.configured && mail.failed > 0 && (
              <Alert tone="danger" icon="bi-envelope-x">
                <span className="flex flex-wrap items-center gap-3">
                  <span className="flex-1">
                    {t.t('adash.mail_failed', { count: t.digits(mail.failed) })}
                  </span>
                  <Link href="/admin/email-log" className="font-medium underline">
                    {t.t('adash.mail_failed_cta')}
                  </Link>
                </span>
              </Alert>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {tiles.map((tile) => (
                <Link
                  key={tile.label}
                  href={tile.href}
                  className="rounded-orbit border border-line bg-surface p-4 transition hover:-translate-y-0.5 hover:border-primary"
                >
                  <span
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-orbit ${tile.tone}`}
                  >
                    <i className={`bi ${tile.icon}`} aria-hidden />
                  </span>
                  <span className="mt-3 block text-xl font-bold text-ink-heading">{tile.value}</span>
                  <span className="block text-sm text-ink">{tile.label}</span>
                  <span className="mt-0.5 block text-xs text-ink-muted">{tile.sub}</span>
                </Link>
              ))}
            </div>

            {perBranch && branches.length > 0 && (
              <Card>
                <CardHeader
                  title={t.t('abr.dash_title')}
                  icon="bi-diagram-3"
                  actions={
                    <Link href="/admin/branches" className="text-sm font-medium text-primary hover:underline">
                      {t.t('abr.dash_manage')}
                    </Link>
                  }
                />
                <TableWrap>
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>{t.t('admin.nav.branches')}</Th>
                        <Th alignment="center">{t.t('abr.dash_students')}</Th>
                        <Th alignment="center">{t.t('abr.dash_pending')}</Th>
                        <Th alignment="center">{t.t('abr.dash_new')}</Th>
                        <Th alignment="center">{t.t('abr.dash_batches')}</Th>
                        <Th alignment="center">{t.t('abr.dash_attendance')}</Th>
                        <Th alignment="end">{t.t('abr.dash_collected')}</Th>
                        <Th alignment="end" />
                      </Tr>
                    </Thead>
                    <Tbody>
                      {branches.map((branch) => {
                        const stat = perBranch.get(branch.id);
                        if (!stat) return null;
                        const rate =
                          stat.attMarked > 0
                            ? `${t.number((stat.attPresent / stat.attMarked) * 100, 0)}%`
                            : '—';
                        return (
                          <Tr key={branch.id}>
                            <Td>
                              <span className="font-medium text-ink">
                                {t.pickPair(branch, 'name')}
                              </span>
                            </Td>
                            <Td alignment="center" numeric>
                              {t.digits(stat.active)}
                              <span className="block text-xs text-ink-muted">
                                {t.t('abr.dash_active')}: {t.digits(stat.students)}
                              </span>
                            </Td>
                            <Td alignment="center" numeric>
                              {t.digits(stat.pending)}
                            </Td>
                            <Td alignment="center" numeric>
                              {t.digits(stat.admissionsMonth)}
                            </Td>
                            <Td alignment="center" numeric>
                              {t.digits(stat.batches)}
                            </Td>
                            <Td alignment="center" numeric>
                              {rate}
                            </Td>
                            <Td alignment="end" numeric>
                              {t.money(stat.collected)}
                            </Td>
                            <Td alignment="end">
                              {/* `?branch=` is the reserved parameter middleware
                                  turns into the focus cookie. */}
                              <Link
                                href={`/admin?branch=${branch.id}`}
                                className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                              >
                                {t.t('abr.dash_open')}
                              </Link>
                            </Td>
                          </Tr>
                        );
                      })}
                    </Tbody>
                  </Table>
                </TableWrap>
              </Card>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader title={t.t('adash.pending_title')} icon="bi-person-check" />
                {pending.length === 0 ? (
                  <CardBody className="text-sm text-ink-muted">
                    {t.t('adash.pending_empty')}
                  </CardBody>
                ) : (
                  <TableWrap>
                    <Table>
                      <Thead>
                        <Tr>
                          <Th>{t.t('adash.col_applicant')}</Th>
                          <Th>{t.t('adash.col_course')}</Th>
                          <Th>{t.t('adash.col_payment')}</Th>
                          <Th alignment="end" />
                        </Tr>
                      </Thead>
                      <Tbody>
                        {pending.map((row) => (
                          <Tr key={row.id}>
                            <Td>
                              <span className="font-medium text-ink">
                                {t.pick(row, 'fullname')}
                              </span>
                              <span className="block text-xs text-ink-muted">
                                {row.application_no ?? ''}
                              </span>
                            </Td>
                            <Td className="text-xs">
                              {row.course}
                              {row.batch_label && (
                                <span className="block text-ink-muted">{row.batch_label}</span>
                              )}
                            </Td>
                            <Td className="text-xs">
                              {row.payment_method ? (
                                <>
                                  {t.money(Number(row.payment_amount ?? 0))}
                                  <span className="block text-ink-muted">{row.payment_method}</span>
                                </>
                              ) : (
                                <span className="text-ink-muted">{t.t('adash.pay_later')}</span>
                              )}
                            </Td>
                            <Td alignment="end">
                              <Link
                                href={`/admin/applications?state=pending&q=${encodeURIComponent(
                                  row.application_no ?? row.fullname
                                )}`}
                                className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                              >
                                {t.t('adash.review')}
                              </Link>
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </TableWrap>
                )}
              </Card>

              <Card>
                <CardHeader title={t.t('adash.today_title')} icon="bi-calendar-day" />
                <CardBody className="space-y-5">
                  <div>
                    <h3 className="text-sm font-semibold text-ink-heading">
                      {t.t('adash.att_title')}
                    </h3>
                    {attendance.total === 0 ? (
                      <p className="mt-1 text-sm text-ink-muted">{t.t('adash.att_none')}</p>
                    ) : (
                      <>
                        <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-surface-2">
                          {attendanceBars.map((bar) => (
                            <span
                              key={bar.key}
                              className={bar.cls}
                              style={{ width: `${(bar.value / attendance.total) * 100}%` }}
                            />
                          ))}
                        </div>
                        <p className="mt-2 text-sm font-medium text-ink">
                          {t.t('adash.att_rate', { rate: t.number(attendance.rate ?? 0, 0) })}
                        </p>
                      </>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href="/admin/attendance"
                        className="rounded-orbit bg-primary px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary-hover"
                      >
                        {t.t('adash.att_take')}
                      </Link>
                      <Link
                        href="/admin/attendance-report"
                        className="rounded-orbit border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-2"
                      >
                        {t.t('adash.att_report')}
                      </Link>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-ink-heading">
                      {t.t('adash.classes_title')}
                    </h3>
                    {classes.length === 0 ? (
                      <p className="mt-1 text-sm text-ink-muted">{t.t('adash.classes_none')}</p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {classes.map((row) => (
                          <li key={row.id} className="text-sm">
                            <span className="font-medium text-ink">{row.subject}</span>
                            <span className="block text-xs text-ink-muted">
                              {t.date(new Date(startOf(row.class_date, row.start_time)), 'h:i A')}
                              {' · '}
                              {t.t('adash.class_mins', { count: t.digits(row.duration_minutes) })}
                              {row.teacher_name ? ` · ${row.teacher_name}` : ''}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardHeader title={t.t('adash.exams_title')} icon="bi-clipboard-data" />
                {exams.length === 0 ? (
                  <CardBody className="text-sm text-ink-muted">{t.t('adash.exams_none')}</CardBody>
                ) : (
                  <ul className="divide-y divide-line-soft">
                    {exams.map((exam) => (
                      <li
                        key={exam.id}
                        className="flex items-center justify-between gap-3 px-5 py-3"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink">
                            {t.pick(exam, 'title')}
                          </span>
                          <span className="block text-xs text-ink-muted">
                            {t.monthLabel(exam.exam_month)}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <Badge tone={exam.status === 'published' ? 'success' : 'neutral'}>
                            {t.t(exam.status === 'published' ? 'status.published' : 'oex.state_draft')}
                          </Badge>
                          <Link
                            href={`/admin/monthly-exams/${exam.id}/marks`}
                            className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                          >
                            {t.t('adash.generate')}
                          </Link>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card>
                <CardHeader title={t.t('adash.payments_title')} icon="bi-receipt" />
                {payments.length === 0 ? (
                  <CardBody className="text-sm text-ink-muted">
                    {t.t('adash.payments_none')}
                  </CardBody>
                ) : (
                  <ul className="divide-y divide-line-soft">
                    {payments.map((row) => (
                      <li
                        key={row.id}
                        className="flex items-center justify-between gap-3 px-5 py-3"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink">
                            {row.student ? t.pick(row.student, 'name') : ''}
                          </span>
                          <span className="block text-xs text-ink-muted">
                            {row.payment_month} · {row.payment_method}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold text-ink">
                          {t.money(Number(row.amount))}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <Card id="reviews">
              <CardHeader
                title={t.t('adash.reviews_title')}
                subtitle={t.t('adash.reviews_sub')}
                icon="bi-chat-square-quote"
              />
              {reviews.rows.length === 0 ? (
                <EmptyState
                  icon="bi-chat-square"
                  title={t.t('adash.reviews_none')}
                  body={t.t('adash.reviews_sub')}
                />
              ) : (
                <>
                  <ul className="divide-y divide-line-soft">
                    {reviews.rows.map((review) => (
                      <li key={review.id} className="px-5 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-ink-heading">{review.name}</span>
                              <span
                                className="text-sm text-amber-500"
                                title={t.t('adash.rating', { rating: t.digits(review.rating) })}
                              >
                                {'★'.repeat(Math.max(0, Math.min(5, review.rating)))}
                                <span className="sr-only">
                                  {t.t('adash.rating', { rating: t.digits(review.rating) })}
                                </span>
                              </span>
                              <Badge tone={review.status === 'approved' ? 'success' : 'neutral'}>
                                {t.t(
                                  review.status === 'approved'
                                    ? 'adash.status_live'
                                    : 'adash.status_hidden'
                                )}
                              </Badge>
                            </p>
                            <p className="mt-1 text-sm text-ink">{review.feedback}</p>
                            <p className="mt-1 text-xs text-ink-muted">
                              {review.course_name} · {t.date(review.created_at, 'd M Y')}
                            </p>
                          </div>

                          <ReviewRow
                            reviewId={review.id}
                            status={review.status ?? 'pending'}
                            labels={{
                              approve: t.t('adash.approve'),
                              hide: t.t('adash.hide'),
                              remove: t.t('common.delete'),
                              confirmDelete: t.t('adash.review_delete_confirm'),
                              dismiss: t.t('common.cancel'),
                            }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>

                  {reviews.total > reviews.rows.length || showAllReviews ? (
                    <CardBody className="border-t border-line-soft text-sm">
                      <Link
                        href={showAllReviews ? '/admin#reviews' : '/admin?reviews=all#reviews'}
                        className="font-medium text-primary hover:underline"
                      >
                        {showAllReviews
                          ? t.t('adash.reviews_less')
                          : t.t('adash.reviews_all', { count: t.digits(reviews.total) })}
                      </Link>
                    </CardBody>
                  ) : null}
                </>
              )}
            </Card>

            <Card>
              <CardHeader
                title={t.t('adash.notices_title')}
                icon="bi-bell"
                actions={
                  <Link href="/admin/notices" className="text-sm font-medium text-primary hover:underline">
                    {t.t('adash.notices_manage')}
                  </Link>
                }
              />
              {notices.length === 0 ? (
                <CardBody className="text-sm text-ink-muted">{t.t('adash.notices_none')}</CardBody>
              ) : (
                <ul className="divide-y divide-line-soft">
                  {notices.map((notice) => (
                    <li key={notice.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <span className="min-w-0 truncate text-sm font-medium text-ink">
                        {notice.title}
                      </span>
                      <span className="shrink-0 text-xs text-ink-muted">
                        {t.date(notice.created_at, 'd M Y')}
                      </span>
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
