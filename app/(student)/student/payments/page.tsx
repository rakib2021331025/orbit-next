import type { Metadata } from 'next';
import Link from 'next/link';
import { StudentPage } from '@/components/portal/StudentPage';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/Card';
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback';
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { getLang, translate } from '@/lib/i18n';
import { studentPayments, paymentSummary } from '@/lib/student/data';
import { allSettings, settingLocalized } from '@/lib/settings';
import { rowDue } from '@/lib/fees/core';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'student.pay.title'),
    robots: { index: false, follow: false },
  };
}

const STATUS_TONES: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  paid: 'success',
  partial: 'warning',
  unpaid: 'danger',
  pending: 'warning',
};

/**
 * The student's fee record, from student/payments.php.
 *
 * A receipt link is offered only for a PAID row: the original refuses to print one
 * otherwise ("a receipt is only issued for a payment that was made"), and a
 * receipt for money not yet received is a document the centre would have to honour.
 */
export default async function StudentPaymentsPage() {
  return (
    <StudentPage
      active="payments"
      title={(t) => t.t('student.pay.title')}
      subtitle={(t) => t.t('student.pay.sub')}
    >
      {async ({ student, t }) => {
        const [payments, settings, instructions] = await Promise.all([
          studentPayments(student.id),
          allSettings(),
          settingLocalized('payment_instructions', ''),
        ]);
        const stats = paymentSummary(payments);

        const bkash = (settings.bkash_number ?? '').trim();
        const nagad = (settings.nagad_number ?? '').trim();

        return (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                label={t.t('student.pay.total_paid')}
                value={t.money(stats.paid)}
                icon="bi-check2-circle"
                tone="success"
              />
              <StatCard
                label={t.t('student.pay.total_due')}
                value={t.money(stats.due)}
                icon="bi-exclamation-circle"
                tone={stats.due > 0 ? 'danger' : 'default'}
              />
              <StatCard
                label={t.t('student.pay.status')}
                value={
                  payments.length === 0
                    ? t.t('student.pay.status_none')
                    : stats.due > 0
                      ? t.t('student.pay.status_due')
                      : t.t('student.pay.status_clear')
                }
                icon="bi-wallet2"
                tone={stats.due > 0 ? 'warning' : 'success'}
              />
            </div>

            {stats.due > 0 && (
              <div className="flex flex-wrap justify-end gap-2">
                <a
                  href={`/fee-slip?student=${student.id}&mode=download`}
                  className="inline-flex items-center gap-1.5 rounded-orbit bg-primary px-3 py-1.5 text-sm font-medium text-white"
                >
                  <i className="bi bi-file-earmark-pdf" aria-hidden />
                  {t.t('fees.slip_download')}
                </a>
                <a
                  href={`/fee-slip?student=${student.id}&mode=print`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1.5 rounded-orbit border border-line px-3 py-1.5 text-sm font-medium hover:bg-surface-2"
                >
                  <i className="bi bi-printer" aria-hidden />
                  {t.t('common.print')}
                </a>
              </div>
            )}

            {stats.due > 0 && (
              <Alert tone="warning" icon="bi-exclamation-triangle-fill">
                {t.t('fees.portal_overdue', {
                  amount: t.money(stats.due),
                  count: t.digits(payments.filter((row) => rowDue(row) > 0).length),
                })}
              </Alert>
            )}

            <Card>
              <CardHeader title={t.t('student.pay.records')} icon="bi-receipt" />
              {payments.length === 0 ? (
                <EmptyState
                  icon="bi-receipt"
                  title={t.t('student.pay.title')}
                  body={t.t('student.pay.no_records')}
                />
              ) : (
                <TableWrap>
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>{t.t('result.month')}</Th>
                        <Th>{t.t('student.pay.for')}</Th>
                        <Th alignment="end" numeric>{t.t('rcpt.amount_paid')}</Th>
                        <Th alignment="end" numeric>{t.t('student.pay.due')}</Th>
                        <Th alignment="center">{t.t('common.status')}</Th>
                        <Th>{t.t('rcpt.date')}</Th>
                        <Th alignment="end">{t.t('student.pay.receipt')}</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {payments.map((row) => {
                        const due = rowDue(row);
                        return (
                          <Tr key={row.id}>
                            <Td>{t.monthLabel(row.payment_month)}</Td>
                            <Td>
                              {row.fee_type ?? t.t('student.pay.admission')}
                              {row.installment_no !== null && (
                                <span className="ms-1 text-xs text-ink-muted">
                                  #{t.digits(row.installment_no)}
                                </span>
                              )}
                            </Td>
                            <Td alignment="end" numeric>
                              {t.money(Number(row.amount ?? 0))}
                            </Td>
                            <Td alignment="end" numeric className={due > 0 ? 'text-red-600' : undefined}>
                              {due > 0 ? t.money(due) : '—'}
                            </Td>
                            <Td alignment="center">
                              <Badge tone={STATUS_TONES[row.payment_status ?? ''] ?? 'neutral'}>
                                {t.t(`status.${row.payment_status ?? 'unpaid'}`)}
                              </Badge>
                            </Td>
                            <Td>{row.payment_date ? t.date(row.payment_date, 'd M Y') : '—'}</Td>
                            <Td alignment="end">
                              {/* Only a paid row gets a receipt. */}
                              {row.payment_status === 'paid' ? (
                                <Link
                                  href={`/api/receipt/${row.id}`}
                                  className="text-sm font-medium text-primary hover:underline"
                                >
                                  {row.receipt_number ?? t.t('student.pay.receipt')}
                                </Link>
                              ) : (
                                <span className="text-xs text-ink-muted">—</span>
                              )}
                            </Td>
                          </Tr>
                        );
                      })}
                    </Tbody>
                  </Table>
                </TableWrap>
              )}
            </Card>

            <Card>
              <CardHeader title={t.t('student.pay.how_to_pay')} icon="bi-info-circle" />
              <CardBody className="space-y-2 text-sm text-ink-muted">
                <p>{t.t('student.pay.how_to_pay_body')}</p>
                {(bkash !== '' || nagad !== '') && (
                  <ul className="flex flex-wrap gap-4 pt-1">
                    {bkash !== '' && (
                      <li className="flex items-center gap-2">
                        <Badge tone="danger">{t.t('enroll.bkash')}</Badge>
                        <strong className="tabular-nums text-ink">{bkash}</strong>
                      </li>
                    )}
                    {nagad !== '' && (
                      <li className="flex items-center gap-2">
                        <Badge tone="warning">{t.t('enroll.nagad')}</Badge>
                        <strong className="tabular-nums text-ink">{nagad}</strong>
                      </li>
                    )}
                  </ul>
                )}
                {instructions !== '' && <p className="whitespace-pre-line pt-1">{instructions}</p>}
              </CardBody>
            </Card>
          </div>
        );
      }}
    </StudentPage>
  );
}
