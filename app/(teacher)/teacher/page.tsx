import type { Metadata } from 'next';
import Link from 'next/link';
import { TeacherPage } from '@/components/portal/TeacherPage';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { ButtonLink } from '@/components/ui/Button';
import { getLang, translate } from '@/lib/i18n';
import {
  teacherAssignments,
  teacherClassesToday,
  teacherClassesUpcoming,
  teacherStats,
  teacherUpcomingExams,
} from '@/lib/teacher/data';
import { fetchAttempts } from '@/lib/exams/evaluation';
import { recentNotifications } from '@/lib/notifications/counts';
import { safeUrl } from '@/lib/site/url';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'tch.nav.dashboard'),
    robots: { index: false, follow: false },
  };
}

/**
 * The teacher's home, from teacher/dashboard.php.
 *
 * Read-only: nothing on this page changes data. It answers the four questions a
 * teacher opens the portal with — what am I teaching today, what is waiting for
 * me to mark, what is coming, and what happened while I was away.
 */
export default async function TeacherDashboard() {
  return (
    <TeacherPage
      active="dashboard"
      title={(t, teacher) => t.t('tch.dash.welcome', { name: t.pick(teacher, 'name') })}
    >
      {async ({ teacher, t }) => {
        const [today, upcoming, exams, pending, notifications, assignments] = await Promise.all([
          teacherClassesToday(teacher.id),
          teacherClassesUpcoming(teacher.id),
          teacherUpcomingExams(teacher.id),
          fetchAttempts({ teacherId: teacher.id, status: 'submitted' }, 8),
          recentNotifications('teacher', teacher.id, 6),
          teacherAssignments(teacher.id),
        ]);

        const stats = await teacherStats(teacher.id, today.length);

        const examTypeLabel = (type: string) => {
          const key = `tch.dash.exam_type_${type}`;
          const label = t.t(key);
          // t() returns the key itself when there is no translation.
          return label === key ? type.toUpperCase() : label;
        };

        return (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label={t.t('tch.dash.stat_today')}
                value={t.digits(stats.classesToday)}
                icon="bi-camera-video"
                href="/teacher/live-classes"
              />
              <StatCard
                label={t.t('tch.dash.stat_pending')}
                value={t.digits(stats.pending)}
                icon="bi-clipboard-check"
                tone={stats.pending > 0 ? 'warning' : 'success'}
                href="/teacher/evaluations"
              />
              <StatCard
                label={t.t('tch.dash.stat_exams')}
                value={t.digits(stats.exams)}
                icon="bi-journal-check"
                href="/teacher/exams"
              />
              <StatCard
                label={t.t('tch.dash.stat_students')}
                value={t.digits(stats.students)}
                icon="bi-people"
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* --------------------------------------------- today's classes */}
              <Card>
                <CardHeader
                  title={t.t('tch.dash.today')}
                  icon="bi-calendar-day"
                  actions={
                    <ButtonLink href="/teacher/live-classes" variant="ghost" size="sm">
                      {t.t('tch.nav.live')}
                    </ButtonLink>
                  }
                />
                {today.length === 0 ? (
                  <EmptyState icon="bi-calendar-x" title={t.t('tch.dash.no_today')} />
                ) : (
                  <ul className="divide-y divide-line-soft">
                    {today.map((row) => {
                      const link = safeUrl(row.meet_url);
                      return (
                        <li key={row.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                          <span className="w-20 shrink-0 text-sm tabular-nums text-ink-muted">
                            {t.date(row.start_time, 'h:i A')}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium text-ink">{row.subject}</span>
                            <span className="block text-xs text-ink-muted">
                              {[row.course, row.batch].filter(Boolean).join(' · ') ||
                                t.t('lcl.everyone')}
                            </span>
                          </span>
                          {link !== '' ? (
                            <a
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-orbit bg-primary px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary-hover"
                            >
                              {t.t('tch.dash.start')}
                            </a>
                          ) : (
                            <Badge tone="warning">{t.t('lcl.no_link')}</Badge>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>

              {/* ----------------------------------------------- waiting to mark */}
              <Card>
                <CardHeader
                  title={t.t('tch.dash.pending')}
                  icon="bi-clipboard-check"
                  actions={
                    <ButtonLink href="/teacher/evaluations" variant="ghost" size="sm">
                      {t.t('common.view_all')}
                    </ButtonLink>
                  }
                />
                {pending.length === 0 ? (
                  <EmptyState icon="bi-check2-circle" title={t.t('tch.dash.no_pending')} />
                ) : (
                  <ul className="divide-y divide-line-soft">
                    {pending.map((attempt) => (
                      <li key={attempt.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-ink">
                            {t.pick(attempt.student, 'name')}
                          </span>
                          <span className="block text-xs text-ink-muted">
                            {attempt.exam.title} ·{' '}
                            {attempt.submitted_at
                              ? t.t('tch.dash.submitted', {
                                  date: t.date(attempt.submitted_at, 'd M Y'),
                                })
                              : ''}
                          </span>
                        </span>
                        <Link
                          href={`/teacher/evaluate/${attempt.id}`}
                          className="rounded-orbit border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-2"
                        >
                          {t.t('tch.dash.evaluate')}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {/* -------------------------------------------------- next 7 days */}
              <Card>
                <CardHeader title={t.t('tch.dash.next7')} icon="bi-calendar-week" />
                {upcoming.length === 0 ? (
                  <EmptyState icon="bi-calendar" title={t.t('tch.dash.no_next7')} />
                ) : (
                  <ul className="divide-y divide-line-soft">
                    {upcoming.map((row) => (
                      <li key={row.id} className="flex items-center gap-3 px-5 py-3">
                        <span className="w-28 shrink-0 text-xs tabular-nums text-ink-muted">
                          {t.date(row.class_date, 'd M')} · {t.date(row.start_time, 'h:i A')}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-ink">{row.subject}</span>
                          {row.topic && (
                            <span className="block truncate text-xs text-ink-muted">{row.topic}</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {/* ------------------------------------------------ upcoming exams */}
              <Card>
                <CardHeader
                  title={t.t('tch.dash.upcoming_exams')}
                  icon="bi-journal-check"
                  actions={
                    <ButtonLink href="/teacher/exams" variant="ghost" size="sm">
                      {t.t('common.view_all')}
                    </ButtonLink>
                  }
                />
                {exams.length === 0 ? (
                  <EmptyState
                    icon="bi-journal-plus"
                    title={t.t('tch.dash.no_exams')}
                    action={
                      <ButtonLink href="/teacher/exams" variant="primary" size="sm">
                        {t.t('tch.dash.create_one')}
                      </ButtonLink>
                    }
                  />
                ) : (
                  <ul className="divide-y divide-line-soft">
                    {exams.map((exam) => (
                      <li key={exam.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-ink">{exam.title}</span>
                          <span className="block text-xs text-ink-muted">
                            {t.date(exam.start_datetime, 'd M Y, h:i A')} ·{' '}
                            {t.t('tch.dash.questions')}: {t.digits(exam._count.examQuestion_exam)} ·{' '}
                            {t.t('tch.dash.attempts')}: {t.digits(exam._count.examAttempt_exam)}
                          </span>
                        </span>
                        <Badge tone={exam.status === 'published' ? 'success' : 'neutral'}>
                          {examTypeLabel(exam.exam_type)}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* ------------------------------------------------ notifications */}
              <Card>
                <CardHeader
                  title={t.t('tch.nav.notifications')}
                  icon="bi-bell"
                  actions={
                    <ButtonLink href="/teacher/notifications" variant="ghost" size="sm">
                      {t.t('common.view_all')}
                    </ButtonLink>
                  }
                />
                {notifications.length === 0 ? (
                  <EmptyState icon="bi-bell-slash" title={t.t('tch.no_notifications')} />
                ) : (
                  <ul className="divide-y divide-line-soft">
                    {notifications.map((row) => (
                      <li key={row.id} className="px-5 py-3">
                        <p className="flex items-center gap-2 font-medium text-ink">
                          {row.title}
                          {!row.is_read && <Badge tone="info">{t.t('tch.notif.new')}</Badge>}
                        </p>
                        {row.message && (
                          <p className="mt-0.5 text-sm text-ink-muted">{row.message}</p>
                        )}
                        <p className="mt-1 text-xs text-ink-muted">
                          {t.date(row.created_at, 'd M Y, h:i A')}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {/* -------------------------------------------------- assignments */}
              <Card>
                <CardHeader title={t.t('tch.dash.assignments')} icon="bi-person-badge" />
                <CardBody className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      {t.t('tch.dash.subjects')}
                    </p>
                    {assignments.subjects.length === 0 ? (
                      <p className="mt-1 text-sm text-ink-muted">{t.t('tch.dash.no_subjects')}</p>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {assignments.subjects.map((subject) => (
                          <Badge key={subject} tone="info">
                            {subject}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      {t.t('tch.dash.batches')}
                    </p>
                    {assignments.batches.length === 0 ? (
                      <p className="mt-1 text-sm text-ink-muted">{t.t('tch.dash.no_batches')}</p>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {assignments.batches.map((batch) => (
                          <Badge key={batch} tone="neutral">
                            {batch}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </CardBody>
              </Card>
            </div>
          </div>
        );
      }}
    </TeacherPage>
  );
}
