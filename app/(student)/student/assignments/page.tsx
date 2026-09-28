import type { Metadata } from 'next';
import { StudentPage } from '@/components/portal/StudentPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { getLang, translate } from '@/lib/i18n';
import { studentScope } from '@/lib/student/scope';
import { studentAssignments } from '@/lib/student/data';
import { uploadUrl, submissionUrl } from '@/lib/storage/url';
import { formatMark } from '@/lib/results/grades';
import { SubmitForm } from './SubmitForm';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'student.assign.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * The student's assignments, from student/assignments.php.
 *
 * Open ones first by due date, then the rest. Each shows the student's own
 * submission when there is one, with its marks and the teacher's feedback — which
 * is the whole reason a student comes back to this page after submitting.
 */
export default async function StudentAssignmentsPage() {
  return (
    <StudentPage
      active="assignments"
      title={(t) => t.t('student.assign.title')}
      subtitle={(t) => t.t('student.assign.sub')}
    >
      {async ({ student, t }) => {
        const scope = await studentScope(student);
        const assignments = await studentAssignments(student.id, scope, 100);

        if (assignments.length === 0) {
          return (
            <Card>
              <EmptyState
                icon="bi-file-earmark-check"
                title={t.t('student.assign.title')}
                body={t.t('student.assign.none')}
              />
            </Card>
          );
        }

        return (
          <div className="space-y-4">
            {assignments.map((row) => {
              const brief = uploadUrl(row.file_path);
              const submission = row.submission;
              const marked = submission?.marks !== null && submission?.marks !== undefined;

              return (
                <Card key={row.id}>
                  <CardHeader
                    title={row.title}
                    subtitle={t.t('student.assign.due', { date: t.date(row.due_date, 'd M Y') })}
                    icon="bi-file-earmark-text"
                    actions={
                      submission ? (
                        marked ? (
                          <Badge tone="info">
                            {t.t('student.assign.sub_marks', {
                              marks: formatMark(Number(submission.marks), t.digits),
                            })}
                          </Badge>
                        ) : (
                          <Badge tone="success">{t.t('student.assign.submitted')}</Badge>
                        )
                      ) : row.overdue ? (
                        <Badge tone="danger">{t.t('student.assign.overdue')}</Badge>
                      ) : (
                        <Badge tone="warning">{t.t('student.assign.pending')}</Badge>
                      )
                    }
                  />

                  <CardBody className="space-y-4">
                    {row.description && (
                      <p className="whitespace-pre-line text-sm text-ink">{row.description}</p>
                    )}

                    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
                      {row.course && <span>{row.course}</span>}
                      {row.batch && <span>{row.batch}</span>}
                      <span>{t.date(row.created_at, 'd M Y')}</span>
                    </p>

                    {brief !== '' && (
                      <a
                        href={brief}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                      >
                        <i className="bi bi-download" aria-hidden />
                        {t.t('student.assign.download')}
                      </a>
                    )}

                    {submission && (
                      <div className="rounded-orbit border border-line-soft bg-surface-2 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                          {t.t('student.assign.view_submission')}
                        </p>
                        <p className="mt-1.5 flex flex-wrap items-center gap-3 text-sm">
                          <a
                            href={submissionUrl(submission)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-primary hover:underline"
                          >
                            <i className="bi bi-paperclip me-1.5" aria-hidden />
                            {t.t('common.download')}
                          </a>
                          <span className="text-ink-muted">
                            {t.t('student.assign.sub_on', {
                              date: t.date(submission.submitted_at, 'd M Y, h:i A'),
                            })}
                          </span>
                          {submission.submitted_at > row.due_date && (
                            <Badge tone="warning">{t.t('student.assign.sub_late')}</Badge>
                          )}
                        </p>

                        {submission.feedback && (
                          <p className="mt-3 text-sm">
                            <span className="font-medium text-ink">
                              {t.t('student.assign.sub_feedback')}:
                            </span>{' '}
                            <span className="text-ink-muted">{submission.feedback}</span>
                          </p>
                        )}
                      </div>
                    )}

                    {/* A marked submission is frozen; the form is not offered. */}
                    {marked ? (
                      <p className="text-xs text-ink-muted">{t.t('student.assign.sub_marked')}</p>
                    ) : (
                      <SubmitForm
                        assignmentId={row.id}
                        hasSubmission={submission !== null}
                        overdue={row.overdue}
                        labels={{
                          file: t.t('student.assign.sub_file'),
                          hint: t.t('student.assign.sub_hint', { size: t.digits(10) }),
                          submit: t.t('student.assign.sub_btn'),
                          replace: t.t('student.assign.sub_replace_btn'),
                          replaceLabel: t.t('student.assign.sub_replace'),
                          overdueNote: t.t('student.assign.sub_overdue_note'),
                          submitted: t.t('student.assign.sub_done'),
                          replaced: t.t('student.assign.sub_replaced'),
                        }}
                      />
                    )}
                  </CardBody>
                </Card>
              );
            })}
          </div>
        );
      }}
    </StudentPage>
  );
}
