import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { getLang, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { whatsappUrl } from '@/lib/site/url';
import { Pagination } from '@/components/ui/Pagination';
import { paginate, pageHref } from '@/lib/paginate';
import {
  FEE_METHODS,
  feeMethodLabel,
  feeLabel,
  feeMonth,
  feeDueDay,
  feeGapDays,
  rowState,
} from '@/lib/fees/core';
import { duesFilters, duesRows, duesSummary, studentDueItems } from '@/lib/fees/dues';
import { monthlyPreview } from '@/lib/fees/monthly';
import { planList } from '@/lib/fees/plans';
import { discountList, discountText } from '@/lib/fees/discounts';
import {
  CollectForm,
  GenerateConfirmForm,
  PlanForm,
  CancelPlanButton,
  DiscountForm,
  DiscountRowActions,
  FeeSettingsForm,
} from './FeeForms';
import { ReminderSender } from './Reminders';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'fees.title'),
    robots: { index: false, follow: false },
  };
}

type Tab = 'dues' | 'generate' | 'plans' | 'discounts';

/**
 * The fee hub, from admin/fees.php.
 *
 * Five views over the same money: who owes it (and the reminders that chase it),
 * one student's items with the collect form, raising a month's fees, instalment
 * plans, and discounts.
 *
 * **Super admins only** — `level="super"` — because fees are institute-wide and a
 * branch-restricted admin must not see another branch's money.
 */
