import type { Metadata } from 'next';
import Link from 'next/link';
import { StudentPage } from '@/components/portal/StudentPage';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/Card';
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback';
import { getLang, translate, todayName } from '@/lib/i18n';
import { studentScope } from '@/lib/student/scope';
import {
  studentAssignments,
  studentAttendanceSummary,
  studentLiveClasses,
  studentMaterials,
  studentNotices,
  studentPaymentTotals,
  studentRoutine,
  startsAt,
} from '@/lib/student/data';
import { studentPublishedResults } from '@/lib/results/exam';
import { prisma } from '@/lib/db/prisma';
import { uploadUrl } from '@/lib/storage/url';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'student.dash.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * The student dashboard, from student/dashboard.php.
 *
 * Everything on it is narrowed by the student's audience scope, and the pending /
 * rejected application notices come from their own admissions rows — a student
 * whose new course is still being verified should see that here rather than
 * wondering why the course has not appeared.
 */
export default async function StudentDashboard() {
  return (
    <StudentPage
      active="dashboard"
      title={(t, student) => t.t('student.dash.greeting', { name: t.pick(student, 'name') })}
    >
      {async ({ student, t }) => {
        const scope = await studentScope(student);

        // Attendance and payments are shown only as totals here, so they are
        // read as totals — not as the student's whole history.
        const [routine, live, assignments, materials, notices, attendanceStats, paymentStats, results, applications] =
          await Promise.all([
            studentRoutine(scope),
            studentLiveClasses(scope, true, 5),
            studentAssignments(student.id, scope, 5),
            studentMaterials(scope, 5),
            studentNotices(scope, 5),
            studentAttendanceSummary(student.id),
            studentPaymentTotals(student.id),
            studentPublishedResults(student.id, 3),
            openApplications(student.id, student.phone),
          ]);

        const latestGpa = results.find((entry) => entry.result.gpa !== null)?.result.gpa ?? null;

        // `day_of_week` stores English day names, so today is compared as one.
        const today = todayName().toLowerCase();
        const todaysClasses = routine.filter((row) => row.day_of_week.toLowerCase() === today);

        return (
          <div className="space-y-6">
            {student.student_status !== 'Active' && (
              <Alert tone="warning" icon="bi-exclamation-triangle-fill">
                {t.t('student.dash.inactive')}
              </Alert>
            )}

            {applications.map((application) => (
              <Alert
                key={application.id}
                tone={application.status === 'rejected' ? 'danger' : 'info'}
                icon={application.status === 'rejected' ? 'bi-x-circle-fill' : 'bi-hourglass-split'}
              >
                {t.t(
                  application.status === 'rejected'
                    ? 'student.dash.rejected_note'
                    : 'student.dash.pending_note',
                  { course: application.course, no: application.application_no ?? '' }
                )}
              </Alert>
            ))}

            {/* ------------------------------------------------------- numbers */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label={t.t('student.dash.stat_courses')}
                value={t.digits(scope.groups.length)}
                icon="bi-journal-bookmark"
                href="/student/courses"
              />
              <StatCard
                label={t.t('student.dash.stat_attendance')}
                value={`${t.digits(attendanceStats.rate)}%`}
                icon="bi-calendar-check"
                tone={attendanceStats.rate >= 75 ? 'success' : attendanceStats.rate > 0 ? 'warning' : 'default'}
                hint={
                  attendanceStats.total === 0
                    ? t.t('student.dash.no_attendance')
                    : t.t('student.dash.classes_count', { count: t.digits(attendanceStats.total) })
                }
                href="/student/attendance"
              />
              <StatCard
                label={t.t('student.dash.stat_gpa')}
                value={latestGpa === null ? '—' : t.digits(latestGpa.toFixed(2))}
                icon="bi-award"
                tone="primary"
                hint={latestGpa === null ? t.t('student.dash.no_gpa') : undefined}
                href="/student/results"
              />
              <StatCard
                label={t.t('student.dash.stat_paid')}
                value={t.money(paymentStats.paid)}
                icon="bi-wallet2"
                hint={paymentStats.due > 0 ? t.money(paymentStats.due) : undefined}
                tone={paymentStats.due > 0 ? 'warning' : 'default'}
                href="/student/payments"
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* --------------------------------------------- today's classes */}
              <Card>
                <CardHeader
                  title={t.t('student.dash.today')}
                  icon="bi-calendar-day"
                  actions={
                    <Link href="/student/routine" className="text-sm font-medium text-primary hover:underline">
                      {t.t('student.nav.routine')}
                    </Link>
                  }
                />
                {todaysClasses.length === 0 ? (
                  <EmptyState icon="bi-calendar-x" title={t.t('student.dash.no_class_today')} />
                ) : (
                  <ul className="divide-y divide-line-soft">
                    {todaysClasses.map((row) => (
                      <li key={row.id} className="flex items-center gap-3 px-5 py-3">
                        <span className="w-20 shrink-0 text-sm tabular-nums text-ink-muted">
                          {t.date(row.start_time, 'h:i A')}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-ink">{row.subject}</span>
                          <span className="block text-xs text-ink-muted">
                            {[row.teacher_name, row.room_number].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {/* ------------------------------------------------ live classes */}
              <Card>
                <CardHeader
                  title={t.t('student.nav.live')}
                  icon="bi-camera-video"
                  actions={
                    <Link href="/student/live-classes" className="text-sm font-medium text-primary hover:underline">
                      {t.t('common.view_all')}
                    </Link>
                  }
                />
                {live.length === 0 ? (
                  <EmptyState icon="bi-camera-video-off" title={t.t('online.none')} />
                ) : (
                  <ul className="divide-y divide-line-soft">
                    {live.map((row) => {
                      const starts = startsAt(row.class_date, row.start_time);
                      // The join button appears 10 minutes before the start, as
                      // the portal does: earlier and students sit in an empty room.
                      const joinable = Date.now() >= starts - 10 * 60_000;
                      return (
                        <li key={row.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium text-ink">{row.subject}</span>
                            <span className="block text-xs text-ink-muted">
                              {t.date(row.class_date, 'd M Y')} · {t.date(row.start_time, 'h:i A')}
                            </span>
                          </span>
                          {joinable && row.meet_url && (
                            <a
                              href={row.meet_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-orbit bg-primary px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary-hover"
                            >
                              {t.t('student.live.join_now')}
                            </a>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>

              {/* ------------------------------------------------- assignments */}
              <Card>
                <CardHeader
                  title={t.t('student.dash.assignments')}
                  icon="bi-file-earmark-text"
                  actions={
                    <Link href="/student/assignments" className="text-sm font-medium text-primary hover:underline">
                      {t.t('common.view_all')}
                    </Link>
                  }
                />
                {assignments.length === 0 ? (
                  <EmptyState icon="bi-file-earmark-check" title={t.t('student.dash.no_assignments')} />
                ) : (
                  <ul className="divide-y divide-line-soft">
                    {assignments.map((row) => (
                      <li key={row.id} className="flex flex-wrap items-center gap-2 px-5 py-3">
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-ink">{row.title}</span>
                          <span className="block text-xs text-ink-muted">
                            {t.t('student.dash.due_on', { date: t.date(row.due_date, 'd M Y') })}
                          </span>
                        </span>
                        {row.submission ? (
                          <Badge tone="success">{t.t('student.assign.submitted')}</Badge>
                        ) : row.overdue ? (
                          <Badge tone="danger">{t.t('student.assign.overdue')}</Badge>
                        ) : (
                          <Badge tone="warning">{t.t('student.assign.pending')}</Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {/* ----------------------------------------------------- notices */}
              <Card>
                <CardHeader
                  title={t.t('student.dash.notices')}
                  icon="bi-megaphone"
                  actions={
                    <Link href="/student/notices" className="text-sm font-medium text-primary hover:underline">
                      {t.t('common.view_all')}
                    </Link>
                  }
                />
                {notices.length === 0 ? (
                  <EmptyState icon="bi-megaphone" title={t.t('student.dash.no_notices')} />
                ) : (
                  <ul className="divide-y divide-line-soft">
                    {notices.map((row) => (
                      <li key={row.id} className="px-5 py-3">
                        <p className="font-medium text-ink">{row.title}</p>
                        <p className="mt-0.5 text-xs text-ink-muted">
                          {t.date(row.created_at, 'd M Y')}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {/* ----------------------------------------------------- results */}
              <Card>
                <CardHeader
                  title={t.t('student.dash.recent_results')}
                  icon="bi-award"
                  actions={
                    <Link href="/student/results" className="text-sm font-medium text-primary hover:underline">
                      {t.t('common.view_all')}
                    </Link>
                  }
                />
                {results.length === 0 ? (
                  <EmptyState icon="bi-journal-x" title={t.t('student.dash.no_results')} />
                ) : (
                  <ul className="divide-y divide-line-soft">
                    {results.map(({ exam, result }) => (
                      <li key={exam.id} className="flex flex-wrap items-center gap-2 px-5 py-3">
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-ink">{exam.title}</span>
                          <span className="block text-xs text-ink-muted">
                            {t.monthLabel(exam.exam_month)}
                          </span>
                        </span>
                        <span className="text-sm font-semibold tabular-nums text-primary">
                          {result.gpa === null ? '—' : t.digits(result.gpa.toFixed(2))}
                        </span>
                        {result.hasPosition && result.position !== null && (
                          <Badge tone="info">
                            {t.t('result.position')} {t.digits(result.position)}
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {/* --------------------------------------------------- materials */}
              <Card>
                <CardHeader
                  title={t.t('student.dash.materials')}
                  icon="bi-folder2-open"
                  actions={
                    <Link href="/student/materials" className="text-sm font-medium text-primary hover:underline">
                      {t.t('common.view_all')}
                    </Link>
                  }
                />
                {materials.length === 0 ? (
                  <EmptyState icon="bi-folder-x" title={t.t('student.dash.no_materials')} />
                ) : (
                  <ul className="divide-y divide-line-soft">
                    {materials.map((row) => {
                      const href = uploadUrl(row.file_path);
                      return (
                        <li key={row.id} className="flex items-center gap-3 px-5 py-3">
                          <i className="bi bi-file-earmark text-ink-muted" aria-hidden />
                          <span className="min-w-0 flex-1">
                            {href !== '' ? (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-ink hover:text-primary hover:underline"
                              >
                                {row.title}
                              </a>
                            ) : (
                              <span className="font-medium text-ink">{row.title}</span>
                            )}
                            <span className="block text-xs text-ink-muted">
                              {t.date(row.created_at, 'd M Y')}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        );
      }}
    </StudentPage>
  );
}

/**
 * The student's own applications that are still open or were refused.
 *
 * Matched by `applicant_student_id` OR their phone number: an application made
 * before they had an account carries only the number.
 */
async function openApplications(studentId: number, phone: string) {
  try {
    return await prisma.admission.findMany({
      where: {
        OR: [
          { applicant_student_id: studentId },
          ...(phone !== '' ? [{ mobile: phone }] : []),
        ],
        status: { in: ['pending', 'under_review', 'payment_verified', 'rejected'] },
      },
      orderBy: { id: 'desc' },
      take: 3,
      select: { id: true, application_no: true, course: true, status: true },
    });
  } catch {
    return [];
  }
}
