import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { Pagination } from '@/components/ui/Pagination';
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { getLang, translate } from '@/lib/i18n';
import { pageHref } from '@/lib/paginate';
import { prisma } from '@/lib/db/prisma';
import { requireRecordBranch } from '@/lib/auth/guards';
import { FEE_METHODS, feeLabel, feeMethod, feeMethodLabel, feeTypeLabel } from '@/lib/fees/core';
import {
  trackingCourses,
  trackingFilters,
  trackingRows,
  trackingStudents,
  trackingTotals,
} from '@/lib/payments/tracking';
import { PaymentForm, DeletePayment } from './PaymentForms';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'apay.title'),
    robots: { index: false, follow: false },
  };
}

const TONE = {
  paid: 'success',
  partial: 'warning',
  unpaid: 'danger',
} as const;

/**
 * The fee register, from admin/payment_tracking.php.
 *
 * Money taken at the desk, in one list: what was paid, what is still owed on a
 * part payment, and the receipt to hand over. The branch in focus is the
 * payment's own branch — where the money was taken — so moving a student
 * later never moves last month's takings with them.
 */
export default async function AdminPaymentTrackingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  return (
    <AdminPage active="payments" route="/admin/payment-tracking" title="">
      {async ({ t }) => {
        const filters = trackingFilters(params);
        const filtered =
          filters.search !== '' || filters.course !== '' || filters.status !== '';

        const totals = await trackingTotals(filters);
        const { rows, pager } = await trackingRows(filters, totals.records);

        const [courses, students] = await Promise.all([trackingCourses(), trackingStudents()]);

        const editId = /^\d+$/.test(params.edit ?? '') ? Number(params.edit) : 0;
        let editing = null;
        if (editId > 0) {
          await requireRecordBranch('payments', editId, false);
          editing = await prisma.payment
            .findUnique({
              where: { id: editId },
              include: { student: { select: { name: true, student_id_no: true } } },
            })
            .catch(() => null);
        }

        // The list exactly as it is now, for the cancel link and the edit links.
        const listQuery = {
          search: filters.search,
          course: filters.course,
          status: filters.status,
          page: pager.page > 1 ? String(pager.page) : '',
        };
        const listUrl = pageHref('/admin/payment-tracking', listQuery, pager.page);
        const editUrl = (id: number) =>
          `${pageHref('/admin/payment-tracking', { ...listQuery, edit: String(id) }, pager.page)}#paymentForm`;

        // A method stored before the list changed still shows as itself rather
        // than being silently rewritten to Cash.
        const current = editing ? (feeMethod(editing.payment_method) ?? 'Cash') : 'Cash';
        const methods = [
          ...FEE_METHODS.map((method) => ({
            value: method,
            label: feeMethodLabel(method, t.lang),
          })),
          ...(FEE_METHODS.some((method) => method === current)
            ? []
            : [{ value: current, label: current }]),
        ];

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-ink-heading">{t.t('apay.title')}</h1>
                <p className="mt-1 text-sm text-ink-muted">{t.t('apay.sub')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/admin/applications?state=pending"
                  className="rounded-orbit border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-2"
                >
                  <i className="bi bi-wallet2 me-1" aria-hidden />{' '}
                  {t.t('admin.nav.enrollments')}
                </Link>
                <a
                  href="/api/export/report?report=payments&output=csv"
                  title={t.t('apay.export_hint')}
                  className="rounded-orbit bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700"
                >
                  <i className="bi bi-filetype-csv me-1" aria-hidden /> {t.t('apay.export_csv')}
                </a>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-orbit border border-line bg-surface p-4">
                <span className="block text-xl font-bold text-ink-heading">
                  {t.digits(totals.records)}
                </span>
                <span className="block text-sm text-ink-muted">{t.t('apay.stat_records')}</span>
              </div>
              <div className="rounded-orbit border border-line bg-surface p-4">
                <span className="block text-xl font-bold text-ink-heading">
                  {t.money(totals.collected)}
                </span>
                <span className="block text-sm text-ink-muted">{t.t('apay.stat_collected')}</span>
              </div>
              <div className="rounded-orbit border border-line bg-surface p-4">
                <span className="block text-xl font-bold text-red-600">{t.money(totals.due)}</span>
                <span className="block text-sm text-ink-muted">{t.t('apay.stat_due')}</span>
              </div>
            </div>

            <Card>
              <form method="get" className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="flex flex-col gap-1 text-sm lg:col-span-2">
                  <span className="text-ink-muted">{t.t('common.search')}</span>
                  <input
                    type="search"
                    name="search"
                    maxLength={100}
                    defaultValue={filters.search}
                    placeholder={t.t('apay.search_ph')}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('common.course')}</span>
                  <select
                    name="course"
                    defaultValue={filters.course}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="">{t.t('apay.all_courses')}</option>
                    {courses.map((course) => (
                      <option key={course} value={course}>
                        {course}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('common.status')}</span>
                  <select
                    name="status"
                    defaultValue={filters.status}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="">{t.t('apay.all_status')}</option>
                    <option value="paid">{t.t('status.paid')}</option>
                    <option value="unpaid">{t.t('status.unpaid')}</option>
                  </select>
                </label>

                <div className="flex items-end gap-2 sm:col-span-2">
                  <button
                    type="submit"
                    className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                  >
                    {t.t('common.filter')}
                  </button>
                  {filtered && (
                    <Link
                      href="/admin/payment-tracking"
                      className="rounded-orbit border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
                    >
                      {t.t('common.clear')}
                    </Link>
                  )}
                </div>
              </form>
            </Card>

            <div className="grid gap-6 xl:grid-cols-3">
              <div id="paymentForm" className="xl:col-span-1">
                <Card>
                  <CardHeader
                    title={t.t(editing ? 'apay.edit' : 'apay.add')}
                    icon="bi-cash-coin"
                  />
                  <CardBody>
                    <PaymentForm
                      values={{
                        id: editing?.id ?? 0,
                        studentId: editing?.student_id ?? 0,
                        studentLabel: editing
                          ? `${editing.student.name}${
                              editing.student.student_id_no
                                ? ` — ${editing.student.student_id_no}`
                                : ''
                            }`
                          : '',
                        amount: editing ? String(Number(editing.amount)) : '',
                        dueAmount: editing ? String(Number(editing.due_amount ?? 0)) : '0',
                        month: editing?.payment_month ?? '',
                        method: current,
                        notes: editing?.notes ?? '',
                        dueDate: editing?.due_date
                          ? editing.due_date.toISOString().slice(0, 10)
                          : '',
                      }}
                      students={students.map((student) => ({
                        id: student.id,
                        label: `${student.name}${
                          student.student_id_no ? ` (${student.student_id_no})` : ''
                        } — ${student.course ?? ''}`,
                      }))}
                      methods={methods}
                      canEditDueDate
                      cancelHref={listUrl}
                      labels={{
                        student: t.t('common.student'),
                        studentFixed: t.t('apay.student_fixed'),
                        selectStudent: t.t('apay.select_student'),
                        amount: t.t('apay.f_amount'),
                        due: t.t('apay.f_due'),
                        dueHelp: t.t('apay.f_due_help'),
                        month: t.t('apay.f_month'),
                        monthPlaceholder: t.t('apay.f_month_ph'),
                        dueDate: t.t('fees.col_due_date'),
                        method: t.t('apay.f_method'),
                        notes: t.t('apay.f_notes'),
                        add: t.t('apay.add'),
                        saveEdit: t.t('apay.save_edit'),
                        cancelEdit: t.t('apay.cancel_edit'),
                        saving: t.t('common.please_wait'),
                      }}
                    />
                  </CardBody>
                </Card>
              </div>

              <div className="xl:col-span-2">
                <Card>
                  <CardHeader
                    title={t.t('apay.list_title')}
                    icon="bi-receipt"
                    actions={
                      pager.total > 0 ? (
                        <span className="text-xs text-ink-muted">
                          {t.t('apay.showing', {
                            from: t.digits(pager.from),
                            to: t.digits(pager.to),
                            total: t.digits(pager.total),
                          })}
                        </span>
                      ) : undefined
                    }
                  />

                  {rows.length === 0 ? (
                    <EmptyState
                      icon="bi-receipt"
                      title={t.t(filtered ? 'apay.empty_filtered' : 'apay.empty')}
                      body={t.t('apay.sub')}
                    />
                  ) : (
                    <>
                      <TableWrap>
                        <Table>
                          <Thead>
                            <Tr>
                              <Th>{t.t('common.student')}</Th>
                              <Th>{t.t('apay.col_for')}</Th>
                              <Th alignment="end">{t.t('common.amount')}</Th>
                              <Th>{t.t('common.status')}</Th>
                              <Th alignment="end">{t.t('common.actions')}</Th>
                            </Tr>
                          </Thead>
                          <Tbody>
                            {rows.map((row) => {
                              const label = feeLabel(
                                {
                                  fee_type: row.feeType,
                                  payment_month: row.month,
                                  plan_title: row.planTitle,
                                  plan_installments: row.planInstallments,
                                },
                                t.lang
                              );

                              return (
                                <Tr
                                  key={row.id}
                                  className={editing?.id === row.id ? 'bg-surface-2' : undefined}
                                >
                                  <Td>
                                    <Link
                                      href={`/admin/students/${row.studentId}`}
                                      className="font-semibold text-ink hover:text-primary"
                                    >
                                      {row.studentName}
                                    </Link>
                                    {row.studentIdNo !== '' && (
                                      <span className="block whitespace-nowrap text-xs text-ink-muted">
                                        {row.studentIdNo}
                                      </span>
                                    )}
                                    {row.course !== '' && (
                                      <span className="block text-xs text-ink-muted">
                                        {row.course}
                                      </span>
                                    )}
                                  </Td>

                                  <Td>
                                    <span className="block text-sm text-ink">{label}</span>
                                    {(row.feeType !== '' || row.dueDate !== null) && (
                                      <span className="block text-xs text-ink-muted">
                                        {row.feeType !== '' ? feeTypeLabel(row.feeType, t.lang) : ''}
                                        {row.feeType !== '' && row.dueDate !== null ? ' · ' : ''}
                                        {row.dueDate !== null
                                          ? t.t('fees.due_by', {
                                              date: t.date(row.dueDate, 'd M Y'),
                                            })
                                          : ''}
                                        {row.overdue && (
                                          <span className="ms-1 text-red-600">
                                            {t.t('fees.overdue')}
                                          </span>
                                        )}
                                      </span>
                                    )}
                                    <span className="block text-xs text-ink-muted">
                                      {feeMethodLabel(row.method, t.lang)}
                                      {row.transactionId !== '' && (
                                        <code className="ms-1">{row.transactionId}</code>
                                      )}
                                    </span>
                                    {row.notes !== '' && (
                                      <span
                                        title={row.notes}
                                        className="block max-w-40 truncate text-xs text-ink-muted"
                                      >
                                        {row.notes}
                                      </span>
                                    )}
                                  </Td>

                                  <Td alignment="end" numeric>
                                    <span className="font-semibold">{t.money(row.amount)}</span>
                                    {row.dueAmount > 0 && (
                                      <span className="block text-xs text-red-600">
                                        {t.t('apay.due_line', { amount: t.money(row.dueAmount) })}
                                      </span>
                                    )}
                                  </Td>

                                  <Td>
                                    <Badge tone={TONE[row.status]}>{t.t(`status.${row.status}`)}</Badge>
                                    {row.paymentStatus === 'paid' && row.paymentDate !== null && (
                                      <span className="mt-1 block whitespace-nowrap text-xs text-ink-muted">
                                        {t.date(row.paymentDate, 'd M Y')}
                                      </span>
                                    )}
                                  </Td>

                                  <Td alignment="end">
                                    <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                                      {row.due > 0 && (
                                        <Link
                                          href={`/admin/fees?student=${row.studentId}&charge=${row.id}#collect`}
                                          title={t.t('fees.collect')}
                                          aria-label={t.t('fees.collect')}
                                          className="rounded-orbit bg-primary px-2.5 py-1 text-xs font-medium text-white transition hover:bg-primary-hover"
                                        >
                                          <i className="bi bi-cash-coin" aria-hidden />
                                        </Link>
                                      )}
                                      {row.paymentStatus === 'paid' && (
                                        <>
                                          <a
                                            href={`/api/receipt/${row.id}`}
                                            title={t.t('apay.receipt_download')}
                                            aria-label={t.t('apay.receipt_download')}
                                            className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                                          >
                                            <i className="bi bi-download" aria-hidden />
                                          </a>
                                          <a
                                            href={`/api/receipt/${row.id}?mode=print`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            title={t.t('apay.receipt_print')}
                                            aria-label={t.t('apay.receipt_print')}
                                            className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                                          >
                                            <i className="bi bi-printer" aria-hidden />
                                          </a>
                                        </>
                                      )}
                                      <Link
                                        href={editUrl(row.id)}
                                        title={t.t('common.edit')}
                                        aria-label={t.t('common.edit')}
                                        className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                                      >
                                        <i className="bi bi-pencil" aria-hidden />
                                      </Link>
                                      <DeletePayment
                                        paymentId={row.id}
                                        studentId={row.studentId}
                                        labels={{
                                          remove: t.t('common.delete'),
                                          confirm: t.t('apay.delete_confirm', {
                                            name: row.studentName,
                                            month: label,
                                          }),
                                          dismiss: t.t('common.cancel'),
                                        }}
                                      />
                                    </span>
                                  </Td>
                                </Tr>
                              );
                            })}
                          </Tbody>
                        </Table>
                      </TableWrap>

                      <CardBody>
                        <Pagination
                          page={pager.page}
                          totalPages={pager.totalPages}
                          hrefFor={(page) =>
                            pageHref('/admin/payment-tracking', listQuery, page)
                          }
                          labels={{
                            previous: t.t('common.previous'),
                            next: t.t('common.next'),
                            pageOf: t.t('gallery.page_of'),
                          }}
                          format={t.digits}
                        />
                      </CardBody>
                    </>
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
