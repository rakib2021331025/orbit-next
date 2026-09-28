import type { Metadata } from 'next';
import { StudentPage } from '@/components/portal/StudentPage';
import { Card, CardHeader, StatCard } from '@/components/ui/Card';
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback';
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { getLang, translate } from '@/lib/i18n';
import { Pagination } from '@/components/ui/Pagination';
import { paginate, pageHref } from '@/lib/paginate';
import { studentAttendance, studentAttendanceCounts } from '@/lib/student/data';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'student.att.title'),
    robots: { index: false, follow: false },
  };
}

/** The tone each attendance status is shown in. */
const TONES: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  present: 'success',
  late: 'warning',
  half_day: 'warning',
  absent: 'danger',
};

/**
 * The student's attendance, from student/attendance.php.
 *
 * The rate is `(present + late + ½ · half_day) ÷ classes`, and the page says so —
 * a percentage nobody can reproduce from the rows above it invites disputes.
 *
 * Below 75% shows a warning, which is the threshold the original marks.
 *
 * The figures cover the whole history and are counted in the database; the
 * history table is paged, because it grows by a row per class for as long as
 * the student studies.
 */
const PER_PAGE = 50;

export default async function StudentAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;

  return (
    <StudentPage
      active="attendance"
      title={(t) => t.t('student.att.title')}
      subtitle={(t) => t.t('student.att.sub')}
    >
      {async ({ student, t }) => {
        const { summary: stats, records } = await studentAttendanceCounts(student.id);
        const pager = paginate(records, PER_PAGE, params.page);
        const rows =
          records > 0
            ? await studentAttendance(student.id, undefined, undefined, {
                take: pager.perPage,
                skip: pager.offset,
              })
            : [];

        if (records === 0) {
          return (
            <Card>
              <EmptyState
                icon="bi-calendar-x"
                title={t.t('student.att.title')}
                body={t.t('student.att.no_records')}
              />
            </Card>
          );
        }

        return (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label={t.t('student.att.rate')}
                value={`${t.digits(stats.rate)}%`}
                icon="bi-graph-up"
                tone={stats.rate >= 75 ? 'success' : 'warning'}
              />
              <StatCard
                label={t.t('student.att.total_classes')}
                value={t.digits(stats.total)}
                icon="bi-calendar3"
              />
              <StatCard
                label={t.t('attendance.present')}
                value={t.digits(stats.present + stats.late)}
                icon="bi-check-circle"
                tone="success"
                hint={stats.late > 0 ? `${t.t('attendance.late')}: ${t.digits(stats.late)}` : undefined}
              />
              <StatCard
                label={t.t('attendance.absent')}
                value={t.digits(stats.absent)}
                icon="bi-x-circle"
                tone={stats.absent > 0 ? 'danger' : 'default'}
                hint={stats.halfDay > 0 ? `${t.t('attendance.half_day')}: ${t.digits(stats.halfDay)}` : undefined}
              />
            </div>

            {stats.rate < 75 ? (
              <Alert tone="warning" icon="bi-exclamation-triangle-fill">
                {t.t('student.att.warning')}
              </Alert>
            ) : (
              <Alert tone="success" icon="bi-hand-thumbs-up-fill">
                {t.t('student.att.good')}
              </Alert>
            )}

            <Card>
              <CardHeader
                title={t.t('student.att.history')}
                subtitle={t.t('student.att.rate_note')}
                icon="bi-clock-history"
              />
              <TableWrap>
                <Table>
                  <Thead>
                    <Tr>
                      <Th>{t.t('common.date')}</Th>
                      <Th>{t.t('student.att.class')}</Th>
                      <Th alignment="center">{t.t('common.status')}</Th>
                      <Th>{t.t('common.note')}</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {rows.map((row) => (
                      <Tr key={row.id}>
                        <Td>{t.date(row.attendance_date, 'd M Y')}</Td>
                        <Td>{row.class_label ?? t.t('student.att.general')}</Td>
                        <Td alignment="center">
                          <Badge tone={TONES[row.status ?? ''] ?? 'neutral'}>
                            {t.t(`attendance.${row.status ?? 'absent'}`)}
                          </Badge>
                        </Td>
                        <Td className="text-ink-muted">{row.note ?? ''}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </TableWrap>
            </Card>

            <Pagination
              page={pager.page}
              totalPages={pager.totalPages}
              hrefFor={(page) => pageHref('/student/attendance', {}, page)}
              labels={{
                previous: t.t('common.previous'),
                next: t.t('common.next'),
                pageOf: t.t('gallery.page_of'),
              }}
              format={(value) => t.digits(value)}
            />
          </div>
        );
      }}
    </StudentPage>
  );
}
