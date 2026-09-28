import type { Metadata } from 'next';
import Link from 'next/link';
import { StudentPage } from '@/components/portal/StudentPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { getLang, translate } from '@/lib/i18n';
import { studentScope } from '@/lib/student/scope';
import { studentExams } from '@/lib/student/data';
import { autosubmitExpired, examGradeLetter } from '@/lib/exams/engine';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'student.nav.exams'),
    robots: { index: false, follow: false },
  };
}

/**
 * The student's online exams, from student/exams.php.
 *
 * Opening this page auto-submits anything whose time has run out — a student who
 * closed the browser mid-exam still gets their MCQ marks, and the teacher is not
 * left waiting for a submission that will never arrive.
 *
 * Grouped into available / upcoming / finished. An exam the student has already
 * sat counts as finished **regardless of the window**: reopening it would let them
 * answer twice.
 */
export default async function StudentExamsPage() {
  return (
    <StudentPage
      active="exams"
      title={(t) => t.t('student.nav.exams')}
      subtitle={(t) => t.t('student.exams.sub')}
    >
      {async ({ student, t }) => {
        // Close out anything past its deadline before reading the list.
        await autosubmitExpired();

        const scope = await studentScope(student);
        const exams = await studentExams(student.id, scope, 100);

        const now = Date.now();
        const available: typeof exams = [];
        const upcoming: typeof exams = [];
        const finished: typeof exams = [];

        for (const exam of exams) {
          const attempt = exam.examAttempt_exam[0] ?? null;
          const sat = attempt?.status === 'submitted' || attempt?.status === 'evaluated';

          if (sat) {
            // Already sat — finished whatever the window says.
            finished.push(exam);
          } else if (now < exam.start_datetime.getTime()) {
            upcoming.push(exam);
          } else if (now > exam.end_datetime.getTime()) {
            finished.push(exam);
          } else {
            available.push(exam);
          }
        }

        const Section = ({
          title,
          icon,
          rows,
          emptyBody,
        }: {
          title: string;
          icon: string;
          rows: typeof exams;
          emptyBody?: string;
        }) => (
          <Card>
            <CardHeader title={title} icon={icon} />
            {rows.length === 0 ? (
              <EmptyState icon="bi-journal" title={title} body={emptyBody} />
            ) : (
              <ul className="divide-y divide-line-soft">
                {rows.map((exam) => {
                  const attempt = exam.examAttempt_exam[0] ?? null;
                  const running = attempt?.status === 'in_progress';
                  const sat = attempt?.status === 'submitted' || attempt?.status === 'evaluated';
                  const open =
                    now >= exam.start_datetime.getTime() && now <= exam.end_datetime.getTime();
                  const total = Number(exam.total_marks ?? 0);
                  const score = attempt ? Number(attempt.total_score ?? 0) : 0;

                  return (
                    <li key={exam.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink-heading">{exam.title}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
                          <span>{exam.subject}</span>
                          <span>
                            {t.date(exam.start_datetime, 'd M Y, h:i A')} –{' '}
                            {t.date(exam.end_datetime, 'd M Y, h:i A')}
                          </span>
                          <span>{t.t('oex.timer_min', { count: t.digits(exam.duration_minutes) })}</span>
                          <span>
                            {t.t('oex.total_marks')}: {t.digits(total)}
                          </span>
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {sat ? (
                          <>
                            {attempt?.status === 'evaluated' ? (
                              <Badge tone="success">
                                {t.digits(score)} / {t.digits(total)} ·{' '}
                                {examGradeLetter(total > 0 ? (score / total) * 100 : 0)}
                              </Badge>
                            ) : (
                              <Badge tone="info">{t.t('oex.ev_awaiting')}</Badge>
                            )}
                            <Link
                              href={`/student/exams/${exam.id}/result`}
                              className="rounded-orbit border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-2"
                            >
                              {t.t('oex.btn_review')}
                            </Link>
                          </>
                        ) : open ? (
                          <Link
                            href={`/student/exams/${exam.id}/take`}
                            className="rounded-orbit bg-primary px-3 py-1.5 text-sm font-medium text-white transition hover:bg-primary-hover"
                          >
                            {running ? t.t('oex.take_keep_working') : t.t('oex.start_btn')}
                          </Link>
                        ) : now < exam.start_datetime.getTime() ? (
                          <Badge tone="info">{t.t('oex.state_upcoming')}</Badge>
                        ) : (
                          <Badge tone="neutral">{t.t('oex.state_ended')}</Badge>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        );

        if (exams.length === 0) {
          return (
            <Card>
              <EmptyState
                icon="bi-journal-x"
                title={t.t('student.nav.exams')}
                body={t.t('oex.take_flash_no_questions')}
              />
            </Card>
          );
        }

        return (
          <div className="space-y-6">
            <Section
              title={t.t('oex.state_running')}
              icon="bi-pencil-square"
              rows={available}
              emptyBody={t.t('oex.state_ended')}
            />
            {upcoming.length > 0 && (
              <Section title={t.t('oex.state_upcoming')} icon="bi-calendar-event" rows={upcoming} />
            )}
            {finished.length > 0 && (
              <Section title={t.t('oex.submissions')} icon="bi-check2-circle" rows={finished} />
            )}
          </div>
        );
      }}
    </StudentPage>
  );
}
