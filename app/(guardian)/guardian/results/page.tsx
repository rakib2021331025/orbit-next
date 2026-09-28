import type { Metadata } from 'next';
import Link from 'next/link';
import { GuardianPage } from '@/components/portal/GuardianPage';
import { Card, CardBody, StatCard } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { getLang, translate } from '@/lib/i18n';
import { studentPublishedResults } from '@/lib/results/exam';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'guardian.results.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * A child's published monthly results, from guardian/results.php.
 *
 * Only PUBLISHED exams in which the child has marks. The average is taken over
 * COMPLETE results only, as the original does — an exam with a subject still
 * unmarked would drag the average down for a reason that is not the child's.
 */
export default async function GuardianResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  const params = await searchParams;

  return (
    <GuardianPage
      active="results"
      needsChild
      searchParams={params}
      title={(t) => t.t('guardian.results.title')}
      subtitle={(t, child) => (child ? t.t('guardian.results.sub', { name: t.pick(child, 'name') }) : '')}
    >
      {async ({ child, t }) => {
        if (!child) return null;
        const results = await studentPublishedResults(child.id);

        if (results.length === 0) {
          return (
            <Card>
              <EmptyState icon="bi-clipboard-data" title={t.t('guardian.results.title')} body={t.t('guardian.results.none')} />
            </Card>
          );
        }

        const complete = results.filter((entry) => entry.result.complete);
        const avg =
          complete.length > 0
            ? complete.reduce((sum, entry) => sum + entry.result.percentage, 0) / complete.length
            : null;
        const gpas = results.map((entry) => entry.result.gpa).filter((gpa): gpa is number => gpa !== null);
        const best = gpas.length > 0 ? Math.max(...gpas) : null;
        const q = `?student=${child.id}`;

        return (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard label={t.t('student.results.exams_taken')} value={t.digits(results.length)} icon="bi-journal-text" />
              <StatCard
                label={t.t('student.results.avg')}
                value={avg === null ? '—' : `${t.number(avg, 1)}%`}
                icon="bi-percent"
                tone="success"
              />
              <StatCard
                label={t.t('student.results.best_gpa')}
                value={best === null ? '—' : t.number(best, 2)}
                icon="bi-trophy-fill"
                tone="primary"
                href={`/guardian/progress${q}`}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {results.map(({ exam, result, stats }) => (
                <Card key={exam.id} className="flex flex-col">
                  <CardBody className="flex-1 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="font-head font-semibold text-ink-heading">{t.pick(exam, 'title')}</h2>
                        <p className="text-xs text-ink-muted">{t.monthLabel(exam.exam_month)}</p>
                      </div>
                      {!result.complete ? (
                        <Badge tone="warning">{t.t('result.incomplete')}</Badge>
                      ) : result.passed ? (
                        <Badge tone="success">{t.t('result.pass')}</Badge>
                      ) : (
                        <Badge tone="danger">{t.t('result.fail')}</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-end gap-5">
                      <Figure big value={result.gpa === null ? '—' : t.number(result.gpa, 2)} label={t.t('result.gpa')} />
                      <Figure value={result.grade || '—'} label={t.t('result.grade')} />
                      <Figure value={`${t.number(result.percentage, 1)}%`} label={t.t('result.percentage')} />
                      {result.hasPosition && result.position ? (
                        <Figure
                          value={t.t('result.position_of', {
                            position: t.digits(result.position),
                            total: t.digits(stats.complete),
                          })}
                          label={t.t('result.position')}
                        />
                      ) : null}
                    </div>
                  </CardBody>
                  <div className="flex flex-wrap justify-end gap-2 border-t border-line-soft px-5 py-3">
                    <Link
                      href={`/guardian/marksheet${q}&exam=${exam.id}`}
                      className="inline-flex items-center gap-1.5 rounded-orbit border border-primary px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary-soft"
                    >
                      <i className="bi bi-file-earmark-text" aria-hidden />
                      {t.t('student.results.view')}
                    </Link>
                    <a
                      href={`/api/marksheet?exam=${exam.id}&student=${child.id}&format=pdf`}
                      className="inline-flex items-center gap-1.5 rounded-orbit bg-primary px-3 py-1.5 text-sm font-medium text-white"
                    >
                      <i className="bi bi-file-earmark-pdf" aria-hidden />
                      {t.t('student.results.download_pdf')}
                    </a>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        );
      }}
    </GuardianPage>
  );
}

function Figure({ value, label, big = false }: { value: string; label: string; big?: boolean }) {
  return (
    <div>
      <div className={big ? 'font-head text-2xl font-semibold text-primary' : 'font-head text-lg font-semibold'}>{value}</div>
      <div className="text-xs text-ink-muted">{label}</div>
    </div>
  );
}
