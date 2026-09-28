import type { Metadata } from 'next';
import Link from 'next/link';
import { StudentPage } from '@/components/portal/StudentPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { ButtonLink } from '@/components/ui/Button';
import { getLang, translate } from '@/lib/i18n';
import { studentEnrollments } from '@/lib/student/scope';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'student.courses.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * The student's own courses, from student/courses.php.
 *
 * Every enrolment is shown, not just the active ones — a student needs to see
 * that last year's course has ended rather than finding it silently gone. The
 * status badge says which is which.
 *
 * The legacy `students.course` / `.batch` columns are shown as a separate entry
 * when there is no matching enrolment: older students have only those, and
 * listing enrolments alone would show them an empty page.
 */
export default async function StudentCoursesPage() {
  return (
    <StudentPage
      active="courses"
      title={(t) => t.t('student.courses.title')}
      subtitle={(t) => t.t('student.courses.sub')}
    >
      {async ({ student, t }) => {
        const enrollments = await studentEnrollments(student.id);

        const legacyCourse = (student.course ?? '').trim();
        const legacyCovered = enrollments.some(
          (enrollment) =>
            (enrollment.course_name ?? '').toLowerCase() === legacyCourse.toLowerCase() ||
            (enrollment.course?.name ?? '').toLowerCase() === legacyCourse.toLowerCase()
        );

        if (enrollments.length === 0 && legacyCourse === '') {
          return (
            <Card>
              <EmptyState
                icon="bi-journal-x"
                title={t.t('student.courses.title')}
                body={t.t('student.dash.no_courses')}
                action={
                  <ButtonLink href="/courses" variant="primary">
                    {t.t('student.dash.browse_courses')}
                  </ButtonLink>
                }
              />
            </Card>
          );
        }

        return (
          <div className="space-y-4">
            {enrollments.map((enrollment) => {
              const courseName =
                enrollment.course !== null
                  ? t.pick(enrollment.course, 'name')
                  : (enrollment.course_name ?? '');
              const batchName =
                enrollment.batch !== null
                  ? t.pick(enrollment.batch, 'name')
                  : (enrollment.batch_name ?? '');

              return (
                <Card key={enrollment.id}>
                  <CardHeader
                    title={courseName}
                    subtitle={batchName !== '' ? batchName : undefined}
                    icon="bi-journal-bookmark"
                    actions={
                      <Badge
                        tone={
                          enrollment.status === 'active'
                            ? 'success'
                            : enrollment.status === 'completed'
                              ? 'info'
                              : 'neutral'
                        }
                      >
                        {t.t(`status.${enrollment.status}`)}
                      </Badge>
                    }
                  />
                  <CardBody className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-muted">
                    {enrollment.batch?.batch_type && (
                      <span className="inline-flex items-center gap-1.5">
                        <i className="bi bi-broadcast" aria-hidden />
                        {t.t(
                          enrollment.batch.batch_type === 'online'
                            ? 'course.type_online'
                            : 'course.type_offline'
                        )}
                      </span>
                    )}
                    {enrollment.course_id !== null && (
                      <Link
                        href={`/courses/${enrollment.course_id}`}
                        className="inline-flex items-center gap-1.5 text-primary hover:underline"
                      >
                        <i className="bi bi-box-arrow-up-right" aria-hidden />
                        {t.t('common.details')}
                      </Link>
                    )}
                  </CardBody>
                </Card>
              );
            })}

            {legacyCourse !== '' && !legacyCovered && (
              <Card>
                <CardHeader
                  title={legacyCourse}
                  subtitle={(student.batch ?? '') !== '' ? student.batch! : undefined}
                  icon="bi-journal-bookmark"
                  actions={<Badge tone="neutral">{t.t('att.all_courses_legacy')}</Badge>}
                />
              </Card>
            )}
          </div>
        );
      }}
    </StudentPage>
  );
}
