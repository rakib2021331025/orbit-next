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
import { MaterialForm, MaterialRowActions } from './MaterialForms';

export const dynamic = 'force-dynamic';

const MAX_MB = 30;
const TYPES = 'PDF, DOC, DOCX, PPT, PPTX';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'amat.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * Study materials, from admin/study_materials_management.php.
 *
 * Course and batch are stored as NAMES because that is what the student portal
 * matches against — `lib/content/audience.ts` gathers the selectable names,
 * including the ones only older records still carry.
 */
export default async function AdminMaterialsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; new?: string; q?: string; course?: string; page?: string }>;
}) {
  const params = await searchParams;

  return (
    <AdminPage active="materials" route="/admin/materials" title="">
      {async ({ t }) => {
        const search = (params.q ?? '').trim().slice(0, 100);
        const courseFilter = (params.course ?? '').trim();
        const branchScope = await branchWhere();

        const where = {
          ...branchScope,
          ...(courseFilter !== '' ? { course: courseFilter } : {}),
          ...(search !== ''
            ? {
                OR: [
                  { title: { contains: search, mode: 'insensitive' as const } },
                  { description: { contains: search, mode: 'insensitive' as const } },
                ],
              }
            : {}),
        };

        const total = await prisma.studyMaterial.count({ where }).catch(() => 0);
        const pager = paginate(total, 20, Number(params.page ?? 1));

        const [rows, multiBranch, focus] = await Promise.all([
          prisma.studyMaterial
            .findMany({
              where,
              orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
              take: pager.perPage,
              skip: pager.offset,
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
            ? await prisma.studyMaterial.findUnique({ where: { id: editId } }).catch(() => null)
            : null;
        const showForm = editing !== null || params.new !== undefined;

        const options = await audienceOptions(
          [editing?.course ?? null],
          [editing?.batch ?? null]
        );

        const query = {
          q: search || undefined,
          course: courseFilter || undefined,
        };
        const listHref = `/admin/materials${search !== '' || courseFilter !== '' ? `?${new URLSearchParams(
          Object.entries(query).filter(([, value]) => value !== undefined) as [string, string][]
        )}` : ''}`;

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-ink-heading">{t.t('amat.title')}</h1>
                <p className="mt-1 text-sm text-ink-muted">{t.t('amat.sub')}</p>
              </div>
              {!showForm && (
                <Link
                  href="/admin/materials?new=1"
                  className="inline-flex items-center gap-2 rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                >
                  <i className="bi bi-upload" aria-hidden />
                  {t.t('amat.create')}
                </Link>
              )}
            </div>

            {showForm && (
              <Card>
                <CardHeader
                  title={t.t(editing ? 'amat.edit' : 'amat.create')}
                  subtitle={t.t('amat.form_sub')}
                  icon="bi-folder2-open"
                />
                <CardBody>
                  <MaterialForm
                    values={{
                      id: editing?.id ?? 0,
                      title: editing?.title ?? '',
                      description: editing?.description ?? '',
                      course: editing?.course ?? '',
                      batch: editing?.batch ?? '',
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
                    fileHint={t.t('amat.file_hint', { types: TYPES, size: t.digits(MAX_MB) })}
                    cancelHref={listHref}
                    labels={{
                      title: t.t('common.title'),
                      description: t.t('common.description'),
                      course: t.t('common.course'),
                      batch: t.t('common.batch'),
                      allCourses: t.t('amat.all_courses'),
                      allBatches: t.t('amat.all_batches'),
                      coursesGroup: t.t('amat.courses_group'),
                      batchesGroup: t.t('common.batch'),
                      otherGroup: t.t('amat.other_group'),
                      batchHint: t.t('amat.batch_hint'),
                      chooseFile: t.t('amat.choose_file'),
                      replaceFile: t.t('amat.replace_file'),
                      branch: t.t('branch.label'),
                      branchAll: t.t('branch.all_branches_shared'),
                      formSub: t.t('amat.form_sub'),
                      create: t.t('amat.create'),
                      save: t.t('amat.save'),
                      back: t.t('amat.back'),
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
                    placeholder={t.t('amat.search_ph')}
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
                    <option value="">{t.t('amat.all_courses')}</option>
                    {[...options.courses.map((course) => course.value), ...options.otherCourses].map(
                      (name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      )
                    )}
                  </select>
                </label>

                <button
                  type="submit"
                  className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                >
                  {t.t('common.filter')}
                </button>
                <Link
                  href="/admin/materials"
                  className="rounded-orbit border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
                >
                  {t.t('common.clear')}
                </Link>
              </form>
            </Card>

            <Card>
              <CardHeader
                title={t.t('amat.title')}
                icon="bi-folder2-open"
                actions={
                  <Badge tone="neutral">{t.t('amat.count', { count: t.digits(total) })}</Badge>
                }
              />

              {rows.length === 0 ? (
                <EmptyState
                  icon="bi-folder-x"
                  title={t.t(
                    search !== '' || courseFilter !== '' ? 'amat.none_filtered' : 'amat.none'
                  )}
                  body={t.t('amat.sub')}
                />
              ) : (
                <ul className="divide-y divide-line-soft">
                  {rows.map((row) => {
                    const href = uploadUrl(row.file_path);

                    return (
                      <li key={row.id} className="px-5 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-ink-heading">{row.title}</span>
                              <Badge tone="neutral">{(row.file_type ?? '').toUpperCase()}</Badge>
                              {href === '' && (
                                <Badge tone="danger">{t.t('amat.file_missing')}</Badge>
                              )}
                            </p>
                            {row.description && (
                              <p className="mt-1 line-clamp-2 text-sm text-ink">{row.description}</p>
                            )}
                            <p className="mt-1 text-xs text-ink-muted">
                              {[
                                row.course || t.t('amat.all_courses'),
                                row.batch || t.t('amat.all_batches'),
                                multiBranch
                                  ? row.branch_id
                                    ? (branchName.get(row.branch_id) ?? '')
                                    : t.t('branch.all_branches')
                                  : '',
                                `${t.t('amat.uploaded')}: ${t.date(row.created_at, 'd M Y')}`,
                              ]
                                .filter((part) => part !== '')
                                .join(' · ')}
                            </p>
                          </div>

                          <MaterialRowActions
                            materialId={row.id}
                            editHref={`${listHref}${listHref.includes('?') ? '&' : '?'}edit=${row.id}`}
                            fileHref={href}
                            labels={{
                              open: t.t('common.download'),
                              edit: t.t('common.edit'),
                              remove: t.t('common.delete'),
                              confirmDelete: t.t('amat.delete_confirm', { title: row.title }),
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
                        href={pageHref('/admin/materials', query, pager.page - 1)}
                        className="rounded-orbit border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-2"
                      >
                        {t.t('common.previous')}
                      </Link>
                    )}
                    {pager.page < pager.totalPages && (
                      <Link
                        href={pageHref('/admin/materials', query, pager.page + 1)}
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
