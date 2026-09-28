import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site/SiteHeader';
import { PageHeader, PageBody } from '@/components/site/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback';
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { getTranslator, getLang, translate } from '@/lib/i18n';
import { setting, settingNumber } from '@/lib/settings';
import { prisma } from '@/lib/db/prisma';
import { cachedQuery, TAGS } from '@/lib/cache';
import { examResults } from '@/lib/results/exam';
import { ResultSearch } from './ResultSearch';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title: translate(lang, 'merit.page_title'),
    description: translate(lang, 'merit.meta_description'),
  };
}

/**
 * The public results page, from results.php — two independent halves:
 *
 *   (a) **Result search**: Student ID + the last four digits of a registered
 *       mobile. POSTed so the numbers never reach a URL or a log, throttled, and
 *       answered with one generic error for every kind of mismatch.
 *   (b) **Merit lists**: the top N of each published exam that shows positions.
 *       Names and scores only — never a phone number or a Student ID, because
 *       this half is readable by anyone at all.
 *
 * Both halves can be switched off by an admin, and when both are off the page
 * says so rather than rendering two empty boxes.
 */
export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; page?: string }>;
}) {
  const params = await searchParams;
  const t = await getTranslator();

  const [searchOn, meritOn, meritSize] = await Promise.all([
    setting('result_search_public', '1').then((value) => value === '1'),
    setting('merit_list_public', '1').then((value) => value === '1'),
    settingNumber('merit_list_size', 10),
  ]);
  const topN = Math.max(3, Math.min(50, meritSize || 10));

  // The exam picker on the search form, and the merit lists themselves.
  let publishedExams: { id: number; title: string; exam_month: string; show_position: boolean }[] = [];
  try {
    publishedExams = await cachedQuery(['site:published-exams'], { tags: [TAGS.exams], revalidate: 600 }, () =>
      prisma.monthlyExam.findMany({
      where: { status: 'published' },
      orderBy: [{ exam_month: 'desc' }, { id: 'desc' }],
      take: 60,
      select: { id: true, title: true, exam_month: true, show_position: true },
    })
    );
  } catch {
    // Requires database configuration.
  }

  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month ?? '') ? params.month! : '';
  const meritExams = publishedExams
    .filter((exam) => exam.show_position)
    .filter((exam) => month === '' || exam.exam_month === month)
    .slice(0, 4);

  const months = [...new Set(publishedExams.filter((e) => e.show_position).map((e) => e.exam_month))].slice(0, 36);

  const merit = meritOn
    ? await Promise.all(
        meritExams.map(async (exam) => {
          const computed = await examResults(exam.id);
          const ranked = computed
            ? [...computed.students.values()]
                .filter((result) => result.complete && result.position !== null)
                .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                .slice(0, topN)
            : [];
          return { exam, ranked, total: computed?.stats.complete ?? 0 };
        })
      )
    : [];

  return (
    <>
      <SiteHeader active="results" />
      <PageHeader
        title={t.t('merit.page_title')}
        subtitle={t.t('merit.sub')}
        breadcrumb={[{ href: '/', label: t.t('nav.home') }, { label: t.t('nav.results') }]}
      />

      <PageBody>
        {!searchOn && !meritOn ? (
          <Card>
            <EmptyState
              icon="bi-lock"
              title={t.t('merit.unavailable_title')}
              body={t.t('merit.unavailable_body')}
            />
          </Card>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
            <div className="min-w-0 space-y-8">
              {searchOn && (
                <ResultSearch
                  exams={publishedExams.map((exam) => ({
                    id: exam.id,
                    label: `${exam.title} — ${t.monthLabel(exam.exam_month)}`,
                  }))}
                  labels={{
                    title: t.t('merit.search_title'),
                    sub: t.t('merit.search_sub'),
                    studentId: t.t('common.student_id'),
                    last4: t.t('merit.f_last4'),
                    last4Hint: t.t('merit.f_last4_hint'),
                    exam: t.t('merit.f_exam'),
                    examAll: t.t('merit.f_exam_all'),
                    submit: t.t('merit.submit'),
                    again: t.t('merit.search_again'),
                    privacy: t.t('merit.privacy'),
                    noResults: t.t('merit.no_results'),
                    noResultExam: t.t('merit.no_result_exam'),
                    foundFor: t.t('merit.found_for'),
                    gpa: t.t('result.gpa'),
                    grade: t.t('result.grade'),
                    position: t.t('result.position'),
                    total: t.t('result.total_marks'),
                    marksheet: t.t('merit.view_marksheet'),
                    marksheetNote: t.t('merit.marksheet_note'),
                    incomplete: t.t('result.incomplete'),
                    pass: t.t('result.pass'),
                    fail: t.t('result.fail'),
                  }}
                />
              )}

              {meritOn && (
                <section>
                  <h2 className="font-head text-xl font-semibold text-ink-heading">
                    {t.t('merit.lists_title')}
                  </h2>
                  <p className="mt-1 text-sm text-ink-muted">
                    {t.t('merit.lists_sub', { count: t.digits(topN) })}
                  </p>

                  {months.length > 1 && (
                    <form method="get" className="mt-4 flex flex-wrap items-center gap-2">
                      <label htmlFor="merit-month" className="text-sm text-ink-muted">
                        {t.t('result.month')}
                      </label>
                      <select
                        id="merit-month"
                        name="month"
                        defaultValue={month}
                        className="rounded-orbit border border-line bg-surface px-3 py-1.5 text-sm text-ink"
                      >
                        <option value="">{t.t('merit.any_month')}</option>
                        {months.map((value) => (
                          <option key={value} value={value}>
                            {t.monthLabel(value)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="rounded-orbit bg-primary px-3 py-1.5 text-sm font-medium text-white transition hover:bg-primary-hover"
                      >
                        {t.t('common.filter')}
                      </button>
                    </form>
                  )}

                  <div className="mt-5 space-y-6">
                    {merit.length === 0 ? (
                      <Card>
                        <EmptyState
                          icon="bi-trophy"
                          title={t.t('merit.lists_title')}
                          body={month !== '' ? t.t('merit.no_exams_filtered') : t.t('merit.no_exams')}
                        />
                      </Card>
                    ) : (
                      merit.map(({ exam, ranked, total }) => (
                        <Card key={exam.id}>
                          <CardHeader
                            title={exam.title}
                            subtitle={t.monthLabel(exam.exam_month)}
                            icon="bi-trophy"
                            actions={
                              <Badge tone="neutral">
                                {t.t('merit.ranked_of', { count: t.digits(total) })}
                              </Badge>
                            }
                          />
                          {ranked.length === 0 ? (
                            <EmptyState icon="bi-list-ol" title={t.t('merit.no_ranked')} />
                          ) : (
                            <TableWrap>
                              <Table>
                                <Thead>
                                  <Tr>
                                    <Th alignment="center">{t.t('result.position')}</Th>
                                    <Th>{t.t('common.name')}</Th>
                                    <Th alignment="end" numeric>
                                      {t.t('result.gpa')}
                                    </Th>
                                    <Th alignment="end" numeric>
                                      {t.t('result.total_marks')}
                                    </Th>
                                  </Tr>
                                </Thead>
                                <Tbody>
                                  {ranked.map((result) => (
                                    <Tr key={result.student.id}>
                                      <Td alignment="center" numeric>
                                        {t.digits(result.position ?? 0)}
                                      </Td>
                                      {/* Name only — never the Student ID or a
                                          phone number: this list is public. */}
                                      <Td>{t.pick(result.student, 'name')}</Td>
                                      <Td alignment="end" numeric>
                                        {result.gpa === null ? '—' : t.digits(result.gpa.toFixed(2))}
                                      </Td>
                                      <Td alignment="end" numeric>
                                        {t.digits(result.totalObtained)} / {t.digits(result.totalFull)}
                                      </Td>
                                    </Tr>
                                  ))}
                                </Tbody>
                              </Table>
                            </TableWrap>
                          )}
                        </Card>
                      ))
                    )}
                  </div>
                </section>
              )}
            </div>

            <aside className="space-y-6">
              <Card>
                <CardHeader title={t.t('merit.how_title')} icon="bi-info-circle" />
                <CardBody>
                  <ol className="space-y-3 text-sm text-ink-muted">
                    <li className="flex gap-2">
                      <span aria-hidden className="text-primary">1.</span>
                      {t.t('merit.how_1')}
                    </li>
                    <li className="flex gap-2">
                      <span aria-hidden className="text-primary">2.</span>
                      {t.t('merit.how_2')}
                    </li>
                    <li className="flex gap-2">
                      <span aria-hidden className="text-primary">3.</span>
                      {t.t('merit.how_3')}
                    </li>
                  </ol>
                  <a
                    href="/student/login"
                    className="mt-4 inline-flex items-center gap-2 font-medium text-primary hover:underline"
                  >
                    <i className="bi bi-box-arrow-in-right" aria-hidden />
                    {t.t('merit.portal_login')}
                  </a>
                </CardBody>
              </Card>

              <Alert tone="info" icon="bi-shield-check">
                {t.t('merit.privacy')}
              </Alert>
            </aside>
          </div>
        )}
      </PageBody>
    </>
  );
}
