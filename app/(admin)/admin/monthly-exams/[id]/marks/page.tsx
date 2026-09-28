import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card } from '@/components/ui/Card';
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback';
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { getLang, translate } from '@/lib/i18n';
import { monthLabel, pickLocalized } from '@/lib/i18n/format';
import { prisma } from '@/lib/db/prisma';
import { mailIsConfigured, isDeliverable } from '@/lib/email/send';
import { instituteName } from '@/lib/settings';
import { formatMark } from '@/lib/results/grades';
import { examResults } from '@/lib/results/exam';
import { whatsappUrl } from '@/lib/site/url';
import { MarksGrid, PublishPanel, UnpublishButton, type MarkRow } from './MarksForms';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const lang = await getLang();
  const exam = /^\d+$/.test(id)
    ? await prisma.monthlyExam.findUnique({ where: { id: Number(id) } }).catch(() => null)
    : null;

  return {
    title: exam
      ? `${pickLocalized(exam, 'title', lang)} — ${monthLabel(exam.exam_month, lang)}`
      : translate(lang, 'mexam.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * Marks, results and marksheets for one exam, from
 * admin/monthly_exam_marks.php.
 *
 * Two tabs over the same exam: the grid where marks are typed, and the merit
 * list they produce. The result is a draft until it is published — a student
 * seeing a half-entered result is worse than seeing none.
 */
export default async function ExamMarksPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const examId = Number(id);
  const query = await searchParams;

  return (
    <AdminPage active="monthly_exams" route="/admin/monthly-exams" level="super" title="">
      {async ({ t }) => {
        const exam = await prisma.monthlyExam
          .findUnique({
            where: { id: examId },
            include: {
              course: { select: { name: true, name_bn: true } },
              batch: { select: { name: true, name_bn: true } },
            },
          })
          .catch(() => null);
        if (!exam) notFound();

        const tab = query.tab === 'results' ? 'results' : 'marks';
        const published = exam.status === 'published';
        const mailOn = mailIsConfigured();
        const institute = await instituteName(t.lang);

        const computation = await examResults(examId);
        const subjects = computation?.subjects ?? [];
        const students = [...(computation?.students.values() ?? [])];
        const stats =
          computation?.stats ??
          {
            roster: 0,
            complete: 0,
            passed: 0,
            failed: 0,
            passRate: 0,
            highest: 0,
            average: 0,
            totalFull: 0,
          };
        const incomplete = students.filter((result) => !result.complete).length;

        const course = t.pick(
          { name: exam.course?.name ?? '', name_bn: exam.course?.name_bn ?? '' },
          'name'
        );
        const batch = t.pick(
          { name: exam.batch?.name ?? '', name_bn: exam.batch?.name_bn ?? '' },
          'name'
        );

        const heading = `${t.pick(exam, 'title')} — ${t.monthLabel(exam.exam_month)}`;
        const meta = [
          course !== '' ? course : t.t('mexam.not_linked'),
          batch !== '' ? batch : course !== '' ? t.t('mexam.any_batch') : '',
          exam.exam_date ? t.date(exam.exam_date, 'd M Y') : '',
        ].filter((part) => part !== '');

        // Merit order for the results tab; the grid keeps roster order.
        const ranked = [...students].sort(
          (a, b) =>
            (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) ||
            a.student.name.localeCompare(b.student.name)
        );

        const figures: [string, string, string][] = [
          ['bi-people-fill', t.digits(stats.roster), t.t('mexam.roster')],
          ['bi-check2-square', t.digits(stats.complete), t.t('mexam.complete')],
          [
            'bi-trophy-fill',
            `${t.digits(stats.passed)} / ${t.digits(stats.failed)}`,
            `${t.t('result.pass')} / ${t.t('result.fail')}`,
          ],
          ['bi-percent', `${t.number(stats.passRate, 1)}%`, t.t('result.pass_rate')],
          [
            'bi-graph-up-arrow',
            `${formatMark(stats.highest, t.digits)} / ${formatMark(stats.totalFull, t.digits)}`,
            t.t('result.class_highest'),
          ],
          ['bi-bar-chart', formatMark(stats.average, t.digits), t.t('result.class_average')],
        ];

        const gridRows: MarkRow[] = students.map((result) => ({
          studentId: result.student.id,
          name: t.pick(result.student, 'name'),
          idNo:
            (result.student.student_id_no ?? '').trim() !== ''
              ? result.student.student_id_no!.trim()
              : `STU-${result.student.id}`,
          roll: (result.student.roll_number ?? '').trim(),
          cells: result.subjects.map((cell) => ({
            subjectId: cell.subject.id,
            full: cell.full,
            // Latin digits: this is a number being edited, not read.
            value: !cell.entered ? '' : cell.absent ? 'AB' : formatMark(cell.obtained, String),
            label: `${result.student.name} — ${cell.subject.subject_name}`,
          })),
        }));

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <Link href="/admin/monthly-exams" className="text-sm text-primary hover:underline">
                  <i className="bi bi-arrow-left me-1" aria-hidden /> {t.t('mexam.back')}
                </Link>
                <h1 className="mt-1 text-2xl font-bold text-ink-heading">{heading}</h1>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                  <span>{meta.join(' · ')}</span>
                  <Badge tone={published ? 'success' : 'neutral'}>
                    {t.t(published ? 'status.published' : 'status.draft')}
                  </Badge>
                </p>
              </div>

              <div className="flex flex-wrap items-start gap-2">
                <Link
                  href={`/admin/monthly-exams/${examId}/edit`}
                  className="rounded-orbit border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-2"
                >
                  <i className="bi bi-gear me-1" aria-hidden /> {t.t('mexam.edit_exam')}
                </Link>

                {published ? (
                  <UnpublishButton examId={examId} labels={{ unpublish: t.t('mexam.unpublish') }} />
                ) : (
                  <PublishPanel
                    examId={examId}
                    incomplete={incomplete}
                    canPublish={students.some((result) => result.hasMarks)}
                    mailOn={mailOn}
                    labels={{
                      publish: t.t('mexam.publish'),
                      publishing: t.t('common.please_wait'),
                      publishTitle: t.t('mexam.publish_title'),
                      publishBody: t.t('mexam.publish_body'),
                      incomplete: t.t('mexam.publish_incomplete', { count: t.digits(incomplete) }),
                      notifyPortal: t.t('mexam.notify_portal'),
                      notifyEmail: t.t('mexam.notify_email'),
                      mailOff: t.t('mexam.mail_off'),
                      cancel: t.t('common.cancel'),
                    }}
                  />
                )}
              </div>
            </div>

            {!published && (
              <Alert tone="info">
                <i className="bi bi-lock me-1" aria-hidden /> {t.t('mexam.not_published_note')}
              </Alert>
            )}

            <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
              {figures.map(([icon, value, label]) => (
                <div key={label} className="rounded-orbit border border-line bg-surface p-4">
                  <span className="text-lg text-primary">
                    <i className={`bi ${icon}`} aria-hidden />
                  </span>
                  <span className="block text-lg font-bold text-ink-heading">{value}</span>
                  <span className="block text-xs text-ink-muted">{label}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href={`/admin/monthly-exams/${examId}/marks`}
                className={`inline-flex items-center gap-2 rounded-orbit px-3 py-1.5 text-sm font-medium transition ${
                  tab === 'marks'
                    ? 'bg-primary text-white'
                    : 'border border-line text-ink hover:bg-surface-2'
                }`}
              >
                <i className="bi bi-pencil-square" aria-hidden /> {t.t('mexam.marks_tab')}
              </Link>
              <Link
                href={`/admin/monthly-exams/${examId}/marks?tab=results`}
                className={`inline-flex items-center gap-2 rounded-orbit px-3 py-1.5 text-sm font-medium transition ${
                  tab === 'results'
                    ? 'bg-primary text-white'
                    : 'border border-line text-ink hover:bg-surface-2'
                }`}
              >
                <i className="bi bi-award" aria-hidden /> {t.t('mexam.results_tab')}
              </Link>
            </div>

            {students.length === 0 ? (
              <Card>
                <EmptyState
                  icon="bi-people"
                  title={t.t('mexam.no_roster')}
                  body={t.t('mexam.batch_hint')}
                />
              </Card>
            ) : tab === 'marks' ? (
              <MarksGrid
                examId={examId}
                subjects={subjects.map((subject) => ({
                  id: subject.id,
                  name: t.pick(
                    { name: subject.subject_name, name_bn: subject.subject_name_bn ?? '' },
                    'name'
                  ),
                  full: formatMark(subject.full_marks, t.digits),
                  pass: formatMark(subject.pass_marks, t.digits),
                }))}
                rows={gridRows}
                labels={{
                  hint: t.t('mexam.marks_hint'),
                  student: t.t('common.student'),
                  roll: t.t('att.roll'),
                  total: t.t('result.total'),
                  count: t.t('att.students_count', { count: t.digits(students.length) }),
                  save: t.t('mexam.save_marks'),
                  saving: t.t('common.please_wait'),
                }}
              />
            ) : (
              <Card>
                <TableWrap>
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>{t.t('result.position')}</Th>
                        <Th>{t.t('common.student')}</Th>
                        <Th alignment="center">{t.t('result.total')}</Th>
                        <Th alignment="center">%</Th>
                        <Th alignment="center">{t.t('result.gpa')}</Th>
                        <Th alignment="center">{t.t('result.grade')}</Th>
                        <Th>{t.t('result.result')}</Th>
                        <Th alignment="end">{t.t('result.marksheet')}</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {ranked.map((result) => {
                        const student = result.student;
                        const sheet = `/api/marksheet?exam=${examId}&student=${student.id}`;
                        const phone =
                          (student.guardian_phone ?? '').trim() !== ''
                            ? student.guardian_phone!
                            : student.phone;
                        const share = t.t('ms.whatsapp_text', {
                          name: student.name,
                          exam: t.pick(exam, 'title'),
                          month: t.monthLabel(exam.exam_month),
                          institute,
                        });

                        return (
                          <Tr key={student.id}>
                            <Td className="font-bold">
                              {result.position ? t.digits(result.position) : '—'}
                            </Td>
                            <Td>
                              <span className="font-semibold text-ink">
                                {t.pick(student, 'name')}
                              </span>
                              <span className="block text-xs text-ink-muted">
                                {(student.student_id_no ?? '').trim() !== ''
                                  ? student.student_id_no
                                  : `STU-${student.id}`}
                              </span>
                            </Td>
                            <Td alignment="center">
                              {formatMark(result.totalObtained, t.digits)} /{' '}
                              {formatMark(result.totalFull, t.digits)}
                            </Td>
                            <Td alignment="center">{t.number(result.percentage, 1)}</Td>
                            <Td alignment="center" className="font-bold">
                              {result.gpa === null ? '—' : t.number(result.gpa, 2)}
                            </Td>
                            <Td alignment="center">{result.grade !== '' ? result.grade : '—'}</Td>
                            <Td>
                              {result.hasMarks ? (
                                <Badge
                                  tone={
                                    result.failedSubjects > 0
                                      ? 'danger'
                                      : result.complete
                                        ? 'success'
                                        : 'warning'
                                  }
                                >
                                  {t.t(
                                    result.failedSubjects > 0
                                      ? 'result.fail'
                                      : result.complete
                                        ? 'result.pass'
                                        : 'result.incomplete'
                                  )}
                                </Badge>
                              ) : (
                                <Badge tone="neutral">{t.t('result.not_entered')}</Badge>
                              )}
                            </Td>
                            <Td alignment="end">
                              {result.hasMarks ? (
                                <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                                  <a
                                    href={sheet}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={t.t('mexam.view_marksheet')}
                                    aria-label={t.t('mexam.view_marksheet')}
                                    className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                                  >
                                    <i className="bi bi-file-earmark-text" aria-hidden />
                                  </a>
                                  <a
                                    href={`${sheet}&format=pdf`}
                                    title={t.t('ms.download_pdf')}
                                    aria-label={t.t('ms.download_pdf')}
                                    className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                                  >
                                    <i className="bi bi-file-earmark-pdf" aria-hidden />
                                  </a>
                                  {published && phone.trim() !== '' && (
                                    <a
                                      href={whatsappUrl(phone, share)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title={t.t('mexam.whatsapp')}
                                      aria-label={t.t('mexam.whatsapp')}
                                      className="rounded-orbit bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-emerald-700"
                                    >
                                      <i className="bi bi-whatsapp" aria-hidden />
                                    </a>
                                  )}
                                  {published && mailOn && isDeliverable(student.email) && (
                                    <a
                                      href={`/api/marksheet?exam=${examId}&student=${student.id}&send=1`}
                                      title={t.t('mexam.email_marksheet')}
                                      aria-label={t.t('mexam.email_marksheet')}
                                      className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                                    >
                                      <i className="bi bi-envelope" aria-hidden />
                                    </a>
                                  )}
                                </span>
                              ) : (
                                '—'
                              )}
                            </Td>
                          </Tr>
                        );
                      })}
                    </Tbody>
                  </Table>
                </TableWrap>
              </Card>
            )}
          </div>
        );
      }}
    </AdminPage>
  );
}
