import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback';
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { getLang, translate, type Translator } from '@/lib/i18n';
import { pageHref } from '@/lib/paginate';
import { studentPhotoUrl } from '@/lib/storage/url';
import { activeBranchId, branchesEnabled } from '@/lib/branch/active';
import { branchList } from '@/lib/branch/stats';
import {
  studentList,
  studentTotals,
  assignableBatches,
  batchesOf,
  type AssignableBatch,
} from '@/lib/students/list';
import { StudentRowActions } from './StudentRowActions';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'astd.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * "Course — Batch (Online)" in the reader's language, as astd_batch_label() builds it.
 *
 * With every branch in view the branch name is appended, because the same batch
 * name genuinely repeats across branches and the bare label would be ambiguous.
 */
function batchLabel(
  batch: AssignableBatch,
  t: Translator,
  branchNames: Map<number, string>,
  showBranch: boolean
): string {
  const course = batch.course ? t.pick(batch.course, 'name') : '';
  const type = t.t(batch.batch_type === 'online' ? 'course.type_online' : 'course.type_offline');
  let label = `${course !== '' ? course : t.t('astd.no_course')} — ${t.pick(batch, 'name')} (${type})`;

  if (batch.status === 'inactive') label += ` · ${t.t('status.inactive')}`;
  if (showBranch && batch.branch_id) {
    label += ` · ${branchNames.get(batch.branch_id) ?? ''}`;
  }
  return label;
}

/**
 * The student list, from admin/students.php.
 *
 * Search, batch and status are part of the page's address — the dashboard
 * forwards old searches here as `?q=` — so every action returns to the same
 * filtered page rather than resetting it.
 *
 * Nothing here deletes a student.
 */
