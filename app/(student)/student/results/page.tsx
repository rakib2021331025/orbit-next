import type { Metadata } from 'next';
import Link from 'next/link';
import { StudentPage } from '@/components/portal/StudentPage';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { getLang, translate } from '@/lib/i18n';
import { studentPublishedResults } from '@/lib/results/exam';
import { formatMark } from '@/lib/results/grades';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'student.results.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * The student's published results, from student/results.php.
 *
 * Only PUBLISHED exams appear — a draft exam's marks are the teacher's working
 * copy, and showing them would mean a student sees a grade that later changes.
 *
 * Each exam shows the subject breakdown, because a GPA on its own does not tell a
 * student which subject to work on, and the per-subject pass mark is what explains
 * an F that the percentage alone would not.
 */
export default async function StudentResultsPage() {
  return (
    <StudentPage
      active="results"
      title={(t) => t.t('student.results.title')}
      subtitle={(t) => t.t('student.results.sub')}
    >
      {async ({ student, t }) => {
        const results = await studentPublishedResults(student.id);

        if (results.length === 0) {
          return (
            <Card>
              <EmptyState
                icon="bi-journal-x"
                title={t.t('student.results.title')}
                body={t.t('student.results.none')}
              />
            </Card>
          );
        }

        const gpas = results
          .map((entry) => entry.result.gpa)
          .filter((gpa): gpa is number => gpa !== null);
        const bestGpa = gpas.length > 0 ? Math.max(...gpas) : null;
        const averagePercentage =
          results.length > 0
            ? results.reduce((sum, entry) => sum + entry.result.percentage, 0) / results.length
            : 0;

        return (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                label={t.t('student.results.exams_taken')}
                value={t.digits(results.length)}
                icon="bi-journal-check"
              />
              <StatCard
                label={t.t('student.results.best_gpa')}
                value={bestGpa === null ? '—' : t.digits(bestGpa.toFixed(2))}
                icon="bi-award"
                tone="primary"
              />
              <StatCard
                label={t.t('student.results.avg')}
                value={`${t.digits(averagePercentage.toFixed(1))}%`}
                icon="bi-graph-up"
              />
            </div>

            {results.map(({ exam, result }) => (
              <Card key={exam.id}>
                <CardHeader
                  title={exam.title}
                  subtitle={t.monthLabel(exam.exam_month)}
                  icon="bi-clipboard-data"
                  actions={
                    <div className="flex flex-wrap items-center gap-2">
                      {!result.complete ? (
                        <Badge tone="warning">{t.t('result.incomplete')}</Badge>
                      ) : result.passed ? (
                        <Badge tone="success">{t.t('result.pass')}</Badge>
                      ) : (
                        <Badge tone="danger">{t.t('result.fail')}</Badge>
                      )}
                      <Link
                        href={`/student/marksheet?exam=${exam.id}`}
                        className="rounded-orbit border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-2"
                      >
                        <i className="bi bi-file-earmark-text me-1.5" aria-hidden />
                        {t.t('student.results.view')}
                      </Link>
                    </div>
                  }
                />

                <CardBody className="grid gap-4 sm:grid-cols-4">
                  <Figure label={t.t('result.gpa')} value={result.gpa === null ? '—' : t.digits(result.gpa.toFixed(2))} strong />
                  <Figure label={t.t('result.grade')} value={result.grade || '—'} />
                  <Figure
                    label={t.t('result.total_marks')}
                    value={`${t.digits(formatMark(result.totalObtained, t.digits))} / ${t.digits(result.totalFull)}`}
                  />
                  {result.hasPosition && result.position !== null ? (
                    <Figure
                      label={t.t('result.position')}
                      value={t.digits(result.position)}
                    />
                  ) : (
                    <Figure label={t.t('result.percentage')} value={`${t.digits(result.percentage)}%`} />
                  )}
                </CardBody>

                <TableWrap>
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>{t.t('result.subject')}</Th>
                        <Th alignment="end" numeric>{t.t('result.obtained')}</Th>
                        <Th alignment="end" numeric>{t.t('result.full_marks')}</Th>
                        <Th alignment="center">{t.t('result.grade')}</Th>
                        <Th alignment="center">{t.t('common.status')}</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {result.subjects.map((row) => (
                        <Tr key={row.subject.id}>
                          <Td>{t.pick(row.subject, 'subject_name')}</Td>
                          <Td alignment="end" numeric>
                            {row.absent
                              ? t.t('result.absent_short')
                              : row.entered
                                ? formatMark(row.obtained, t.digits)
                                : '—'}
                          </Td>
                          <Td alignment="end" numeric>
                            {formatMark(row.full, t.digits)}
                          </Td>
                          <Td alignment="center">{row.grade || '—'}</Td>
                          <Td alignment="center">
                            {!row.entered ? (
                              <span className="text-xs text-ink-muted">{t.t('result.not_entered')}</span>
                            ) : row.absent ? (
                              <Badge tone="neutral">{t.t('result.absent')}</Badge>
                            ) : row.passed ? (
                              <Badge tone="success">{t.t('result.pass')}</Badge>
                            ) : (
                              <Badge tone="danger">{t.t('result.fail')}</Badge>
                            )}
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </TableWrap>

                {result.subjects.some((row) => row.feedback !== '') && (
                  <CardBody className="border-t border-line-soft">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      {t.t('result.feedback')}
                    </p>
                    <ul className="mt-2 space-y-1.5 text-sm text-ink">
                      {result.subjects
                        .filter((row) => row.feedback !== '')
                        .map((row) => (
                          <li key={row.subject.id}>
                            <span className="font-medium">{t.pick(row.subject, 'subject_name')}:</span>{' '}
                            {row.feedback}
                          </li>
                        ))}
                    </ul>
                  </CardBody>
                )}

                <div className="border-t border-line-soft bg-surface-2 px-5 py-2.5 text-xs text-ink-muted">
                  {t.t('result.grading_note')}
                </div>
              </Card>
            ))}
          </div>
        );
      }}
    </StudentPage>
  );
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-ink-muted">{label}</p>
      <p
        className={
          strong
            ? 'mt-0.5 font-head text-2xl font-semibold tabular-nums text-primary'
            : 'mt-0.5 font-head text-lg font-semibold tabular-nums text-ink-heading'
        }
      >
        {value}
      </p>
    </div>
  );
}