export default async function AdminFeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  return (
    <AdminPage active="fees" route="/admin/fees" level="super" title="">
      {async ({ t }) => {
        const studentId = /^\d+$/.test(params.student ?? '') ? Number(params.student) : 0;
        const tab: Tab = (['dues', 'generate', 'plans', 'discounts'] as const).includes(
          params.tab as Tab
        )
          ? (params.tab as Tab)
          : 'dues';

        const [gapDays, dueDay] = await Promise.all([feeGapDays(), feeDueDay()]);

        const methods = FEE_METHODS.map((method) => ({
          value: method,
          label: feeMethodLabel(method, t.lang),
        }));

        const tabs: { key: Tab; label: string; icon: string }[] = [
          { key: 'dues', label: t.t('fees.tab_dues'), icon: 'bi-exclamation-diamond' },
          { key: 'generate', label: t.t('fees.tab_generate'), icon: 'bi-calendar-plus' },
          { key: 'plans', label: t.t('fees.tab_plans'), icon: 'bi-list-ol' },
          { key: 'discounts', label: t.t('fees.tab_discounts'), icon: 'bi-percent' },
        ];

        const header = (
          <div className="space-y-4">
            <div>
              <h1 className="text-2xl font-bold text-ink-heading">{t.t('fees.title')}</h1>
              <p className="mt-1 text-sm text-ink-muted">{t.t('fees.sub')}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {tabs.map((item) => (
                <Link
                  key={item.key}
                  href={`/admin/fees?tab=${item.key}`}
                  className={`inline-flex items-center gap-2 rounded-orbit px-3 py-1.5 text-sm font-medium transition ${
                    item.key === tab && studentId === 0
                      ? 'bg-primary text-white'
                      : 'border border-line text-ink hover:bg-surface-2'
                  }`}
                >
                  <i className={`bi ${item.icon}`} aria-hidden />
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        );

        /* ------------------------------------------------- one student */
        if (studentId > 0) {
          const student = await prisma.student
            .findUnique({
              where: { id: studentId },
              select: {
                id: true,
                name: true,
                name_bn: true,
                student_id_no: true,
                course: true,
                batch: true,
                phone: true,
                guardian_phone: true,
              },
            })
            .catch(() => null);

          if (!student) {
            return (
              <div className="space-y-6">
                {header}
                <Card>
                  <EmptyState
                    icon="bi-person-x"
                    title={t.t('fees.err_student')}
                    body={t.t('fees.sub')}
                  />
                </Card>
              </div>
            );
          }

          const { items, paid, due } = await studentDueItems(student.id);
          const openCharge = /^\d+$/.test(params.charge ?? '') ? Number(params.charge) : 0;

          return (
            <div className="space-y-6">
              {header}

              <Card>
                <CardHeader
                  title={t.pick(student, 'name')}
                  subtitle={[student.student_id_no, student.course, student.batch]
                    .filter(Boolean)
                    .join(' · ')}
                  icon="bi-person-badge"
                  actions={
                    <span className="flex flex-wrap gap-2">
                      <Link
                        href={`/admin/students/${student.id}`}
                        className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                      >
                        {t.t('astd.profile')}
                      </Link>
                      <a
                        href={`/fee-slip?student=${student.id}&mode=download`}
                        className="rounded-orbit border border-primary px-2.5 py-1 text-xs font-medium text-primary transition hover:bg-primary-soft"
                      >
                        <i className="bi bi-file-earmark-pdf me-1" aria-hidden />
                        {t.t('fees.slip_download')}
                      </a>
                      <a
                        href={`/fee-slip?student=${student.id}&mode=print`}
                        target="_blank"
                        rel="noopener"
                        className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                      >
                        {t.t('common.print')}
                      </a>
                      <Link
                        href="/admin/fees"
                        className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                      >
                        {t.t('fees.back_dues')}
                      </Link>
                    </span>
                  }
                />
                <CardBody className="flex flex-wrap gap-6 text-sm">
                  <span>
                    <span className="block text-xs text-ink-muted">{t.t('fees.col_paid')}</span>
                    <span className="text-lg font-bold text-ink-heading">{t.money(paid)}</span>
                  </span>
                  <span>
                    <span className="block text-xs text-ink-muted">{t.t('fees.total_due')}</span>
                    <span className="text-lg font-bold text-ink-heading">{t.money(due)}</span>
                  </span>
                </CardBody>
              </Card>

              <Card>
                <CardHeader title={t.t('fees.due_items')} icon="bi-receipt" />

                {items.length === 0 ? (
                  <CardBody className="text-sm text-ink-muted">{t.t('fees.no_dues')}</CardBody>
                ) : (
                  <ul className="divide-y divide-line-soft">
                    {items.map((item) => (
                      <li key={item.id} className="px-5 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <span className="min-w-0">
                            <span className="font-medium text-ink">{feeLabel(item, t.lang)}</span>
                            <span className="block text-xs text-ink-muted">
                              {[
                                item.due_date
                                  ? t.t('fees.due_by', { date: t.date(item.due_date, 'd M Y') })
                                  : '',
                                t.t(`fees.type_${item.fee_type ?? 'other'}`),
                                rowState(item) === 'partial' ? t.t('status.partial') : '',
                              ]
                                .filter((part) => part !== '')
                                .join(' · ')}
                            </span>
                          </span>

                          <span className="shrink-0 text-end">
                            <span className="block text-sm font-semibold text-ink">
                              {t.money(item.due)}
                            </span>
                          </span>

                          <CollectForm
                            paymentId={item.id}
                            studentId={student.id}
                            due={String(item.due)}
                            methods={methods}
                            labels={{
                              collect: t.t('fees.collect'),
                              collectTitle: t.t('fees.collect_title'),
                              amount: t.t('fees.amount_received'),
                              amountHelp: t.t('fees.amount_help'),
                              method: t.t('astu.f_method'),
                              transaction: t.t('enroll.f_trx'),
                              notes: t.t('astu.f_notes'),
                              save: t.t('fees.collect_save'),
                              cancel: t.t('common.cancel'),
                            }}
                          />
                        </div>
                        {openCharge === item.id && <span id="collect" />}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          );
        }

        /* --------------------------------------------------- dues tab */
        if (tab === 'dues') {
          const filters = duesFilters(params);
          const rows = await duesRows(filters);
          const summary = duesSummary(rows);
          // The totals and the reminder list cover every row; only the table is
          // paged, so a big dues list is not one enormous page.
          const duesPager = paginate(rows.length, 50, params.page);
          const visibleRows = rows.slice(duesPager.offset, duesPager.offset + duesPager.perPage);

          const [courses, batches] = await Promise.all([
            prisma.course
              .findMany({
                orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
                select: { id: true, name: true, name_bn: true },
              })
              .catch(() => []),
            prisma.batch
              .findMany({
                orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
                select: { id: true, name: true, name_bn: true },
              })
              .catch(() => []),
          ]);

          return (
            <div className="space-y-6">
              {header}

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-orbit border border-line bg-surface p-4">
                  <span className="block text-xl font-bold text-ink-heading">
                    {t.money(summary.due)}
                  </span>
                  <span className="block text-sm text-ink-muted">{t.t('fees.stat_due')}</span>
                </div>
                <div className="rounded-orbit border border-line bg-surface p-4">
                  <span className="block text-xl font-bold text-ink-heading">
                    {t.digits(summary.count)}
                  </span>
                  <span className="block text-sm text-ink-muted">{t.t('fees.stat_students')}</span>
                </div>
                <div className="rounded-orbit border border-line bg-surface p-4">
                  <span className="block text-xl font-bold text-red-600">
                    {t.money(summary.overdueDue)}
                  </span>
                  <span className="block text-sm text-ink-muted">
                    {t.t('fees.stat_overdue', { count: t.digits(summary.overdueStudents) })}
                  </span>
                </div>
              </div>

              <Card>
                <form method="get" className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-5">
                  <input type="hidden" name="tab" value="dues" />

                  <label className="flex flex-col gap-1 text-sm lg:col-span-2">
                    <span className="text-ink-muted">{t.t('fees.find_ph')}</span>
                    <input
                      type="search"
                      name="q"
                      defaultValue={filters.search}
                      className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-ink-muted">{t.t('common.course')}</span>
                    <select
                      name="course"
                      defaultValue={String(filters.courseId || 0)}
                      className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                    >
                      <option value="0">{t.t('fees.all_courses')}</option>
                      {courses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {t.pick(course, 'name')}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-ink-muted">{t.t('common.batch')}</span>
                    <select
                      name="batch"
                      defaultValue={String(filters.batchId || 0)}
                      className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                    >
                      <option value="0">{t.t('fees.all_batches')}</option>
                      {batches.map((batch) => (
                        <option key={batch.id} value={batch.id}>
                          {t.pick(batch, 'name')}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex items-end gap-2 pb-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      name="overdue"
                      value="1"
                      defaultChecked={filters.overdue}
                      className="h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
                    />
                    <span>{t.t('fees.overdue_only')}</span>
                  </label>

                  <div className="flex items-end gap-2 sm:col-span-2">
                    <button
                      type="submit"
                      className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                    >
                      {t.t('common.filter')}
                    </button>
                    <Link
                      href="/admin/fees"
                      className="rounded-orbit border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
                    >
                      {t.t('common.clear')}
                    </Link>
                    {summary.count > 0 && (
                      <a
                        href={`/fee-slip?${new URLSearchParams({
                          bulk: '1',
                          ...(filters.search !== '' ? { q: filters.search } : {}),
                          ...(filters.courseId > 0 ? { course: String(filters.courseId) } : {}),
                          ...(filters.batchId > 0 ? { batch: String(filters.batchId) } : {}),
                          ...(filters.overdue ? { overdue: '1' } : {}),
                        })}`}
                        className="ms-auto inline-flex items-center gap-1.5 rounded-orbit border border-primary px-4 py-2 text-sm font-medium text-primary transition hover:bg-primary-soft"
                      >
                        <i className="bi bi-file-earmark-pdf" aria-hidden />
                        {t.t('fees.bulk_slips', { count: t.digits(Math.min(50, summary.count)) })}
                      </a>
                    )}
                  </div>
                </form>
              </Card>

              <Card>
                <CardHeader title={t.t('fees.remind_title')} icon="bi-envelope-paper" />
                <CardBody>
                  <ReminderSender
                    studentIds={rows.map((row) => row.studentId)}
                    gapDays={gapDays}
                    labels={{
                      send: t.t('fees.send_reminders'),
                      running: t.t('fees.remind_running'),
                      stop: t.t('fees.stop'),
                      hint: t.t('fees.remind_hint', { days: '{days}' }),
                      sendAnyway: t.t('fees.send_anyway', { days: '{days}' }),
                      none: t.t('fees.remind_none'),
                      error: t.t('fees.remind_error'),
                      doneMessage: t.t('fees.remind_done', {
                        sent: '{sent}',
                        failed: '{failed}',
                        skipped: '{skipped}',
                      }),
                      stopped: t.t('fees.remind_stopped', {
                        sent: '{sent}',
                        failed: '{failed}',
                        skipped: '{skipped}',
                      }),
                      countSent: t.t('fees.count_sent'),
                      countFailed: t.t('fees.count_failed'),
                      countSkipped: t.t('fees.count_skipped'),
                    }}
                  />
                </CardBody>
              </Card>

              <Card>
                <CardHeader title={t.t('fees.settings_title')} icon="bi-sliders" />
                <CardBody>
                  <FeeSettingsForm
                    gapDays={gapDays}
                    dueDay={dueDay}
                    labels={{
                      gap: t.t('fees.setting_gap'),
                      dueDay: t.t('fees.setting_due_day'),
                      save: t.t('common.save'),
                    }}
                  />
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title={t.t('fees.tab_dues')}
                  icon="bi-exclamation-diamond"
                  actions={<Badge tone="neutral">{t.digits(rows.length)}</Badge>}
                />

                {rows.length === 0 ? (
                  <EmptyState
                    icon="bi-emoji-smile"
                    title={t.t(
                      filters.search !== '' || filters.courseId > 0 || filters.batchId > 0
                        ? 'fees.none_filtered'
                        : 'fees.none_due'
                    )}
                    body={t.t('fees.sub')}
                  />
                ) : (
                  <TableWrap>
                    <Table>
                      <Thead>
                        <Tr>
                          <Th>{t.t('common.student')}</Th>
                          <Th alignment="end">{t.t('fees.col_paid')}</Th>
                          <Th alignment="end">{t.t('fees.col_due')}</Th>
                          <Th>{t.t('fees.col_next_due')}</Th>
                          <Th>{t.t('fees.col_last_reminder')}</Th>
                          <Th alignment="end">{t.t('common.actions')}</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {visibleRows.map((row) => (
                          <Tr key={row.studentId}>
                            <Td>
                              <Link
                                href={`/admin/fees?student=${row.studentId}`}
                                className="font-medium text-ink hover:text-primary"
                              >
                                {t.pick({ name: row.name, name_bn: row.nameBn }, 'name')}
                              </Link>
                              <span className="block text-xs text-ink-muted">
                                {[row.studentIdNo ?? '', row.course, row.batch ?? '']
                                  .filter((part) => part !== '')
                                  .join(' · ')}
                              </span>
                            </Td>
                            <Td alignment="end" numeric>
                              {t.money(row.paid)}
                            </Td>
                            <Td alignment="end" numeric>
                              <span className="font-semibold">{t.money(row.due)}</span>
                              {row.overdueDue > 0 && (
                                <span className="block text-xs text-red-600">
                                  {t.t('fees.overdue_amount', { amount: t.money(row.overdueDue) })}
                                </span>
                              )}
                            </Td>
                            <Td className="text-xs">
                              {row.nextDue ? t.date(row.nextDue, 'd M Y') : '—'}
                            </Td>
                            <Td className="text-xs">
                              {row.lastEmail ? t.date(row.lastEmail, 'd M Y') : '—'}
                            </Td>
                            <Td alignment="end">
                              <span className="flex flex-wrap items-center justify-end gap-1.5">
                                <Link
                                  href={`/admin/fees?student=${row.studentId}`}
                                  className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                                >
                                  {t.t('fees.collect')}
                                </Link>
                                {row.phone !== '' && (
                                  <a
                                    href={whatsappUrl(
                                      row.phone,
                                      t.t('fees.wa_intro', {
                                        total: t.money(row.due),
                                        name: row.name,
                                        id: row.studentIdNo ?? '',
                                      })
                                    )}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                                  >
                                    {t.t('fees.wa_short_student')}
                                  </a>
                                )}
                                {(row.guardianPhone ?? '') !== '' && (
                                  <a
                                    href={whatsappUrl(
                                      row.guardianPhone,
                                      t.t('fees.wa_intro', {
                                        total: t.money(row.due),
                                        name: row.name,
                                        id: row.studentIdNo ?? '',
                                      })
                                    )}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                                  >
                                    {t.t('fees.wa_short_guardian')}
                                  </a>
                                )}
                              </span>
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </TableWrap>
                )}
              </Card>

              <Pagination
                page={duesPager.page}
                totalPages={duesPager.totalPages}
                hrefFor={(page) => pageHref('/admin/fees', params, page)}
                labels={{
                  previous: t.t('common.previous'),
                  next: t.t('common.next'),
                  pageOf: t.t('gallery.page_of'),
                }}
                format={(value) => t.digits(value)}
              />
            </div>
          );
        }

        /* ----------------------------------------------- generate tab */
        if (tab === 'generate') {
          const month = params.month ?? '';
          const dueDate = params.due_date ?? '';
          const amount = params.amount ?? '';
          const courseId = /^\d+$/.test(params.course ?? '') ? Number(params.course) : 0;
          const batchId = /^\d+$/.test(params.batch ?? '') ? Number(params.batch) : 0;
          const wantPreview = params.preview === '1' && feeMonth(month) !== null;

          const [courses, batches] = await Promise.all([
            prisma.course
              .findMany({
                orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
                select: { id: true, name: true, name_bn: true },
              })
              .catch(() => []),
            prisma.batch
              .findMany({
                orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
                select: { id: true, name: true, name_bn: true },
              })
              .catch(() => []),
          ]);

          const preview = wantPreview
            ? await monthlyPreview({
                month,
                dueDate,
                amount: amount === '' ? null : Number(amount),
                courseId,
                batchId,
              })
            : [];

          const creatable = preview.filter((row) => row.status === 'create');

          return (
            <div className="space-y-6">
              {header}

              <Card>
                <CardHeader
                  title={t.t('fees.gen_title')}
                  subtitle={t.t('fees.gen_intro')}
                  icon="bi-calendar-plus"
                />
                <CardBody>
                  <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <input type="hidden" name="tab" value="generate" />
                    <input type="hidden" name="preview" value="1" />

                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-ink-muted">{t.t('fees.col_for')}</span>
                      <input
                        type="month"
                        name="month"
                        required
                        defaultValue={month}
                        className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                      />
                    </label>

                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-ink-muted">{t.t('common.course')}</span>
                      <select
                        name="course"
                        defaultValue={String(courseId || 0)}
                        className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                      >
                        <option value="0">{t.t('fees.all_courses')}</option>
                        {courses.map((course) => (
                          <option key={course.id} value={course.id}>
                            {t.pick(course, 'name')}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-ink-muted">{t.t('common.batch')}</span>
                      <select
                        name="batch"
                        defaultValue={String(batchId || 0)}
                        className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                      >
                        <option value="0">{t.t('fees.all_batches')}</option>
                        {batches.map((batch) => (
                          <option key={batch.id} value={batch.id}>
                            {t.pick(batch, 'name')}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-ink-muted">{t.t('fees.col_due_date')}</span>
                      <input
                        type="date"
                        name="due_date"
                        defaultValue={dueDate}
                        className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                      />
                      <span className="text-[11px] text-ink-muted">
                        {t.t('fees.gen_due_help', { day: t.digits(dueDay) })}
                      </span>
                    </label>

                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-ink-muted">{t.t('fees.col_fee')}</span>
                      <input
                        name="amount"
                        inputMode="decimal"
                        defaultValue={amount}
                        className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                      />
                      <span className="text-[11px] text-ink-muted">{t.t('fees.gen_amount_help')}</span>
                    </label>

                    <div className="sm:col-span-2">
                      <button
                        type="submit"
                        className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                      >
                        {t.t('fees.preview')}
                      </button>
                    </div>
                  </form>
                </CardBody>
              </Card>

              {wantPreview && (
                <Card>
                  <CardHeader
                    title={t.t('fees.gen_preview_title', { month: t.monthLabel(month) })}
                    subtitle={t.t('fees.gen_preview_sub', {
                      create: t.digits(creatable.length),
                      total: t.money(creatable.reduce((sum, row) => sum + row.final, 0)),
                      skip: t.digits(preview.length - creatable.length),
                      date: dueDate !== '' ? t.date(dueDate, 'd M Y') : t.digits(dueDay),
                    })}
                    icon="bi-list-check"
                  />
                  <CardBody>
                    {preview.length === 0 ? (
                      <p className="text-sm text-ink-muted">{t.t('fees.gen_none')}</p>
                    ) : (
                      <GenerateConfirmForm
                        month={month}
                        dueDate={dueDate}
                        amount={amount}
                        courseId={courseId}
                        batchId={batchId}
                        rows={preview.map((row) => ({
                          studentId: row.studentId,
                          name: row.name,
                          studentIdNo: row.studentIdNo,
                          placement: [row.courseLabel, row.batchLabel]
                            .filter((part) => part !== '')
                            .join(' · '),
                          base: row.base !== null ? t.money(row.base) : '—',
                          discount: row.discount > 0 ? t.money(row.discount) : '—',
                          final: row.final > 0 ? t.money(row.final) : '—',
                          status: row.status,
                          statusLabel: t.t(`fees.gen_status_${row.status}`),
                          creatable: row.status === 'create',
                        }))}
                        labels={{
                          select: t.t('fees.select'),
                          student: t.t('common.student'),
                          fee: t.t('fees.col_fee'),
                          discount: t.t('fees.col_discount'),
                          final: t.t('fees.col_final'),
                          status: t.t('common.status'),
                          idempotent: t.t('fees.gen_idempotent'),
                          create: t.t('fees.gen_create'),
                        }}
                      />
                    )}
                  </CardBody>
                </Card>
              )}
            </div>
          );
        }

        /* -------------------------------------------------- plans tab */
        if (tab === 'plans') {
          const [plans, students] = await Promise.all([
            planList(),
            prisma.student
              .findMany({
                where: { status: 'approved', student_status: 'Active' },
                orderBy: { name: 'asc' },
                take: 500,
                select: { id: true, name: true, student_id_no: true },
              })
              .catch(() => []),
          ]);

          return (
            <div className="space-y-6">
              {header}

              <Card>
                <CardHeader title={t.t('fees.plan_new')} icon="bi-list-ol" />
                <CardBody>
                  <PlanForm
                    students={students.map((student) => ({
                      id: student.id,
                      label: `${student.name}${student.student_id_no ? ` — ${student.student_id_no}` : ''}`,
                    }))}
                    labels={{
                      student: t.t('common.student'),
                      title: t.t('common.title'),
                      titlePlaceholder: t.t('fees.plan_title_ph'),
                      total: t.t('fees.plan_total'),
                      count: t.t('fees.plan_count'),
                      firstDue: t.t('fees.plan_first_due'),
                      interval: t.t('fees.plan_interval'),
                      note: t.t('common.note'),
                      preview: t.t('fees.plan_preview'),
                      create: t.t('fees.plan_create'),
                    }}
                  />
                </CardBody>
              </Card>

              <Card>
                <CardHeader title={t.t('fees.plan_list')} icon="bi-list-task" />

                {plans.length === 0 ? (
                  <CardBody className="text-sm text-ink-muted">{t.t('fees.plan_none')}</CardBody>
                ) : (
                  <ul className="divide-y divide-line-soft">
                    {plans.map((plan) => (
                      <li key={plan.id} id={`plan-${plan.id}`} className="px-5 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-ink-heading">{plan.title}</span>
                              <Badge
                                tone={
                                  plan.status === 'active'
                                    ? 'info'
                                    : plan.status === 'completed'
                                      ? 'success'
                                      : 'neutral'
                                }
                              >
                                {t.t(`status.${plan.status}`)}
                              </Badge>
                            </p>
                            <p className="text-xs text-ink-muted">
                              <Link
                                href={`/admin/fees?student=${plan.studentId}`}
                                className="hover:text-primary"
                              >
                                {plan.studentName}
                              </Link>
                              {plan.studentIdNo ? ` · ${plan.studentIdNo}` : ''}
                            </p>
                            <p className="mt-1 text-xs text-ink-muted">
                              {t.t('fees.plan_meta', {
                                total: t.money(plan.totalAmount),
                                count: t.digits(plan.installments),
                                date: plan.firstDue ? t.date(plan.firstDue, 'd M Y') : '',
                              })}
                              {' · '}
                              {t.t('fees.plan_progress', {
                                done: t.digits(plan.charges - plan.openCharges),
                                count: t.digits(plan.charges),
                              })}
                              {' · '}
                              {t.t('fees.plan_amounts', {
                                paid: t.money(plan.paidAmount),
                                due: t.money(plan.dueAmount),
                              })}
                            </p>
                          </div>

                          {plan.status === 'active' && (
                            <CancelPlanButton
                              planId={plan.id}
                              planTitle={plan.title}
                              labels={{
                                cancel: t.t('fees.plan_cancel'),
                                confirm: t.t('fees.plan_cancel_confirm', { title: '{title}' }),
                                dismiss: t.t('common.cancel'),
                              }}
                            />
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          );
        }

        /* ---------------------------------------------- discounts tab */
        const [discounts, students] = await Promise.all([
          discountList(),
          prisma.student
            .findMany({
              where: { status: 'approved' },
              orderBy: { name: 'asc' },
              take: 500,
              select: { id: true, name: true, student_id_no: true },
            })
            .catch(() => []),
        ]);

        const editId = /^\d+$/.test(params.edit ?? '') ? Number(params.edit) : 0;
        const editing = discounts.find((discount) => discount.id === editId) ?? null;

        return (
          <div className="space-y-6">
            {header}

            <Card>
              <CardHeader
                title={t.t(editing ? 'fees.discount_edit' : 'fees.discount_new')}
                icon="bi-percent"
              />
              <CardBody>
                <DiscountForm
                  values={{
                    id: editing?.id ?? 0,
                    studentId: editing?.student_id ?? 0,
                    type: editing?.discount_type ?? 'fixed',
                    value: editing ? String(Number(editing.value)) : '',
                    appliesTo: editing?.applies_to ?? 'monthly',
                    reason: editing?.reason ?? '',
                    startsOn: editing?.starts_on
                      ? editing.starts_on.toISOString().slice(0, 10)
                      : '',
                    endsOn: editing?.ends_on ? editing.ends_on.toISOString().slice(0, 10) : '',
                    isActive: editing?.is_active ?? true,
                  }}
                  students={students.map((student) => ({
                    id: student.id,
                    label: `${student.name}${student.student_id_no ? ` — ${student.student_id_no}` : ''}`,
                  }))}
                  labels={{
                    student: t.t('common.student'),
                    reason: t.t('fees.discount_reason'),
                    reasonPlaceholder: t.t('fees.discount_reason_ph'),
                    type: t.t('fees.discount_type'),
                    typeFixed: t.t('fees.discount_fixed'),
                    typePercent: t.t('fees.discount_percent'),
                    value: t.t('fees.discount_value'),
                    appliesTo: t.t('fees.discount_applies'),
                    appliesMonthly: t.t('fees.applies_monthly'),
                    appliesAll: t.t('fees.applies_all'),
                    active: t.t('fees.discount_active'),
                    from: t.t('fees.discount_from'),
                    to: t.t('fees.discount_to'),
                    hint: t.t('fees.discount_hint'),
                    save: t.t('common.save'),
                    cancel: t.t('common.cancel'),
                  }}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title={t.t('fees.discount_list')} icon="bi-tags" />

              {discounts.length === 0 ? (
                <CardBody className="text-sm text-ink-muted">{t.t('fees.discount_none')}</CardBody>
              ) : (
                <ul className="divide-y divide-line-soft">
                  {discounts.map((discount) => (
                    <li key={discount.id} className="px-5 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-ink">
                              {discountText(discount, t.lang)}
                            </span>
                            <Badge tone={discount.is_active ? 'success' : 'neutral'}>
                              {t.t(discount.is_active ? 'status.active' : 'status.inactive')}
                            </Badge>
                            <Badge tone="neutral">
                              {t.t(
                                discount.applies_to === 'all'
                                  ? 'fees.applies_all'
                                  : 'fees.applies_monthly'
                              )}
                            </Badge>
                          </p>
                          <p className="text-xs text-ink-muted">
                            <Link
                              href={`/admin/fees?student=${discount.student.id}`}
                              className="hover:text-primary"
                            >
                              {t.pick(discount.student, 'name')}
                            </Link>
                            {discount.student.student_id_no
                              ? ` · ${discount.student.student_id_no}`
                              : ''}
                            {discount.reason ? ` · ${discount.reason}` : ''}
                          </p>
                          <p className="text-xs text-ink-muted">
                            {discount.starts_on || discount.ends_on
                              ? `${
                                  discount.starts_on ? t.date(discount.starts_on, 'd M Y') : '…'
                                } – ${discount.ends_on ? t.date(discount.ends_on, 'd M Y') : t.t('fees.discount_always')}`
                              : t.t('fees.discount_always')}
                          </p>
                        </div>

                        <DiscountRowActions
                          discountId={discount.id}
                          isActive={discount.is_active}
                          editHref={`/admin/fees?tab=discounts&edit=${discount.id}#discountForm`}
                          labels={{
                            edit: t.t('common.edit'),
                            activate: t.t('fees.activate'),
                            deactivate: t.t('fees.deactivate'),
                            remove: t.t('common.delete'),
                            confirmDelete: t.t('fees.discount_delete_confirm'),
                            dismiss: t.t('common.cancel'),
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