export default async function AdminStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; batch?: string; status?: string; page?: string }>;
}) {
  const params = await searchParams;

  return (
    <AdminPage active="students" route="/admin/students" title="">
      {async ({ t }) => {
        const search = (params.q ?? '').trim().slice(0, 100);
        const batchId = /^\d+$/.test(params.batch ?? '') ? Number(params.batch) : 0;
        const status =
          params.status === 'Active' || params.status === 'Inactive' ? params.status : '';
        const filtered = search !== '' || batchId > 0 || status !== '';

        const [totals, list, batches, branchId, multiBranch] = await Promise.all([
          studentTotals(),
          studentList({ search, batchId, status, page: Number(params.page ?? 1) }),
          assignableBatches(),
          activeBranchId(),
          branchesEnabled(),
        ]);

        const rowBatches = await batchesOf(list.rows);
        const branches = multiBranch ? await branchList() : [];
        const branchNames = new Map(
          branches.map((branch) => [branch.id, t.pickPair(branch, 'name')])
        );

        // The filter list shows the branch in focus; the edit form offers every
        // batch the admin may assign, so a student can be moved deliberately.
        const filterBatches =
          branchId > 0 ? batches.filter((batch) => batch.branch_id === branchId) : batches;

        const query = {
          q: search || undefined,
          batch: batchId > 0 ? String(batchId) : undefined,
          status: status || undefined,
        };

        const stats = [
          { href: '/admin/students', icon: 'bi-people', tone: 'bg-emerald-500/10 text-emerald-600', value: totals.total, label: t.t('astd.stat_total') },
          { href: '/admin/students?status=Active', icon: 'bi-person-check', tone: 'bg-primary/10 text-primary', value: totals.active, label: t.t('astd.stat_active') },
          { href: '/admin/students?status=Inactive', icon: 'bi-person-dash', tone: 'bg-red-500/10 text-red-600', value: totals.inactive, label: t.t('astd.stat_inactive') },
          { href: '/admin/students', icon: 'bi-upc', tone: 'bg-amber-500/10 text-amber-600', value: totals.noId, label: t.t('astd.stat_no_id') },
        ];

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-ink-heading">{t.t('astd.title')}</h1>
                <p className="mt-1 text-sm text-ink-muted">{t.t('astd.sub')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/admin/applications"
                  className="rounded-orbit border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
                >
                  {t.t('astd.enrollments')}
                </Link>
                {batchId > 0 && list.pager.total > 0 && (
                  <Link
                    href={`/api/id-card?batch=${batchId}`}
                    target="_blank"
                    className="rounded-orbit bg-primary px-3 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                  >
                    {t.t('astd.print_cards')}
                  </Link>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {stats.map((stat) => (
                <Link
                  key={stat.label}
                  href={stat.href}
                  className="flex items-center gap-3 rounded-orbit border border-line bg-surface p-4 transition hover:border-primary"
                >
                  <span className={`inline-flex h-10 w-10 items-center justify-center rounded-orbit ${stat.tone}`}>
                    <i className={`bi ${stat.icon}`} aria-hidden />
                  </span>
                  <span>
                    <span className="block text-xl font-bold text-ink-heading">
                      {t.digits(stat.value)}
                    </span>
                    <span className="block text-sm text-ink-muted">{stat.label}</span>
                  </span>
                </Link>
              ))}
            </div>

            <Card>
              <form method="get" className="flex flex-wrap items-end gap-3 px-5 py-4">
                <label className="flex flex-1 flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('common.search')}</span>
                  <input
                    type="search"
                    name="q"
                    maxLength={100}
                    defaultValue={search}
                    placeholder={t.t('astd.search_ph')}
                    className="w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('common.batch')}</span>
                  <select
                    name="batch"
                    defaultValue={String(batchId)}
                    className="max-w-xs rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="0">{t.t('astd.all_batches')}</option>
                    {filterBatches.map((batch) => (
                      <option key={batch.id} value={batch.id}>
                        {batchLabel(batch, t, branchNames, multiBranch && branchId === 0)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('common.status')}</span>
                  <select
                    name="status"
                    defaultValue={status}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="">{t.t('common.all')}</option>
                    <option value="Active">{t.t('status.active')}</option>
                    <option value="Inactive">{t.t('status.inactive')}</option>
                  </select>
                </label>

                <button
                  type="submit"
                  className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                >
                  {t.t('common.filter')}
                </button>
                {filtered && (
                  <Link
                    href="/admin/students"
                    className="rounded-orbit border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
                  >
                    {t.t('common.clear')}
                  </Link>
                )}
              </form>
            </Card>

            {list.missingIds > 0 && (
              <Alert tone="warning" icon="bi-upc">
                {t.t('astd.missing_ids', { count: t.digits(list.missingIds) })}
              </Alert>
            )}

            <Card>
              <CardHeader
                title={t.t('astd.title')}
                icon="bi-people"
                subtitle={
                  list.pager.total > 0
                    ? t.t('astd.showing', {
                        from: t.digits(list.pager.from),
                        to: t.digits(list.pager.to),
                        total: t.digits(list.pager.total),
                      })
                    : undefined
                }
              />

              {list.rows.length === 0 ? (
                <EmptyState
                  icon="bi-person-x"
                  title={t.t(filtered ? 'astd.empty_filtered' : 'astd.empty')}
                  body={t.t('astd.sub')}
                />
              ) : (
                <TableWrap>
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>{t.t('common.student')}</Th>
                        <Th>{t.t('astd.col_course_batch')}</Th>
                        <Th alignment="center">{t.t('common.status')}</Th>
                        <Th alignment="end">{t.t('common.actions')}</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {list.rows.map((row) => {
                        const batch = row.batch_id ? rowBatches.get(row.batch_id) : undefined;
                        const hasId = (row.student_id_no ?? '').trim() !== '';

                        return (
                          <Tr key={row.id}>
                            <Td>
                              <span className="flex items-center gap-3">
                                {/* Photos are private; the media route serves
                                    them by record id, never by file path. */}
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={studentPhotoUrl(row)}
                                  alt=""
                                  className="h-9 w-9 shrink-0 rounded-full border border-line-soft object-cover"
                                />
                                <span className="min-w-0">
                                  <span className="block truncate font-medium text-ink">
                                    {t.pick(row, 'name')}
                                  </span>
                                  <span className="block text-xs text-ink-muted">
                                    {hasId ? row.student_id_no : t.t('astd.id_not_issued')}
                                    {row.roll_number
                                      ? ` · ${t.t('astd.roll', { roll: row.roll_number })}`
                                      : ''}
                                  </span>
                                  {row.phone && (
                                    <span className="block text-xs text-ink-muted">{row.phone}</span>
                                  )}
                                </span>
                              </span>
                            </Td>

                            <Td className="text-xs">
                              {batch ? (
                                batchLabel(batch, t, branchNames, multiBranch && branchId === 0)
                              ) : row.batch || row.course ? (
                                // No batch row: the free-text columns still say
                                // what the student was enrolled in.
                                <>
                                  {row.course}
                                  {row.batch && <span className="block text-ink-muted">{row.batch}</span>}
                                </>
                              ) : (
                                <span className="text-ink-muted">{t.t('astd.not_assigned')}</span>
                              )}
                              <span className="mt-1 block text-ink-muted">
                                {row._count.examResult_student > 0
                                  ? t.t('astd.marksheet')
                                  : t.t('astd.no_results')}
                              </span>
                            </Td>

                            <Td alignment="center">
                              <Badge tone={row.student_status === 'Active' ? 'success' : 'neutral'}>
                                {t.t(
                                  row.student_status === 'Active' ? 'status.active' : 'status.inactive'
                                )}
                              </Badge>
                              {row.status !== 'approved' && (
                                <span className="mt-1 block">
                                  <Badge tone="warning">{t.t('astd.not_approved')}</Badge>
                                </span>
                              )}
                            </Td>

                            <Td alignment="end">
                              <StudentRowActions
                                values={{
                                  id: row.id,
                                  name: row.name,
                                  name_bn: row.name_bn ?? '',
                                  roll_number: row.roll_number ?? '',
                                  batch_id: row.batch_id ?? 0,
                                  student_status: row.student_status,
                                  branch_id: row.branch_id,
                                }}
                                hasStudentId={hasId}
                                batches={batches.map((batch) => ({
                                  id: batch.id,
                                  label: batchLabel(batch, t, branchNames, multiBranch),
                                }))}
                                labels={{
                                  edit: t.t('astd.edit'),
                                  editFor: t.t('astd.edit_for', { name: '{name}' }),
                                  profile: t.t('astd.profile'),
                                  idCard: t.t('astd.id_card'),
                                  marksheet: t.t('astd.marksheet'),
                                  issueId: t.t('astd.issue_id'),
                                  issueIdTitle: t.t('astd.issue_id_title'),
                                  name: t.t('astd.f_name'),
                                  nameBn: t.t('astd.f_name_bn'),
                                  nameBnHelp: t.t('astd.f_name_bn_help'),
                                  nameBnPlaceholder: t.t('astd.f_name_bn_ph'),
                                  roll: t.t('astd.f_roll'),
                                  rollHelp: t.t('astd.f_roll_help'),
                                  batch: t.t('common.batch'),
                                  notAssigned: t.t('astd.not_assigned'),
                                  status: t.t('common.status'),
                                  statusActive: t.t('status.active'),
                                  statusInactive: t.t('status.inactive'),
                                  idFixed: t.t('astd.id_fixed', {
                                    id: row.student_id_no ?? t.t('astd.id_not_issued'),
                                  }),
                                  save: t.t('common.save'),
                                  cancel: t.t('common.cancel'),
                                }}
                              />
                            </Td>
                          </Tr>
                        );
                      })}
                    </Tbody>
                  </Table>
                </TableWrap>
              )}

              {list.pager.totalPages > 1 && (
                <CardBody className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft text-sm">
                  <span className="text-ink-muted">
                    {t.t('astd.showing', {
                      from: t.digits(list.pager.from),
                      to: t.digits(list.pager.to),
                      total: t.digits(list.pager.total),
                    })}
                  </span>
                  <span className="flex gap-2">
                    {list.pager.page > 1 && (
                      <Link
                        href={pageHref('/admin/students', query, list.pager.page - 1)}
                        className="rounded-orbit border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-2"
                      >
                        {t.t('common.previous')}
                      </Link>
                    )}
                    {list.pager.page < list.pager.totalPages && (
                      <Link
                        href={pageHref('/admin/students', query, list.pager.page + 1)}
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
