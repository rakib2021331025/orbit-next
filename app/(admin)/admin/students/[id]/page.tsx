import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { getLang, translate } from '@/lib/i18n';
import { studentPhotoUrl } from '@/lib/storage/url';
import { formatPhone, telHref } from '@/lib/site/url';
import { branchesEnabled } from '@/lib/branch/active';
import { branchList } from '@/lib/branch/stats';
import { studentAttendance, studentAttendanceSummary } from '@/lib/student/data';
import { FEE_METHODS, feeLabel, feeMethodLabel, rowState, rowDue } from '@/lib/fees/core';
import {
  loadStudent,
  studentCharges,
  chargeTotals,
  studentGuardians,
  plansOf,
} from '@/lib/students/profile';
import { AddPaymentForm, ChargeActions, CreateGuardianButton } from './PaymentForms';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'astu.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * One student's profile, from admin/student.php.
 *
 * Profile, guardian login, payment history and attendance in one place. A
 * branch-locked admin who edits the id in the URL gets the "not found" state:
 * `loadStudent()` applies the branch rule, and answering the same way for
 * "missing" and "another branch's" is what stops the page confirming that an id
 * exists elsewhere.
 */
export default async function AdminStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const studentId = /^\d+$/.test(id) ? Number(id) : 0;

  return (
    <AdminPage active="students" route="/admin/students/[id]" title="">
      {async ({ t }) => {
        const student = await loadStudent(studentId);

        if (!student) {
          return (
            <Card>
              <EmptyState
                icon="bi-person-x"
                title={t.t('astu.not_found_title')}
                body={t.t('astu.not_found_body')}
                action={
                  <Link
                    href="/admin/students"
                    className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                  >
                    {t.t('admin.nav.student_list')}
                  </Link>
                }
              />
            </Card>
          );
        }

        // The rate is counted in the database and only the ten rows shown are
        // read — not the student's whole attendance history.
        const [charges, guardians, attendance, recent, multiBranch] = await Promise.all([
          studentCharges(student.id),
          studentGuardians(student.id),
          studentAttendanceSummary(student.id),
          studentAttendance(student.id, undefined, undefined, { take: 10 }),
          branchesEnabled(),
        ]);

        const plans = await plansOf(charges);
        const totals = chargeTotals(charges);

        const branches = multiBranch ? await branchList() : [];
        const branchName = student.branch_id
          ? (branches.find((branch) => branch.id === student.branch_id) ?? null)
          : null;

        const displayId = (student.student_id_no ?? '').trim();
        const nameBn = (student.name_bn ?? '').trim();

        // Label, value, and how the value should be linked.
        const details: [string, string, 'code' | 'tel' | 'email' | ''][] = [
          [t.t('common.student_id'), displayId, 'code'],
          [t.t('common.phone'), student.phone ?? '', 'tel'],
          [t.t('common.email'), student.email ?? '', 'email'],
          [t.t('student.profile.guardian_phone'), student.guardian_phone ?? '', 'tel'],
          [t.t('student.profile.emergency'), student.emergency_contact ?? '', 'tel'],
          [t.t('student.profile.institution'), student.institution ?? '', ''],
          [t.t('common.address'), student.address ?? '', ''],
          [t.t('branch.label'), branchName ? t.pickPair(branchName, 'name') : '', ''],
          [t.t('common.batch'), student.batch ?? '', ''],
          [t.t('student.profile.roll'), student.roll_number ?? '', ''],
          [t.t('student.profile.father'), student.father_name ?? '', ''],
          [t.t('student.profile.mother'), student.mother_name ?? '', ''],
          [
            t.t('student.profile.dob'),
            student.date_of_birth ? t.date(student.date_of_birth, 'd M Y') : '',
            '',
          ],
          [
            t.t('student.profile.gender'),
            student.gender ? t.t(`student.profile.gender_${student.gender}`) : '',
            '',
          ],
          [t.t('student.profile.blood'), student.blood_group ?? '', ''],
        ];

        const attendanceTone: Record<string, 'success' | 'warning' | 'info' | 'danger'> = {
          present: 'success',
          late: 'warning',
          half_day: 'info',
          absent: 'danger',
        };

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-ink-muted">{t.t('astu.title')}</p>
                <h1 className="text-2xl font-bold text-ink-heading">
                  {student.name}
                  {nameBn !== '' && (
                    <span className="ms-2 text-lg font-normal text-ink-muted" lang="bn">
                      {nameBn}
                    </span>
                  )}
                </h1>
                <p className="mt-1 text-sm text-ink-muted">
                  {[displayId, (student.course ?? '').trim()].filter((part) => part !== '').join(' · ')}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href="/admin/students"
                  className="rounded-orbit border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
                >
                  {t.t('admin.nav.student_list')}
                </Link>
                <Link
                  href={`/api/id-card?id=${student.id}`}
                  target="_blank"
                  className="rounded-orbit border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
                >
                  {t.t('astu.id_card')}
                </Link>
                <Link
                  href={`/admin/attendance-calendar?student=${student.id}`}
                  className="rounded-orbit border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
                >
                  {t.t('astu.calendar')}
                </Link>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-orbit border border-line bg-surface p-4">
                <span className="block text-xl font-bold text-ink-heading">
                  {t.money(totals.paid)}
                </span>
                <span className="block text-sm text-ink-muted">{t.t('student.pay.total_paid')}</span>
              </div>
              <div className="rounded-orbit border border-line bg-surface p-4">
                <span className="block text-xl font-bold text-ink-heading">
                  {t.money(totals.due)}
                </span>
                <span className="block text-sm text-ink-muted">
                  {t.t('astu.stat_due', { count: t.digits(totals.unpaidCount) })}
                </span>
              </div>
              <div className="rounded-orbit border border-line bg-surface p-4">
                <span className="block text-xl font-bold text-ink-heading">
                  {t.number(attendance.rate, Number.isInteger(attendance.rate) ? 0 : 1)}%
                </span>
                <span className="block text-sm text-ink-muted">{t.t('student.att.rate')}</span>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-6">
                <Card>
                  <CardBody>
                    <div className="text-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={studentPhotoUrl(student)}
                        alt={t.t('common.photo')}
                        className="mx-auto h-28 w-28 rounded-full border-4 border-surface object-cover shadow"
                      />
                      <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                        <Badge tone={student.status === 'approved' ? 'success' : 'warning'}>
                          {t.t(student.status === 'approved' ? 'status.approved' : 'status.pending')}
                        </Badge>
                        <Badge tone={student.student_status === 'Active' ? 'info' : 'neutral'}>
                          {t.t(
                            student.student_status === 'Active' ? 'status.active' : 'status.inactive'
                          )}
                        </Badge>
                      </div>
                      {student.created_at && (
                        <p className="mt-2 text-xs text-ink-muted">
                          {t.t('astu.registered', { date: t.date(student.created_at, 'd M Y') })}
                        </p>
                      )}
                    </div>

                    <h2 className="mt-5 text-sm font-semibold text-ink-heading">
                      {t.t('astu.profile')}
                    </h2>
                    <dl className="mt-2 space-y-2 text-sm">
                      {details
                        .filter(([, value]) => value.trim() !== '')
                        .map(([label, value, kind]) => (
                          <div key={label} className="grid grid-cols-[9rem_1fr] gap-2">
                            <dt className="text-ink-muted">{label}</dt>
                            <dd className="break-words text-ink">
                              {kind === 'code' ? (
                                <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">
                                  {value}
                                </code>
                              ) : kind === 'tel' ? (
                                <a href={telHref(value)} className="hover:underline">
                                  {formatPhone(value)}
                                </a>
                              ) : kind === 'email' ? (
                                <a href={`mailto:${value}`} className="hover:underline">
                                  {value}
                                </a>
                              ) : (
                                value
                              )}
                            </dd>
                          </div>
                        ))}
                    </dl>
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader title={t.t('aguardian.card_title')} icon="bi-people-fill" />
                  <CardBody className="space-y-3 text-sm">
                    {guardians.length > 0 ? (
                      <ul className="space-y-2">
                        {guardians.map((link) => (
                          <li
                            key={link.guardian.id}
                            className="flex flex-wrap items-center justify-between gap-2"
                          >
                            <span>
                              <span className="block font-medium text-ink">
                                {link.guardian.name ?? formatPhone(link.guardian.phone)}
                              </span>
                              <span className="block text-xs text-ink-muted">
                                {formatPhone(link.guardian.phone)}
                                {link.relation ? ` · ${link.relation}` : ''}
                              </span>
                            </span>
                            <Link
                              href={`/admin/guardians?view=${link.guardian.id}`}
                              className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                            >
                              {t.t('aguardian.manage')}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <>
                        <p className="text-ink-muted">
                          {(student.guardian_phone ?? '').trim() !== ''
                            ? t.t('aguardian.card_create_hint', {
                                phone: formatPhone(student.guardian_phone),
                              })
                            : t.t('aguardian.card_no_phone')}
                        </p>
                        {(student.guardian_phone ?? '').trim() !== '' ? (
                          <CreateGuardianButton
                            phone={student.guardian_phone ?? ''}
                            labels={{ create: t.t('aguardian.card_create') }}
                          />
                        ) : (
                          <Link
                            href="/admin/guardians"
                            className="inline-block rounded-orbit border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-2"
                          >
                            {t.t('aguardian.create')}
                          </Link>
                        )}
                      </>
                    )}
                  </CardBody>
                </Card>
              </div>

              <div className="space-y-6 lg:col-span-2">
                <Card>
                  <CardHeader title={t.t('astu.add_payment')} icon="bi-cash-coin" />
                  <CardBody>
                    <AddPaymentForm
                      studentId={student.id}
                      methods={FEE_METHODS.map((method) => ({
                        value: method,
                        label: feeMethodLabel(method, t.lang),
                      }))}
                      labels={{
                        amount: t.t('astu.f_amount'),
                        month: t.t('astu.f_month'),
                        monthPlaceholder: t.t('astu.f_month_ph'),
                        method: t.t('astu.f_method'),
                        status: t.t('common.status'),
                        statusPaid: t.t('status.paid'),
                        statusUnpaid: t.t('status.unpaid'),
                        due: t.t('astu.f_due'),
                        notes: t.t('astu.f_notes'),
                        optional: t.t('common.optional'),
                        save: t.t('astu.save_payment'),
                        partialHint: t.t('astu.partial_hint'),
                      }}
                    />
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader
                    title={t.t('astu.payments')}
                    icon="bi-receipt"
                    actions={
                      <Link
                        href={`/admin/payment-tracking?search=${encodeURIComponent(student.phone ?? '')}`}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        {t.t('admin.nav.payment_tracking')}
                      </Link>
                    }
                  />

                  {charges.length === 0 ? (
                    <CardBody className="text-sm text-ink-muted">{t.t('astu.no_payments')}</CardBody>
                  ) : (
                    <TableWrap>
                      <Table>
                        <Thead>
                          <Tr>
                            <Th>{t.t('astu.col_for')}</Th>
                            <Th alignment="end">{t.t('common.amount')}</Th>
                            <Th alignment="end">{t.t('astu.col_due')}</Th>
                            <Th>{t.t('astu.col_method')}</Th>
                            <Th alignment="center">{t.t('common.status')}</Th>
                            <Th alignment="end">{t.t('common.actions')}</Th>
                          </Tr>
                        </Thead>
                        <Tbody>
                          {charges.map((charge) => {
                            const plan = charge.installment_plan_id
                              ? plans.get(charge.installment_plan_id)
                              : undefined;
                            const state = rowState(charge);
                            const due = rowDue(charge);

                            return (
                              <Tr key={charge.id}>
                                <Td>
                                  <span className="font-medium text-ink">
                                    {feeLabel(
                                      {
                                        ...charge,
                                        plan_title: plan?.title ?? null,
                                        plan_installments: plan?.installments ?? null,
                                      },
                                      t.lang
                                    )}
                                  </span>
                                  <span className="block text-xs text-ink-muted">
                                    {charge.payment_status === 'paid'
                                      ? t.date(charge.payment_date, 'd M Y')
                                      : charge.due_date
                                        ? t.t('fees.due_by', {
                                            date: t.date(charge.due_date, 'd M Y'),
                                          })
                                        : ''}
                                  </span>
                                  {charge.receipt_number && (
                                    <span className="block text-xs text-ink-muted">
                                      {charge.receipt_number}
                                    </span>
                                  )}
                                </Td>
                                <Td alignment="end" numeric>
                                  {t.money(Number(charge.amount))}
                                </Td>
                                <Td alignment="end" numeric>
                                  {due > 0 ? t.money(due) : '—'}
                                </Td>
                                <Td className="text-xs">
                                  {feeMethodLabel(charge.payment_method || 'Cash', t.lang)}
                                </Td>
                                <Td alignment="center">
                                  <Badge
                                    tone={
                                      state === 'paid'
                                        ? 'success'
                                        : state === 'partial'
                                          ? 'warning'
                                          : 'danger'
                                    }
                                  >
                                    {t.t(`status.${state}`)}
                                  </Badge>
                                </Td>
                                <Td alignment="end">
                                  <ChargeActions
                                    studentId={student.id}
                                    paymentId={charge.id}
                                    state={state}
                                    collectHref={`/admin/fees?student=${student.id}&charge=${charge.id}#collect`}
                                    labels={{
                                      collect: t.t('fees.collect'),
                                      markPaid: t.t('astu.mark_paid'),
                                      receipt: t.t('astu.receipt_download'),
                                    }}
                                  />
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
                  <CardHeader
                    title={t.t('astu.attendance')}
                    icon="bi-calendar-check"
                    actions={
                      <Link
                        href={`/admin/attendance-calendar?student=${student.id}`}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        {t.t('astu.calendar')}
                      </Link>
                    }
                  />

                  {recent.length === 0 ? (
                    <CardBody className="text-sm text-ink-muted">
                      {t.t('astu.no_attendance')}
                    </CardBody>
                  ) : (
                    <ul className="divide-y divide-line-soft">
                      {recent.map((row) => (
                        <li
                          key={row.id}
                          className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm"
                        >
                          <span className="text-ink">
                            {t.date(row.attendance_date, 'd M Y')}
                            {row.class_label && (
                              <span className="ms-2 text-xs text-ink-muted">{row.class_label}</span>
                            )}
                          </span>
                          <Badge tone={attendanceTone[row.status ?? 'absent'] ?? 'neutral'}>
                            {t.t(`attendance.${row.status ?? 'absent'}`)}
                          </Badge>
                        </li>
                      ))}
                    </ul>
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
