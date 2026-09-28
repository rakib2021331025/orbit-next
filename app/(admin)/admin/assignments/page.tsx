import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { getLang, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { branchWhere } from '@/lib/auth/guards';
import { activeBranchId, branchesEnabled } from '@/lib/branch/active';
import { branchList } from '@/lib/branch/stats';
import { uploadUrl } from '@/lib/storage/url';
import { paginate, pageHref } from '@/lib/paginate';
import { audienceOptions } from '@/lib/content/audience';
import { AssignmentForm, AssignmentRowActions } from './AssignmentForms';

export const dynamic = 'force-dynamic';

const MAX_MB = 20;
const TYPES = 'PDF, DOC, DOCX, PPT, PPTX, JPG, PNG';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'aasg.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * Assignments, from admin/assignments_management.php.
 *
 * Each row shows how many students have handed in against how many can see it,
 * which is the number an admin actually wants — "12 of 30" answers "should I
 * chase anybody" in one glance.
 */
export default async function AdminAssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    edit?: string;
    new?: string;
    q?: string;
    course?: string;
    state?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;

  return (
    <AdminPage active="assignments" route="/admin/assignments" title="">
      {async ({ t }) => {
        const search = (params.q ?? '').trim().slice(0, 100);
        const courseFilter = (params.course ?? '').trim();
        const state = params.state === 'open' || params.state === 'closed' ? params.state : '';
        const today = new Date();
        const todayUtc = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));

        const branchScope = await branchWhere();
        const where = {
          ...branchScope,
          ...(courseFilter !== '' ? { course: courseFilter } : {}),
          ...(state === 'open' ? { due_date: { gte: todayUtc } } : {}),
          ...(state === 'closed' ? { due_date: { lt: todayUtc } } : {}),
          ...(search !== ''
            ? {
                OR: [
                  { title: { contains: search, mode: 'insensitive' as const } },
                  { description: { contains: search, mode: 'insensitive' as const } },
                ],
              }
            : {}),
        };

        const total = await prisma.assignment.count({ where }).catch(() => 0);
        const pager = paginate(total, 20, Number(params.page ?? 1));

        const [rows, multiBranch, focus] = await Promise.all([
          prisma.assignment
            .findMany({
              where,
              orderBy: [{ due_date: 'desc' }, { id: 'desc' }],
              take: pager.perPage,
              skip: pager.offset,
              include: {
                _count: { select: { assignmentSubmission_assignment: true } },
              },
            })
            .catch(() => []),
          branchesEnabled(),
          activeBranchId(),
        ]);

        const branches = multiBranch ? await branchList() : [];
        const branchName = new Map(branches.map((branch) => [branch.id, t.pickPair(branch, 'name')]));

        const editId = /^\d+$/.test(params.edit ?? '') ? Number(params.edit) : 0;
        const editing =
          editId > 0
            ? await prisma.assignment.findUnique({ where: { id: editId } }).catch(() => null)
            : null;
        const showForm = editing !== null || params.new !== undefined;

        const options = await audienceOptions([editing?.course ?? null], [editing?.batch ?? null]);

        const query = {
          q: search || undefined,
          course: courseFilter || undefined,
          state: state || undefined,
        };
        const listHref = `/admin/assignments${
          Object.values(query).some((value) => value !== undefined)
            ? `?${new URLSearchParams(
                Object.entries(query).filter(([, value]) => value !== undefined) as [string, string][]
              )}`
            : ''
        }`;

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-ink-heading">{t.t('aasg.title')}</h1>
                <p className="mt-1 text-sm text-ink-muted">{t.t('aasg.sub')}</p>
              </div>
              {!showForm && (
                <Link
                  href="/admin/assignments?new=1"
                  className="inline-flex items-center gap-2 rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                >
                  <i className="bi bi-plus-lg" aria-hidden />
                  {t.t('aasg.create')}
                </Link>
              )}
            </div>

            {showForm && (
              <Card>
                <CardHeader
                  title={t.t(editing ? 'aasg.edit' : 'aasg.create')}
                  subtitle={t.t('aasg.form_sub')}
                  icon="bi-file-earmark-text"
                />
                <CardBody>
                  <AssignmentForm
                    values={{
                      id: editing?.id ?? 0,
                      title: editing?.title ?? '',
                      description: editing?.description ?? '',
                      course: editing?.course ?? '',
                      batch: editing?.batch ?? '',
                      due_date: editing?.due_date
                        ? editing.due_date.toISOString().slice(0, 10)
                        : '',
                      branch_id: editing ? editing.branch_id : focus || null,
                      hasFile: (editing?.file_path ?? '').trim() !== '',
                    }}
                    courses={options.courses}
                    otherCourses={options.otherCourses}
                    batches={options.batches.map((batch) => ({
                      value: batch.value,
                      label: batch.course ? `${batch.course} — ${batch.label}` : batch.label,
                    }))}
                    otherBatches={options.otherBatches}
                    branches={branches.map((branch) => ({
                      id: branch.id,
                      name: t.pickPair(branch, 'name'),
                    }))}
                    fileHint={t.t('aasg.file_hint', { types: TYPES, size: t.digits(MAX_MB) })}
                    cancelHref={listHref}
                    labels={{
                      title: t.t('common.title'),
                      due: t.t('aasg.due_date'),
                      instructions: t.t('aasg.instructions'),
                      course: t.t('common.course'),
                      batch: t.t('common.batch'),
                      allCourses: t.t('aasg.all_courses'),
                      allBatches: t.t('aasg.all_batches'),
                      coursesGroup: t.t('aasg.courses_group'),
                      batchesGroup: t.t('common.batch'),
                      otherGroup: t.t('aasg.other_group'),
                      batchHint: t.t('aasg.batch_hint'),
                      chooseFile: t.t('aasg.choose_file'),
                      replaceFile: t.t('aasg.replace_file'),
                      removeFile: t.t('aasg.remove_file'),
                      branch: t.t('branch.label'),
                      branchAll: t.t('branch.all_branches_shared'),
                      formSub: t.t('aasg.form_sub'),
                      create: t.t('aasg.create'),
                      save: t.t('aasg.save'),
                      back: t.t('aasg.back'),
                    }}
                  />
                </CardBody>
              </Card>
            )}

            <Card>
              <form method="get" className="flex flex-wrap items-end gap-3 px-5 py-4">
                <label className="flex flex-1 flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('common.search')}</span>
                  <input
                    type="search"
                    name="q"
                    defaultValue={search}
                    placeholder={t.t('aasg.search_ph')}
                    className="w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('common.course')}</span>
                  <select
                    name="course"
                    defaultValue={courseFilter}
                    className="max-w-xs rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="">{t.t('aasg.all_courses')}</option>
                    {[...options.courses.map((course) => course.value), ...options.otherCourses].map(
                      (name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      )
                    )}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('common.status')}</span>
                  <select
                    name="state"
                    defaultValue={state}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="">{t.t('common.all')}</option>
                    <option value="open">{t.t('aasg.state_open')}</option>
                    <option value="closed">{t.t('aasg.state_closed')}</option>
                  </select>
                </label>

                <button
                  type="submit"
                  className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                >
                  {t.t('common.filter')}
                </button>
                <Link
                  href="/admin/assignments"
                  className="rounded-orbit border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
                >
                  {t.t('common.clear')}
                </Link>
              </form>
            </Card>

            <Card>
              <CardHeader
                title={t.t('aasg.title')}
                icon="bi-file-earmark-text"
                actions={
                  <Badge tone="neutral">{t.t('aasg.count', { count: t.digits(total) })}</Badge>
                }
              />

              {rows.length === 0 ? (
                <EmptyState
                  icon="bi-file-earmark-x"
                  title={t.t(
                    search !== '' || courseFilter !== '' || state !== ''
                      ? 'aasg.none_filtered'
                      : 'aasg.none'
                  )}
                  body={t.t('aasg.sub')}
                />
              ) : (
                <ul className="divide-y divide-line-soft">
                  {rows.map((row) => {
                    const past = row.due_date !== null && row.due_date < todayUtc;

                    return (
                      <li key={row.id} className="px-5 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-ink-heading">{row.title}</span>
                              <Badge tone={past ? 'neutral' : 'success'}>
                                {t.t(past ? 'aasg.state_closed' : 'aasg.state_open')}
                              </Badge>
                              <Badge tone="info">
                                {t.t('aasg.submissions')}:{' '}
                                {t.digits(row._count.assignmentSubmission_assignment)}
                              </Badge>
                            </p>
                            <p className="mt-1 line-clamp-2 text-sm text-ink">{row.description}</p>
                            <p className="mt-1 text-xs text-ink-muted">
                              {[
                                row.due_date
                                  ? t.t('asub.due', { date: t.date(row.due_date, 'd M Y') })
                                  : '',
                                row.course || t.t('aasg.all_courses'),
                                row.batch || t.t('aasg.all_batches'),
                                multiBranch
                                  ? row.branch_id
                                    ? (branchName.get(row.branch_id) ?? '')
                                    : t.t('branch.all_branches')
                                  : '',
                              ]
                                .filter((part) => part !== '')
                                .join(' · ')}
                            </p>
                          </div>

                          <AssignmentRowActions
                            assignmentId={row.id}
                            editHref={`${listHref}${listHref.includes('?') ? '&' : '?'}edit=${row.id}`}
                            briefHref={uploadUrl(row.file_path)}
                            labels={{
                              submissions: t.t('aasg.view_submissions'),
                              brief: t.t('aasg.download_brief'),
                              edit: t.t('common.edit'),
                              remove: t.t('common.delete'),
                              confirmDelete: t.t('aasg.delete_confirm', { title: row.title }),
                              dismiss: t.t('common.cancel'),
                            }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {pager.totalPages > 1 && (
                <CardBody className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft text-sm">
                  <span className="text-ink-muted">
                    {t.t('astd.showing', {
                      from: t.digits(pager.from),
                      to: t.digits(pager.to),
                      total: t.digits(pager.total),
                    })}
                  </span>
                  <span className="flex gap-2">
                    {pager.page > 1 && (
                      <Link
                        href={pageHref('/admin/assignments', query, pager.page - 1)}
                        className="rounded-orbit border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-2"
                      >
                        {t.t('common.previous')}
                      </Link>
                    )}
                    {pager.page < pager.totalPages && (
                      <Link
                        href={pageHref('/admin/assignments', query, pager.page + 1)}
                        className="rounded-orbit border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-2"
                      >
                        {t.t('common.next')}
                      </Link>
                    )}
                  </span>
                </CardBody>
              )}
            </Card>
          </div>
        );
      }}
    </AdminPage>
  );
}
