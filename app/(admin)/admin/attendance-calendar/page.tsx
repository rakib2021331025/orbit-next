import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { getLang, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { summarise } from '@/lib/attendance/report';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'acal.title'),
    robots: { index: false, follow: false },
  };
}

/** The calendar runs Saturday to Friday, as the class routine does. */
const WEEK_START = 6; // Date.getDay() for Saturday

const STATUS_TONE: Record<string, 'success' | 'warning' | 'info' | 'danger'> = {
  present: 'success',
  late: 'warning',
  half_day: 'info',
  absent: 'danger',
};

const DAY_CLASS: Record<string, string> = {
  present: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200',
  late: 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200',
  half_day: 'bg-sky-100 text-sky-900 dark:bg-sky-950/60 dark:text-sky-200',
  absent: 'bg-red-100 text-red-900 dark:bg-red-950/60 dark:text-red-200',
};

/**
 * One student's month, from admin/attendance_calendar.php.
 *
 * Read only: attendance is taken on the register screen and exported from the
 * report. This exists for the conversation that starts "my son was there on
 * Tuesday" — a month at a glance answers it in one look.
 *
 * The student list includes **anyone with attendance on record**, not only
 * approved students, so a record does not become unreachable when a student is
 * later deactivated.
 */
export default async function AdminAttendanceCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string; student_id?: string; year?: string; month?: string; ym?: string }>;
}) {
  const params = await searchParams;

  return (
    <AdminPage active="attendance" route="/admin/attendance-calendar" title="">
      {async ({ t }) => {
        // `?student=` is this app's spelling; `?student_id=` keeps old links working.
        const raw = params.student ?? params.student_id ?? '';
        const studentId = /^\d+$/.test(raw) ? Number(raw) : 0;

        const now = new Date();
        let year = now.getFullYear();
        let month = now.getMonth() + 1;

        const ym = /^(\d{4})-(\d{2})$/.exec(params.ym ?? '');
        if (ym) {
          year = Number(ym[1]);
          month = Number(ym[2]);
        } else {
          if (/^\d{4}$/.test(params.year ?? '')) year = Number(params.year);
          if (/^\d{1,2}$/.test(params.month ?? '')) month = Number(params.month);
        }
        if (year < 2000 || year > 2100 || month < 1 || month > 12) {
          year = now.getFullYear();
          month = now.getMonth() + 1;
        }

        const monthStart = new Date(Date.UTC(year, month - 1, 1));
        const monthEnd = new Date(Date.UTC(year, month, 0));
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;

        const [students, student] = await Promise.all([
          prisma.student
            .findMany({
              where: {
                OR: [{ status: 'approved' }, { attendance_student: { some: {} } }],
              },
              orderBy: { name: 'asc' },
              select: { id: true, student_id_no: true, name: true, name_bn: true },
            })
            .catch(() => []),
          studentId > 0
            ? prisma.student
                .findUnique({
                  where: { id: studentId },
                  select: {
                    id: true,
                    student_id_no: true,
                    name: true,
                    name_bn: true,
                    course: true,
                    batch: true,
                  },
                })
                .catch(() => null)
            : null,
        ]);

        const records = student
          ? await prisma.attendance
              .findMany({
                where: {
                  student_id: student.id,
                  attendance_date: { gte: monthStart, lte: monthEnd },
                },
                orderBy: [{ attendance_date: 'asc' }, { id: 'asc' }],
                select: {
                  id: true,
                  attendance_date: true,
                  status: true,
                  note: true,
                  class_label: true,
                  batch_id: true,
                  course_id: true,
                },
              })
              .catch(() => [])
          : [];

        const batchIds = [...new Set(records.map((row) => row.batch_id).filter((id) => id > 0))];
        const courseIds = [
          ...new Set(records.map((row) => row.course_id).filter((id): id is number => !!id)),
        ];
        const [batches, courses] = await Promise.all([
          batchIds.length > 0
            ? prisma.batch
                .findMany({ where: { id: { in: batchIds } }, select: { id: true, name: true, name_bn: true } })
                .catch(() => [])
            : [],
          courseIds.length > 0
            ? prisma.course
                .findMany({ where: { id: { in: courseIds } }, select: { id: true, name: true, name_bn: true } })
                .catch(() => [])
            : [],
        ]);
        const batchById = new Map(batches.map((batch) => [batch.id, batch]));
        const courseById = new Map(courses.map((course) => [course.id, course]));

        // Counts for the month, using the app's single weighting.
        const counts: Record<string, number> = {};
        for (const row of records) {
          const key = row.status ?? 'absent';
          counts[key] = (counts[key] ?? 0) + 1;
        }
        const totals = summarise(counts);

        const byDay = new Map<number, typeof records>();
        for (const row of records) {
          const day = row.attendance_date.getUTCDate();
          byDay.set(day, [...(byDay.get(day) ?? []), row]);
        }

        // The grid: blanks up to the first day, then the month.
        const daysInMonth = monthEnd.getUTCDate();
        const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
        const leading = (firstWeekday - WEEK_START + 7) % 7;
        const cells: (number | null)[] = [
          ...Array<null>(leading).fill(null),
          ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
        ];
        while (cells.length % 7 !== 0) cells.push(null);

        const weekdayNames = Array.from({ length: 7 }, (_, index) =>
          t.day(
            ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
              (WEEK_START + index) % 7
            ]
          )
        );

        const monthHref = (target: Date) =>
          `/admin/attendance-calendar?student=${studentId}&year=${target.getUTCFullYear()}&month=${String(
            target.getUTCMonth() + 1
          ).padStart(2, '0')}`;

        const previous = new Date(Date.UTC(year, month - 2, 1));
        const next = new Date(Date.UTC(year, month, 1));

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-ink-heading">{t.t('acal.title')}</h1>
                <p className="mt-1 text-sm text-ink-muted">{t.t('acal.sub')}</p>
              </div>
              <Link
                href="/admin/attendance"
                className="rounded-orbit border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
              >
                {t.t('att.register')}
              </Link>
            </div>

            <Card>
              <form method="get" className="flex flex-wrap items-end gap-3 px-5 py-4">
                <label className="flex flex-1 flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('common.student')}</span>
                  <select
                    name="student"
                    defaultValue={String(studentId || '')}
                    className="w-full max-w-md rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="">{t.t('acal.pick_student')}</option>
                    {students.map((row) => (
                      <option key={row.id} value={row.id}>
                        {t.pick(row, 'name')}
                        {row.student_id_no ? ` — ${row.student_id_no}` : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('acal.this_month')}</span>
                  <input
                    type="month"
                    name="ym"
                    defaultValue={monthKey}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  />
                </label>

                <button
                  type="submit"
                  className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                >
                  {t.t('acal.show')}
                </button>
              </form>
            </Card>

            {!student ? (
              <Card>
                <EmptyState
                  icon="bi-calendar3"
                  title={t.t(studentId > 0 ? 'acal.not_found' : 'acal.title')}
                  body={t.t('acal.pick_student')}
                />
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader
                    title={t.pick(student, 'name')}
                    subtitle={[student.student_id_no, student.course, student.batch]
                      .filter(Boolean)
                      .join(' · ')}
                    icon="bi-person-badge"
                    actions={
                      <Link
                        href={`/admin/students/${student.id}`}
                        className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                      >
                        {t.t('acal.profile')}
                      </Link>
                    }
                  />
                  <CardBody>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <Link
                        href={monthHref(previous)}
                        className="rounded-orbit border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-2"
                      >
                        <span aria-label={t.t('acal.prev_month')}>←</span>
                      </Link>
                      <span className="text-lg font-semibold text-ink-heading">
                        {t.monthLabel(monthKey)}
                      </span>
                      <Link
                        href={monthHref(next)}
                        className="rounded-orbit border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-2"
                      >
                        <span aria-label={t.t('acal.next_month')}>→</span>
                      </Link>
                    </div>

                    <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-ink-muted">
                      {weekdayNames.map((name) => (
                        <span key={name} className="py-1">
                          {name}
                        </span>
                      ))}
                    </div>

                    <div className="mt-1 grid grid-cols-7 gap-1">
                      {cells.map((day, index) => {
                        if (day === null) {
                          return <span key={`blank-${index}`} className="min-h-16 rounded-orbit" />;
                        }
                        const marks = byDay.get(day) ?? [];
                        // A day with two registers (two batches) shows both.
                        const primary = marks[0]?.status ?? '';

                        return (
                          <span
                            key={day}
                            className={`min-h-16 rounded-orbit border border-line-soft p-1.5 text-start text-xs ${
                              primary !== '' ? DAY_CLASS[primary] : 'bg-surface'
                            }`}
                          >
                            <span className="block font-semibold">{t.digits(day)}</span>
                            {marks.map((mark) => (
                              <span key={mark.id} className="mt-0.5 block truncate">
                                {t.t(`att.short.${mark.status ?? 'absent'}`)}
                                {mark.batch_id > 0 && batchById.get(mark.batch_id)
                                  ? ` · ${t.pick(batchById.get(mark.batch_id)!, 'name')}`
                                  : ''}
                              </span>
                            ))}
                          </span>
                        );
                      })}
                    </div>
                  </CardBody>
                </Card>

                <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
                  {[
                    { label: t.t('attendance.present'), value: t.digits(totals.present) },
                    { label: t.t('attendance.late'), value: t.digits(totals.late) },
                    { label: t.t('attendance.half_day'), value: t.digits(totals.half_day) },
                    { label: t.t('attendance.absent'), value: t.digits(totals.absent) },
                    { label: t.t('att.records'), value: t.digits(totals.total) },
                    { label: t.t('att.rate'), value: `${t.number(totals.rate, 1)}%` },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-orbit border border-line bg-surface p-4">
                      <span className="block text-xl font-bold text-ink-heading">{stat.value}</span>
                      <span className="block text-sm text-ink-muted">{stat.label}</span>
                    </div>
                  ))}
                </div>

                <Card>
                  <CardHeader title={t.t('acal.records')} icon="bi-list-check" />
                  {records.length === 0 ? (
                    <CardBody className="text-sm text-ink-muted">
                      {t.t('acal.no_records', { month: t.monthLabel(monthKey) })}
                    </CardBody>
                  ) : (
                    <ul className="divide-y divide-line-soft">
                      {records.map((row) => {
                        const batch = row.batch_id > 0 ? batchById.get(row.batch_id) : undefined;
                        const course = row.course_id ? courseById.get(row.course_id) : undefined;

                        return (
                          <li
                            key={row.id}
                            className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"
                          >
                            <span className="min-w-0">
                              <span className="font-medium text-ink">
                                {t.date(row.attendance_date, 'd M Y')}
                              </span>
                              <span className="block text-xs text-ink-muted">
                                {[
                                  course ? t.pick(course, 'name') : '',
                                  batch ? t.pick(batch, 'name') : '',
                                  row.class_label ?? '',
                                ]
                                  .filter((part) => part !== '')
                                  .join(' · ')}
                              </span>
                              {row.note && (
                                <span className="block text-xs text-ink-muted">{row.note}</span>
                              )}
                            </span>
                            <Badge tone={STATUS_TONE[row.status ?? 'absent'] ?? 'neutral'}>
                              {t.t(`attendance.${row.status ?? 'absent'}`)}
                            </Badge>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Card>
              </>
            )}
          </div>
        );
      }}
    </AdminPage>
  );
}
