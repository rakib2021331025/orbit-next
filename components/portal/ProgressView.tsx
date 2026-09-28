import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { cn } from '@/lib/cn';
import type { Translator } from '@/lib/i18n';
import type { MonthChange, MonthPoint } from '@/lib/results/progress';
import { progressChanges, subjectTrends } from '@/lib/results/progress';
import type { AttendanceSummary } from '@/lib/student/data';

/**
 * The progress view, shared by the student portal and the guardian portal.
 *
 * Both show the same three panels for the same person, so they are one component
 * rather than two that drift apart — the guardian seeing a different number from
 * the student would be worse than either being wrong.
 *
 * The "no significant change" band is stated on the page, because a student
 * looking at "same" next to a 1.4-point rise deserves to know why.
 */

const TONES: Record<string, 'success' | 'danger' | 'neutral'> = {
  improved: 'success',
  declined: 'danger',
  same: 'neutral',
  none: 'neutral',
};

const ICONS: Record<string, string> = {
  improved: 'bi-arrow-up-right',
  declined: 'bi-arrow-down-right',
  same: 'bi-dash',
  none: 'bi-dot',
};

export function ProgressView({
  months,
  attendance,
  payments,
  t,
  flatPoints = 2,
}: {
  months: MonthPoint[];
  attendance: AttendanceSummary;
  payments: { paid: number; due: number; count: number };
  t: Translator;
  flatPoints?: number;
}) {
  const changes = progressChanges(months);
  const trends = subjectTrends(months);

  const first = months[0] ?? null;
  const latest = months[months.length - 1] ?? null;
  const latestChange: MonthChange | null = changes[changes.length - 1] ?? null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t.t('prog.latest_month')}
          value={latest ? `${t.digits(latest.percentage)}%` : '—'}
          icon="bi-graph-up"
          tone="primary"
          hint={latest ? t.monthLabel(latest.ym) : undefined}
        />
        <StatCard
          label={t.t('prog.first_month')}
          value={first ? `${t.digits(first.percentage)}%` : '—'}
          icon="bi-flag"
          hint={first ? t.monthLabel(first.ym) : undefined}
        />
        <StatCard
          label={t.t('prog.attendance_pct')}
          value={`${t.digits(attendance.rate)}%`}
          icon="bi-calendar-check"
          tone={attendance.rate >= 75 ? 'success' : 'warning'}
          hint={t.t('prog.total_classes') + `: ${t.digits(attendance.total)}`}
        />
        <StatCard
          label={t.t('prog.total_paid')}
          value={t.money(payments.paid)}
          icon="bi-wallet2"
          tone={payments.due > 0 ? 'warning' : 'default'}
          hint={payments.due > 0 ? `${t.t('prog.total_due')}: ${t.money(payments.due)}` : undefined}
        />
      </div>

      {/* ------------------------------------------------ month by month */}
      <Card>
        <CardHeader
          title={t.t('prog.perf_title')}
          icon="bi-bar-chart-line"
          actions={
            latestChange && latestChange.state !== 'none' ? (
              <Badge tone={TONES[latestChange.state]} icon={ICONS[latestChange.state]}>
                {t.t(`prog.${latestChange.state}`)}
              </Badge>
            ) : undefined
          }
        />

        {months.length === 0 ? (
          <EmptyState icon="bi-graph-up" title={t.t('prog.perf_title')} body={t.t('prog.perf_none')} />
        ) : months.length === 1 ? (
          <>
            <Bars months={months} t={t} />
            <CardBody className="border-t border-line-soft">
              <p className="text-sm font-medium text-ink">{t.t('prog.not_enough')}</p>
              <p className="mt-1 text-sm text-ink-muted">{t.t('prog.not_enough_sub')}</p>
            </CardBody>
          </>
        ) : (
          <>
            <Bars months={months} t={t} />
            <TableWrap>
              <Table>
                <Thead>
                  <Tr>
                    <Th>{t.t('prog.month')}</Th>
                    <Th alignment="end" numeric>{t.t('prog.marks')}</Th>
                    <Th alignment="end" numeric>{t.t('prog.percentage')}</Th>
                    <Th alignment="center">{t.t('prog.change')}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {months.map((month, index) => {
                    const change = changes[index];
                    return (
                      <Tr key={month.ym}>
                        <Td>{t.monthLabel(month.ym)}</Td>
                        <Td alignment="end" numeric>
                          {t.digits(month.obtained)} / {t.digits(month.full)}
                        </Td>
                        <Td alignment="end" numeric>
                          {t.digits(month.percentage)}%
                        </Td>
                        <Td alignment="center">
                          {change.state === 'none' ? (
                            <span className="text-xs text-ink-muted">—</span>
                          ) : (
                            <span className="inline-flex flex-col items-center gap-0.5">
                              <Badge tone={TONES[change.state]} icon={ICONS[change.state]}>
                                {change.delta !== null &&
                                  `${change.delta > 0 ? '+' : ''}${t.digits(change.delta)}`}
                              </Badge>
                              {/* Not the calendar month before — say which. */}
                              {change.gap && change.previousYm && (
                                <span className="text-[10px] text-ink-muted">
                                  {t.t('prog.vs_month', { month: t.monthLabel(change.previousYm) })}
                                </span>
                              )}
                            </span>
                          )}
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </TableWrap>
          </>
        )}

        <div className="border-t border-line-soft bg-surface-2 px-5 py-2.5 text-xs text-ink-muted">
          {t.t('prog.perf_note', { points: t.digits(flatPoints) })}
        </div>
      </Card>

      {/* --------------------------------------------------- by subject */}
      {trends.length > 0 && (
        <Card>
          <CardHeader title={t.t('prog.subject')} icon="bi-list-check" />
          <TableWrap>
            <Table>
              <Thead>
                <Tr>
                  <Th>{t.t('prog.subject')}</Th>
                  {months.map((month) => (
                    <Th key={month.ym} alignment="end" numeric>
                      {t.monthLabel(month.ym)}
                    </Th>
                  ))}
                  <Th alignment="center">{t.t('prog.change')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {trends.map((subject) => (
                  <Tr key={subject.key}>
                    <Td>{t.lang === 'bn' && subject.labelBn ? subject.labelBn : subject.label}</Td>
                    {months.map((month) => {
                      const point = subject.points.find((entry) => entry.ym === month.ym);
                      return (
                        <Td key={month.ym} alignment="end" numeric>
                          {!point ? (
                            <span className="text-ink-muted">—</span>
                          ) : point.absent ? (
                            <span className="text-xs text-ink-muted">{t.t('prog.absent')}</span>
                          ) : (
                            `${t.digits(point.percentage)}%`
                          )}
                        </Td>
                      );
                    })}
                    <Td alignment="center">
                      {subject.state === 'none' ? (
                        <span className="text-xs text-ink-muted">—</span>
                      ) : (
                        <Badge tone={TONES[subject.state]} icon={ICONS[subject.state]}>
                          {subject.delta !== null &&
                            `${subject.delta > 0 ? '+' : ''}${t.digits(subject.delta)}`}
                        </Badge>
                      )}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableWrap>
        </Card>
      )}

      {/* -------------------------------------------------- attendance */}
      <Card>
        <CardHeader title={t.t('prog.att_title')} icon="bi-calendar-check" />
        <CardBody>
          {attendance.total === 0 ? (
            <p className="text-sm text-ink-muted">{t.t('prog.att_none')}</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-4">
              <Figure label={t.t('prog.present')} value={t.digits(attendance.present)} />
              <Figure label={t.t('attendance.late')} value={t.digits(attendance.late)} />
              <Figure label={t.t('prog.half_day')} value={t.digits(attendance.halfDay)} />
              <Figure label={t.t('attendance.absent')} value={t.digits(attendance.absent)} />
            </div>
          )}
        </CardBody>
        <div className="border-t border-line-soft bg-surface-2 px-5 py-2.5 text-xs text-ink-muted">
          {t.t('prog.att_note')}
        </div>
      </Card>
    </div>
  );
}

/**
 * A bar per month.
 *
 * CSS bars rather than a charting library: one number per month needs no 60 KB
 * dependency, and this works with JavaScript off.
 */
function Bars({ months, t }: { months: MonthPoint[]; t: Translator }) {
  return (
    <div className="px-5 py-5">
      <ul className="flex items-end gap-2" style={{ height: '9rem' }}>
        {months.map((month) => (
          <li key={month.ym} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
            <span className="text-xs font-medium tabular-nums text-ink">
              {t.digits(month.percentage)}%
            </span>
            <div
              className={cn(
                'w-full rounded-t bg-primary/80 transition-all',
                month.percentage >= 80 && 'bg-emerald-500',
                month.percentage < 40 && 'bg-amber-500'
              )}
              // A floor of 2% so a zero month is still a visible mark rather
              // than an invisible gap in the row.
              style={{ height: `${Math.max(2, month.percentage)}%` }}
              aria-hidden
            />
            <span className="w-full truncate text-center text-[10px] text-ink-muted">
              {t.monthLabel(month.ym)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-0.5 font-head text-lg font-semibold tabular-nums text-ink-heading">{value}</p>
    </div>
  );
}
