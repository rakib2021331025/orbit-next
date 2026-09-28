import type { Metadata } from 'next';
import { GuardianPage } from '@/components/portal/GuardianPage';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { CopyButton } from '@/components/ui/CopyButton';
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { getLang, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { allSettings, settingLocalized } from '@/lib/settings';
import { paymentSummary } from '@/lib/student/data';
import { feeLabel, rowDue } from '@/lib/fees/core';
import { displayId } from '@/lib/pdf/idcard';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'guardian.pay.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * A child's fees and receipts, from guardian/payments.php.
 *
 * Receipts are offered only for PAID rows; the receipt route checks the guardian
 * link again on its own, so a receipt id typed into the URL is no way round this
 * page. While anything is owed, the due slip is offered as a PDF.
 */
export default async function GuardianPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  const params = await searchParams;

  return (
    <GuardianPage
      active="payments"
      needsChild
      searchParams={params}
      title={(t) => t.t('guardian.pay.title')}
      subtitle={(t, child) => (child ? t.t('guardian.pay.sub', { name: t.pick(child, 'name') }) : '')}
    >
      {async ({ child, t }) => {
        if (!child) return null;

        const [payments, settings, instructions] = await Promise.all([
          prisma.payment
            .findMany({
              where: { student_id: child.id },
              orderBy: [{ payment_date: 'desc' }, { id: 'desc' }],
            })
            .catch(() => []),
          allSettings(),
          settingLocalized('payment_instructions', ''),
        ]);

        const planIds = [
          ...new Set(payments.map((p) => p.installment_plan_id).filter((id): id is number => id !== null)),
        ];
        const plans =
          planIds.length > 0
            ? await prisma.installmentPlan
                .findMany({ where: { id: { in: planIds } }, select: { id: true, title: true, installments: true } })
                .catch(() => [])
            : [];
        const planById = new Map(plans.map((plan) => [plan.id, plan]));

        const totals = paymentSummary(payments);
        const state = payments.length === 0 ? 'none' : totals.due > 0 ? 'due' : 'clear';
        const bkash = (settings.bkash_number ?? '').trim();
        const nagad = (settings.nagad_number ?? '').trim();
        const hasHowTo = bkash !== '' || nagad !== '' || instructions.trim() !== '';

        const methodLabel = (method: string | null) => {
          const m = (method ?? '').trim().toLowerCase();
          if (m === 'bkash' || m === 'nagad') return t.t(`enroll.${m}`);
          return (method ?? '').trim() || '—';
        };

        return (
          <div className="space-y-6">
            {totals.due > 0 && (
              <div className="flex justify-end">
                <a
                  href={`/fee-slip?student=${child.id}`}
                  className="inline-flex items-center gap-2 rounded-orbit border border-primary px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary-soft"
                >
                  <i className="bi bi-file-earmark-pdf" aria-hidden />
                  {t.t('guardian.pay.fee_slip')}
                </a>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard label={t.t('guardian.pay.total_paid')} value={t.money(totals.paid)} icon="bi-cash-coin" tone="success" />
              <StatCard
                label={t.t('guardian.pay.total_due')}
                value={t.money(totals.due)}
                icon="bi-exclamation-circle-fill"
                tone={totals.due > 0 ? 'danger' : 'default'}
              />
              <StatCard
                label={t.t('guardian.pay.status')}
                value={t.t(`guardian.pay.status_${state}`)}
                icon="bi-shield-check"
                tone={state === 'due' ? 'danger' : state === 'clear' ? 'success' : 'default'}
              />
            </div>

            <div className={hasHowTo ? 'grid gap-6 xl:grid-cols-3' : 'grid gap-6'}>
              <Card className={hasHowTo ? 'xl:col-span-2' : undefined}>
                <CardHeader title={t.t('guardian.pay.records')} icon="bi-receipt" />
                {payments.length === 0 ? (
                  <EmptyState icon="bi-receipt" title={t.t('guardian.pay.records')} body={t.t('guardian.pay.no_records')} />
                ) : (
                  <TableWrap>
                    <Table>
                      <Thead>
                        <Tr>
                          <Th>{t.t('student.pay.for')}</Th>
                          <Th alignment="end" numeric>{t.t('common.amount')}</Th>
                          <Th>{t.t('student.pay.method')}</Th>
                          <Th alignment="center">{t.t('common.status')}</Th>
                          <Th alignment="end">{t.t('student.pay.receipt')}</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {payments.map((p) => {
                          const isPaid = p.payment_status === 'paid';
                          const due = rowDue(p);
                          const plan = p.installment_plan_id !== null ? planById.get(p.installment_plan_id) : undefined;
                          return (
                            <Tr key={p.id}>
                              <Td>
                                <strong>
                                  {feeLabel(
                                    { ...p, plan_title: plan?.title ?? null, plan_installments: plan?.installments ?? null },
                                    t.lang
                                  )}
                                </strong>
                                <div className="text-xs text-ink-muted">
                                  {isPaid && p.payment_date ? t.date(p.payment_date, 'd M Y') : ''}
                                  {(p.receipt_number ?? '').trim() !== '' &&
                                    ` · ${t.t('student.pay.receipt_no')} ${p.receipt_number}`}
                                </div>
                              </Td>
                              <Td alignment="end" numeric>
                                {t.money(Number(p.amount ?? 0))}
                                {due > 0 && (
                                  <div className="text-xs font-semibold text-red-600">
                                    {t.t('guardian.pay.due')}: {t.money(due)}
                                  </div>
                                )}
                              </Td>
                              <Td>
                                {methodLabel(p.payment_method)}
                                {(p.transaction_id ?? '').trim() !== '' && (
                                  <div className="text-xs text-ink-muted">
                                    <code>{p.transaction_id}</code>
                                  </div>
                                )}
                              </Td>
                              <Td alignment="center">
                                <Badge tone={isPaid ? (due > 0 ? 'warning' : 'success') : 'danger'}>
                                  {t.t(isPaid ? (due > 0 ? 'status.partial' : 'status.paid') : 'status.unpaid')}
                                </Badge>
                              </Td>
                              <Td alignment="end" className="whitespace-nowrap">
                                {isPaid ? (
                                  <span className="inline-flex gap-1.5">
                                    <a
                                      href={`/api/receipt/${p.id}`}
                                      aria-label={t.t('common.download')}
                                      className="grid h-8 w-8 place-items-center rounded-orbit border border-primary text-primary hover:bg-primary-soft"
                                    >
                                      <i className="bi bi-download" aria-hidden />
                                    </a>
                                    <a
                                      href={`/api/receipt/${p.id}?mode=print`}
                                      target="_blank"
                                      rel="noopener"
                                      aria-label={t.t('common.print')}
                                      className="grid h-8 w-8 place-items-center rounded-orbit border border-line text-ink hover:bg-surface-2"
                                    >
                                      <i className="bi bi-printer" aria-hidden />
                                    </a>
                                  </span>
                                ) : (
                                  '—'
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

              {hasHowTo && (
                <Card>
                  <CardHeader title={t.t('guardian.pay.how_to_pay')} icon="bi-phone-fill" />
                  <CardBody className="space-y-3">
                    <p className="whitespace-pre-line text-sm">
                      {instructions.trim() !== '' ? instructions : t.t('student.pay.how_to_pay_body')}
                    </p>
                    {(
                      [
                        ['bkash', bkash],
                        ['nagad', nagad],
                      ] as const
                    )
                      .filter(([, number]) => number !== '')
                      .map(([key, number]) => (
                        <div
                          key={key}
                          className="flex items-center justify-between gap-2 rounded-orbit border border-line px-3 py-2"
                        >
                          <div>
                            <div className="text-xs text-ink-muted">{t.t(`enroll.${key}`)}</div>
                            <strong className="text-lg tabular-nums">{number}</strong>
                          </div>
                          <CopyButton value={number} label={t.t('common.copy')} copiedLabel={t.t('common.copied')} />
                        </div>
                      ))}
                    <p className="text-xs text-ink-muted">
                      {t.t('guardian.pay.reference', { id: displayId(child) })}
                    </p>
                  </CardBody>
                </Card>
              )}
            </div>
          </div>
        );
      }}
    </GuardianPage>
  );
}
