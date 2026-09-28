import type { Metadata } from 'next';
import Link from 'next/link';
import { GuardianPage } from '@/components/portal/GuardianPage';
import { Card, CardHeader, StatCard } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { getLang, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { studentAttendance, attendanceSummary } from '@/lib/student/data';
import { attendanceByMonth, monthRange, parseMonth, shiftMonth } from '@/lib/guardians/portal';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'guardian.att.title'),
    robots: { index: false, follow: false },
  };
}

const TONES: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  present: 'success',
  late: 'warning',
  half_day: 'info',
  absent: 'danger',
};

/**
 * One child's attendance for one month, from guardian/attendance.php.
 *
 * `?month=YYYY-MM` picks the month; anything malformed or before 2000 falls
 * back to the current one rather than erroring. Only the selected child's rows
 * are read — the child was resolved by `GuardianPage` against this guardian's
 * own children, never taken on trust from the URL.
 */
export default async function GuardianAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string; month?: string }>;
}) {
  const params = await searchParams;
  const month = parseMonth(params.month);

  return (
    <GuardianPage
      active="attendance"
      needsChild
      searchParams={params}
      title={(t) => t.t('guardian.att.title')}
      subtitle={(t, child) => (child ? t.t('guardian.att.sub', { name: t.pick(child, 'name') }) : '')}
    >
      {async ({ child, t }) => {
        if (!child) return null;
        const { from, to } = monthRange(month);

        const [records, byMonth] = await Promise.all([
          studentAttendance(child.id, from, to),
          attendanceByMonth(child.id, 12),
        ]);
        records.sort((a, b) => a.attendance_date.getTime() - b.attendance_date.getTime());
        const totals = attendanceSummary(records);
        const rate = totals.rate;

        // The class a row was taken in, when the teacher gave it no label.
        const courseIds = [...new Set(records.map((r) => r.course_id).filter((id): id is number => id !== null))];
        const courses =
          courseIds.length > 0
            ? await prisma.course
                .findMany({ where: { id: { in: courseIds } }, select: { id: true, name: true, name_bn: true } })
                .catch(() => [])
            : [];
        const courseName = new Map(courses.map((c) => [c.id, t.pick(c, 'name')]));

        const href = (m: string) => `/guardian/attendance?student=${child.id}&month=${m}`;

        return (
          <div className="space-y-6">
            <Card className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Link
                href={href(shiftMonth(month, -1))}
                aria-label={t.t('guardian.att.prev')}
                className="grid h-9 w-9 place-items-center rounded-orbit border border-line hover:bg-surface-2"
              >
                <i className="bi bi-chevron-left" aria-hidden />
              </Link>
              <strong className="flex-1 text-center font-head text-lg">{t.monthLabel(month)}</strong>
              <Link
                href={href(shiftMonth(month, 1))}
                aria-label={t.t('guardian.att.next')}
                className="grid h-9 w-9 place-items-center rounded-orbit border border-line hover:bg-surface-2"
              >
                <i className="bi bi-chevron-right" aria-hidden />
              </Link>
              <form method="get" action="/guardian/attendance" className="flex gap-2">
                <input type="hidden" name="student" value={child.id} />
                <label className="sr-only" htmlFor="month">
                  {t.t('common.month')}
                </label>
                <input
                  type="month"
                  id="month"
                  name="month"
                  defaultValue={month}
                  className="rounded-orbit border border-line bg-surface px-2 py-1.5 text-sm"
                />
                <button type="submit" className="rounded-orbit bg-primary px-3 py-1.5 text-sm font-medium text-white">
                  {t.t('guardian.att.show')}
                </button>
              </form>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <StatCard
                label={t.t('guardian.att.rate')}
                value={`${t.number(rate, Number.isInteger(rate) ? 0 : 1)}%`}
                icon="bi-graph-up"
                tone={totals.total > 0 && rate < 75 ? 'danger' : 'success'}
                hint={t.t('student.att.rate_note')}
              />
              <StatCard label={t.t('attendance.present')} value={t.digits(totals.present)} icon="bi-check-circle-fill" tone="success" />
              <StatCard label={t.t('attendance.late')} value={t.digits(totals.late)} icon="bi-alarm-fill" tone="warning" />
              <StatCard label={t.t('attendance.half_day')} value={t.digits(totals.halfDay)} icon="bi-circle-half" />
              <StatCard label={t.t('attendance.absent')} value={t.digits(totals.absent)} icon="bi-x-circle-fill" tone={totals.absent > 0 ? 'danger' : 'default'} />
            </div>

            <Card>
              <CardHeader
                title={t.t('guardian.att.days', { month: t.monthLabel(month) })}
                icon="bi-list-check"
                actions={
                  <span className="text-sm text-ink-muted">
                    {t.t('guardian.att.classes', { count: t.digits(totals.total) })}
                  </span>
                }
              />
              {records.length === 0 ? (
                <EmptyState icon="bi-calendar-x" title={t.monthLabel(month)} body={t.t('guardian.att.none_month')} />
              ) : (
                <TableWrap>
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>{t.t('common.date')}</Th>
                        <Th>{t.t('student.att.class')}</Th>
                        <Th alignment="center">{t.t('common.status')}</Th>
                        <Th>{t.t('common.remarks')}</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {records.map((row) => {
                        const label = (row.class_label ?? '').trim();
                        const course = row.course_id !== null ? (courseName.get(row.course_id) ?? '') : '';
                        return (
                          <Tr key={row.id}>
                            <Td className="whitespace-nowrap">
                              <strong>{t.date(row.attendance_date, 'd M Y')}</strong>
                              <div className="text-xs text-ink-muted">{t.day(row.attendance_date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }))}</div>
                            </Td>
                            <Td>
                              {label !== '' ? label : course !== '' ? course : '—'}
                              {label !== '' && course !== '' && (
                                <div className="text-xs text-ink-muted">{course}</div>
                              )}
                            </Td>
                            <Td alignment="center">
                              <Badge tone={TONES[row.status ?? ''] ?? 'neutral'}>
                                {t.t(`attendance.${row.status ?? 'absent'}`)}
                              </Badge>
                            </Td>
                            <Td className="text-ink-muted">{(row.note ?? '').trim() || '—'}</Td>
                          </Tr>
                        );
                      })}
                    </Tbody>
                  </Table>
                </TableWrap>
              )}
            </Card>

            {byMonth.length > 0 && (
              <Card>
                <CardHeader title={t.t('guardian.att.by_month')} icon="bi-calendar-month-fill" />
                <TableWrap>
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>{t.t('common.month')}</Th>
                        <Th alignment="center">{t.t('attendance.present')}</Th>
                        <Th alignment="center">{t.t('attendance.absent')}</Th>
                        <Th alignment="center">{t.t('common.total')}</Th>
                        <Th alignment="end">%</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {byMonth.map(({ month: ym, totals: s }) => (
                        <Tr key={ym}>
                          <Td>
                            <Link href={href(ym)} className="font-medium text-primary hover:underline">
                              {t.monthLabel(ym)}
                            </Link>
                          </Td>
                          <Td alignment="center">{t.digits(s.present + s.late)}</Td>
                          <Td alignment="center">{t.digits(s.absent)}</Td>
                          <Td alignment="center">{t.digits(s.total)}</Td>
                          <Td alignment="end">
                            <Badge tone={s.rate >= 75 ? 'success' : s.rate >= 50 ? 'warning' : 'danger'}>
                              {t.number(s.rate, 1)}%
                            </Badge>
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </TableWrap>
              </Card>
            )}
          </div>
        );
      }}
    </GuardianPage>
  );
}
