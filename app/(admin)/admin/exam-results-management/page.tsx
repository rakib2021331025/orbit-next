import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback';
import { Pagination } from '@/components/ui/Pagination';
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { getLang, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { GRADE_SCALE, formatMark, gradeForPercentage } from '@/lib/results/grades';
import { resultCounts, resultFilters, resultList } from '@/lib/exams/results';
import { DeleteResult, ResultForm } from './ResultForms';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'aexres.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * Hand-entered exam results, from admin/exam_results_management.php.
 *
 * Monthly exam marks share the table and are listed here too, but only to be
 * read: each one links to the exam that owns it. Grading, ranking and
 * publishing happen there, together, or a result would end up half-changed.
 */
export default async function AdminExamResultsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  return (
    <AdminPage
      active="monthly_exams"
      route="/admin/exam-results-management"
      level="super"
      title=""
    >
      {async ({ t }) => {
        const filters = resultFilters(params);
        const [{ rows, pager }, counts] = await Promise.all([
          resultList(filters),
          resultCounts(),
        ]);

        const editId = /^\d+$/.test(params.edit ?? '') ? Number(params.edit) : 0;
        const editing =
          editId > 0
            ? await prisma.examResult.findUnique({ where: { id: editId } }).catch(() => null)
            : null;

        // A monthly row is never editable here; saying so is better than an
        // edit form that refuses on save.
        const locked = editing !== null && editing.monthly_exam_id !== null;
        const missing = editId > 0 && editing === null;
        const editable = editing !== null && !locked ? editing : null;

        interface Option {
          id: number;
          name: string;
          name_bn: string | null;
          course: string;
          student_id_no: string | null;
        }

        const students: Option[] = await prisma.student
          .findMany({
            where: { status: 'approved' },
            orderBy: { name: 'asc' },
            select: { id: true, name: true, name_bn: true, course: true, student_id_no: true },
          })
          .catch((): Option[] => []);

        // A student who is no longer approved must still be selectable for
        // their own result, or saving it would silently change the student.
        if (editable && !students.some((student) => student.id === editable.student_id)) {
          const extra = await prisma.student
            .findUnique({
              where: { id: editable.student_id },
              select: { id: true, name: true, name_bn: true, course: true, student_id_no: true },
            })
            .catch(() => null);
          if (extra) students.push(extra);
        }

        const showForm = editable !== null || params.add === '1' || counts.total === 0;

        const listQuery = new URLSearchParams();
        if (filters.type !== '') listQuery.set('type', filters.type);
        if (filters.q !== '') listQuery.set('q', filters.q);
        const listUrl = `/admin/exam-results-management${
          listQuery.toString() !== '' ? `?${listQuery}` : ''
        }`;
        const withParam = (key: string, value: string) => {
          const query = new URLSearchParams(listQuery);
          query.set(key, value);
          return `/admin/exam-results-management?${query}#resultForm`;
        };

        const tabs: { key: '' | 'manual' | 'monthly'; label: string; count: number }[] = [
          { key: '', label: t.t('aexres.type_all'), count: counts.total },
          { key: 'manual', label: t.t('aexres.type_manual'), count: counts.manual },
          { key: 'monthly', label: t.t('aexres.type_monthly'), count: counts.monthly },
        ];

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-ink-heading">{t.t('aexres.title')}</h1>
                <p className="mt-1 text-sm text-ink-muted">{t.t('aexres.sub')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/admin/monthly-exams"
                  className="rounded-orbit border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-2"
                >
                  <i className="bi bi-clipboard-data me-1" aria-hidden /> {t.t('mexam.title')}
                </Link>
                <Link
                  href={withParam('add', '1')}
                  className="rounded-orbit bg-primary px-3 py-1.5 text-sm font-medium text-white transition hover:bg-primary-hover"
                >
                  <i className="bi bi-plus-circle me-1" aria-hidden /> {t.t('aexres.add')}
                </Link>
              </div>
            </div>

            {missing && <Alert tone="warning">{t.t('aexres.not_found')}</Alert>}
            {locked && <Alert tone="warning">{t.t('aexres.locked')}</Alert>}

            {showForm && (
              <Card>
                <CardHeader
                  title={t.t(editable ? 'aexres.edit' : 'aexres.add')}
                  icon="bi-clipboard-plus"
                />
                <CardBody>
                  <ResultForm
                    values={{
                      id: editable?.id ?? 0,
                      studentId: editable?.student_id ?? 0,
                      examName: editable?.exam_name ?? '',
                      subject: editable?.subject ?? '',
                      marks: editable ? formatMark(Number(editable.marks_obtained), String) : '',
                      total: editable ? formatMark(Number(editable.total_marks), String) : '',
                      grade: editable?.grade ?? '',
                      feedback: editable?.feedback ?? '',
                      examDate: editable?.exam_date
                        ? editable.exam_date.toISOString().slice(0, 10)
                        : '',
                    }}
                    students={students.map((student) => ({
                      id: student.id,
                      label:
                        t.pick(student, 'name') +
                        (() => {
                          const bits = [
                            (student.student_id_no ?? '').trim(),
                            (student.course ?? '').trim(),
                          ].filter((bit) => bit !== '');
                          return bits.length > 0 ? ` — ${bits.join(' · ')}` : '';
                        })(),
                    }))}
                    scale={GRADE_SCALE.map(([minimum, letter]) => [minimum, letter])}
                    cancelHref={listUrl}
                    labels={{
                      student: t.t('common.student'),
                      select: t.t('common.select'),
                      examName: t.t('result.exam_name'),
                      examNamePlaceholder: t.t('aexres.exam_name_ph'),
                      subject: t.t('result.subject'),
                      obtained: t.t('result.obtained'),
                      totalMarks: t.t('result.total_marks'),
                      tooHigh: t.t('aexres.marks_too_high'),
                      grade: t.t('result.grade'),
                      gradeHint: t.t('aexres.grade_hint'),
                      gradePlaceholder: t.t('aexres.grade_ph'),
                      optional: t.t('common.optional'),
                      suggested: t.t('aexres.suggested', { grade: '{grade}', pct: '{pct}' }),
                      useSuggested: t.t('aexres.use_suggested'),
                      examDate: t.t('result.exam_date'),
                      feedback: t.t('result.feedback'),
                      scale: t.t('result.grading_scale'),
                      save: t.t('common.save'),
                      saving: t.t('common.please_wait'),
                      cancel: t.t('common.cancel'),
                    }}
                  />
                </CardBody>
              </Card>
            )}

            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-5 py-3">
                <div className="flex flex-wrap gap-1.5">
                  {tabs.map((tab) => (
                    <Link
                      key={tab.key}
                      href={
                        tab.key === ''
                          ? '/admin/exam-results-management'
                          : `/admin/exam-results-management?type=${tab.key}`
                      }
                      aria-current={filters.type === tab.key ? 'page' : undefined}
                      className={`inline-flex items-center gap-2 rounded-orbit px-3 py-1 text-sm font-medium transition ${
                        filters.type === tab.key
                          ? 'bg-primary text-white'
                          : 'border border-line text-ink hover:bg-surface-2'
                      }`}
                    >
                      {tab.label}
                      <span className="rounded-full bg-black/10 px-2 text-xs">
                        {t.digits(tab.count)}
                      </span>
                    </Link>
                  ))}
                </div>

                <form method="get" role="search" className="flex flex-wrap gap-2">
                  {filters.type !== '' && (
                    <input type="hidden" name="type" value={filters.type} />
                  )}
                  <input
                    type="search"
                    name="q"
                    maxLength={100}
                    defaultValue={filters.q}
                    placeholder={t.t('aexres.search')}
                    aria-label={t.t('aexres.search')}
                    className="rounded-orbit border border-line bg-surface px-3 py-1.5 text-sm text-ink"
                  />
                  <button
                    type="submit"
                    title={t.t('common.search')}
                    className="rounded-orbit border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-2"
                  >
                    <i className="bi bi-search" aria-hidden />
                    <span className="sr-only">{t.t('common.search')}</span>
                  </button>
                  {filters.q !== '' && (
                    <Link
                      href={
                        filters.type === ''
                          ? '/admin/exam-results-management'
                          : `/admin/exam-results-management?type=${filters.type}`
                      }
                      className="self-center text-sm text-primary hover:underline"
                    >
                      {t.t('common.clear')}
                    </Link>
                  )}
                </form>
              </div>

              {rows.length === 0 ? (
                <EmptyState
                  icon="bi-clipboard-x"
                  title={t.t(
                    filters.q !== '' || filters.type !== ''
                      ? 'aexres.none_filtered'
                      : 'aexres.none'
                  )}
                  body={t.t('aexres.sub')}
                />
              ) : (
                <>
                  <TableWrap>
                    <Table>
                      <Thead>
                        <Tr>
                          <Th>{t.t('common.student')}</Th>
                          <Th>{t.t('result.exam')}</Th>
                          <Th>{t.t('result.subject')}</Th>
                          <Th alignment="end">{t.t('result.marks')}</Th>
                          <Th>{t.t('result.grade')}</Th>
                          <Th>{t.t('result.exam_date')}</Th>
                          <Th alignment="end">{t.t('common.actions')}</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {rows.map((row) => {
                          const monthly = row.monthlyExamId !== null;
                          const name =
                            row.studentName !== ''
                              ? t.pick(
                                  { name: row.studentName, name_bn: row.studentNameBn ?? '' },
                                  'name'
                                )
                              : t.t('aexres.unknown_student');
                          const examTitle = monthly
                            ? t.pick(
                                { title: row.examTitle, title_bn: row.examTitleBn ?? '' },
                                'title'
                              )
                            : row.examName;

                          return (
                            <Tr
                              key={row.id}
                              className={editable?.id === row.id ? 'bg-surface-2' : undefined}
                            >
                              <Td>
                                <span className="font-semibold text-ink">{name}</span>
                                <span className="block text-xs text-ink-muted">
                                  {[row.studentIdNo, row.studentCourse]
                                    .filter((bit) => bit !== '')
                                    .join(' · ')}
                                </span>
                              </Td>

                              <Td>
                                <span className="block text-sm text-ink">{examTitle}</span>
                                {monthly && (
                                  <Badge tone="info">
                                    <i className="bi bi-lock me-1" aria-hidden />
                                    {t.t('aexres.monthly_badge')}
                                    {row.examMonth ? ` · ${t.monthLabel(row.examMonth)}` : ''}
                                  </Badge>
                                )}
                              </Td>

                              <Td>{row.subject}</Td>

                              <Td alignment="end">
                                {row.absent ? (
                                  <Badge tone="danger">{t.t('result.absent')}</Badge>
                                ) : (
                                  <>
                                    <span className="font-semibold">
                                      {formatMark(row.marks, t.digits)} /{' '}
                                      {formatMark(row.total, t.digits)}
                                    </span>
                                    <span className="block text-xs text-ink-muted">
                                      {formatMark(row.percentage, t.digits)}%
                                    </span>
                                  </>
                                )}
                              </Td>

                              <Td>
                                {row.grade !== '' ? (
                                  <Badge
                                    tone={row.grade.toUpperCase() === 'F' ? 'danger' : 'success'}
                                  >
                                    {row.grade}
                                  </Badge>
                                ) : !row.absent ? (
                                  <span
                                    title={t.t('aexres.grade_auto')}
                                    className="text-sm text-ink-muted"
                                  >
                                    {gradeForPercentage(row.percentage).grade}{' '}
                                    <i className="bi bi-calculator" aria-hidden />
                                    <span className="sr-only"> ({t.t('aexres.grade_auto')})</span>
                                  </span>
                                ) : (
                                  '—'
                                )}
                              </Td>

                              <Td className="whitespace-nowrap">
                                {row.examDate ? t.date(row.examDate, 'd M Y') : '—'}
                              </Td>

                              <Td alignment="end">
                                {monthly ? (
                                  <Link
                                    href={`/admin/monthly-exams/${row.monthlyExamId}/marks`}
                                    title={t.t('aexres.read_only')}
                                    className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                                  >
                                    <i className="bi bi-box-arrow-up-right me-1" aria-hidden />
                                    {t.t('aexres.open_marks')}
                                  </Link>
                                ) : (
                                  <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                                    <Link
                                      href={withParam('edit', String(row.id))}
                                      title={t.t('common.edit')}
                                      aria-label={`${t.t('common.edit')}: ${name} — ${row.subject}`}
                                      className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                                    >
                                      <i className="bi bi-pencil" aria-hidden />
                                    </Link>
                                    <DeleteResult
                                      resultId={row.id}
                                      studentId={row.studentId}
                                      labels={{
                                        remove: t.t('common.delete'),
                                        confirm: t.t('aexres.delete_confirm'),
                                        dismiss: t.t('common.cancel'),
                                      }}
                                    />
                                  </span>
                                )}
                              </Td>
                            </Tr>
                          );
                        })}
                      </Tbody>
                    </Table>
                  </TableWrap>

                  <CardBody className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-ink-muted">
                      {t.t('aexres.count', { count: t.digits(pager.total) })}
                    </span>
                    {pager.totalPages > 1 && (
                      <Pagination
                        page={pager.page}
                        totalPages={pager.totalPages}
                        hrefFor={(page) => {
                          const query = new URLSearchParams(listQuery);
                          if (page > 1) query.set('page', String(page));
                          const text = query.toString();
                          return `/admin/exam-results-management${text !== '' ? `?${text}` : ''}`;
                        }}
                        labels={{
                          previous: t.t('common.previous'),
                          next: t.t('common.next'),
                          pageOf: t.t('gallery.page_of'),
                        }}
                        format={t.digits}
                      />
                    )}
                  </CardBody>
                </>
              )}
            </Card>
          </div>
        );
      }}
    </AdminPage>
  );
}
