import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { getLang, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { uploadUrl, submissionUrl, studentPhotoUrl } from '@/lib/storage/url';
import { formatMark } from '@/lib/results/grades';
import { GradeForm } from './GradeForm';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'asub.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * What students handed in for one assignment, from
 * admin/assignment_submissions.php.
 *
 * Unmarked submissions come first: this screen exists to be worked through, and
 * the work is the ones without a mark.
 *
 * A submission handed in after the due date is flagged. The file itself is served
 * through the media route, which authorises by record id — a submission is a
 * student's own work and is not public.
 */
export default async function AdminSubmissionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const assignmentId = /^\d+$/.test(id) ? Number(id) : 0;

  return (
    <AdminPage active="assignments" route="/admin/assignments" title="">
      {async ({ t }) => {
        const assignment = await prisma.assignment
          .findUnique({ where: { id: assignmentId } })
          .catch(() => null);

        if (!assignment) {
          return (
            <Card>
              <EmptyState
                icon="bi-file-earmark-x"
                title={t.t('asub.not_found')}
                body={t.t('aasg.sub')}
                action={
                  <Link
                    href="/admin/assignments"
                    className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                  >
                    {t.t('asub.back')}
                  </Link>
                }
              />
            </Card>
          );
        }

        const submissions = await prisma.assignmentSubmission
          .findMany({
            where: { assignment_id: assignment.id },
            orderBy: [{ submitted_at: 'desc' }],
            include: {
              student: {
                select: {
                  id: true,
                  name: true,
                  name_bn: true,
                  student_id_no: true,
                  image: true,
                  batch: true,
                },
              },
            },
          })
          .catch(() => []);

        // Unmarked first — that is the work this page is for.
        const ordered = [...submissions].sort((a, b) => {
          const aMarked = a.marks !== null;
          const bMarked = b.marks !== null;
          if (aMarked !== bMarked) return aMarked ? 1 : -1;
          return (b.submitted_at?.getTime() ?? 0) - (a.submitted_at?.getTime() ?? 0);
        });

        const graded = submissions.filter((row) => row.marks !== null).length;
        const due = assignment.due_date;

        return (
          <div className="space-y-6">
            <Link
              href="/admin/assignments"
              className="inline-flex items-center gap-2 text-sm font-medium text-ink-muted transition hover:text-primary"
            >
              <span aria-hidden>&larr;</span>
              {t.t('asub.back')}
            </Link>

            <Card>
              <CardHeader
                title={assignment.title}
                subtitle={[
                  due ? t.t('asub.due', { date: t.date(due, 'd M Y') }) : '',
                  assignment.course || t.t('asub.all_batches'),
                  assignment.batch ?? '',
                ]
                  .filter((part) => part !== '')
                  .join(' · ')}
                icon="bi-inbox"
                actions={
                  <span className="flex flex-wrap items-center gap-2">
                    {uploadUrl(assignment.file_path) !== '' && (
                      <a
                        href={uploadUrl(assignment.file_path)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                      >
                        {t.t('asub.brief')}
                      </a>
                    )}
                    <Link
                      href={`/admin/assignments?edit=${assignment.id}`}
                      className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                    >
                      {t.t('asub.edit_assignment')}
                    </Link>
                  </span>
                }
              />
              <CardBody className="flex flex-wrap gap-4 text-sm">
                <span>{t.t('asub.count_total', { count: t.digits(submissions.length) })}</span>
                <span className="text-emerald-700 dark:text-emerald-400">
                  {t.t('asub.count_graded', { count: t.digits(graded) })}
                </span>
                <span className="text-amber-600">
                  {t.t('asub.count_pending', { count: t.digits(submissions.length - graded) })}
                </span>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title={t.t('asub.title')} icon="bi-file-earmark-check" />

              {ordered.length === 0 ? (
                <EmptyState
                  icon="bi-inbox"
                  title={t.t('asub.none')}
                  body={t.t('asub.none_sub')}
                />
              ) : (
                <ul className="divide-y divide-line-soft">
                  {ordered.map((row) => {
                    const late = due !== null && row.submitted_at > due;
                    const file = submissionUrl(row);

                    return (
                      <li key={row.id} className="px-5 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <span className="flex min-w-0 flex-1 items-start gap-3">
                            {studentPhotoUrl(row.student) !== '' && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={studentPhotoUrl(row.student)}
                                alt=""
                                className="h-9 w-9 shrink-0 rounded-full border border-line-soft object-cover"
                              />
                            )}
                            <span className="min-w-0">
                              <span className="flex flex-wrap items-center gap-2">
                                <Link
                                  href={`/admin/students/${row.student.id}`}
                                  className="font-medium text-ink hover:text-primary"
                                >
                                  {t.pick(row.student, 'name')}
                                </Link>
                                {late && <Badge tone="warning">{t.t('asub.late')}</Badge>}
                                {row.marks !== null ? (
                                  <Badge tone="success">
                                    {t.t('asub.marks')}: {formatMark(Number(row.marks), t.digits)}
                                  </Badge>
                                ) : (
                                  <Badge tone="neutral">{t.t('asub.not_marked')}</Badge>
                                )}
                              </span>
                              <span className="block text-xs text-ink-muted">
                                {[
                                  row.student.student_id_no ?? '',
                                  row.student.batch ?? '',
                                  t.t('asub.submitted_on', {
                                    date: t.date(row.submitted_at, 'd M Y, h:i A'),
                                  }),
                                ]
                                  .filter((part) => part !== '')
                                  .join(' · ')}
                              </span>
                              {row.feedback && (
                                <span className="mt-1 block text-xs text-ink">{row.feedback}</span>
                              )}
                            </span>
                          </span>

                          <span className="flex shrink-0 flex-wrap items-center gap-2">
                            {file !== '' ? (
                              <a
                                href={file}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                              >
                                {t.t('asub.open_file')}
                              </a>
                            ) : (
                              <Badge tone="danger">{t.t('asub.file_missing')}</Badge>
                            )}

                            <GradeForm
                              submissionId={row.id}
                              assignmentId={assignment.id}
                              studentName={t.pick(row.student, 'name')}
                              marks={row.marks !== null ? String(Number(row.marks)) : ''}
                              feedback={row.feedback ?? ''}
                              labels={{
                                grade: t.t('asub.grade'),
                                gradeTitle: t.t('asub.grade_title', { name: '{name}' }),
                                marks: t.t('asub.marks'),
                                marksHint: t.t('asub.marks_hint'),
                                feedback: t.t('asub.feedback'),
                                save: t.t('asub.save_marks'),
                                cancel: t.t('common.cancel'),
                              }}
                            />
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        );
      }}
    </AdminPage>
  );
}
