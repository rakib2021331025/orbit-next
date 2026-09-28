import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { getLang, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { activeBranchId, branchesEnabled } from '@/lib/branch/active';
import { branchList } from '@/lib/branch/stats';
import { mainBranchId } from '@/lib/branch/assign';
import { batchesByCourse } from '@/lib/courses/batches';
import { BatchForm, BatchRowActions, CourseQuickForm } from './BatchForms';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'abat.title'),
    robots: { index: false, follow: false },
  };
}

/** "3000.00" → "3000", so a number input does not show trailing zeros. */
function decimalInput(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const text = String(Number(value));
  return text;
}

/**
 * Batches, grouped by course — from admin/batches_management.php.
 *
 * Grouped rather than a flat list because that is how the work arrives: a term
 * starts and each course needs its batches checked. The per-course header carries
 * the quick fee/duration edit so setting up does not need two screens.
 *
 * Only the branch in focus is listed. A batch-less course is called out: it shows
 * no Enroll button on the public site at all.
 */
export default async function AdminBatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; new?: string; course?: string }>;
}) {
  const params = await searchParams;

  return (
    <AdminPage active="batches" route="/admin/batches" title="">
      {async ({ admin, t }) => {
        const { courses, grouped, students } = await batchesByCourse();
        const multiBranch = await branchesEnabled();
        const branches = multiBranch ? await branchList() : [];

        const editId = /^\d+$/.test(params.edit ?? '') ? Number(params.edit) : 0;
        const editing =
          editId > 0
            ? await prisma.batch.findUnique({ where: { id: editId } }).catch(() => null)
            : null;

        const presetCourse = /^\d+$/.test(params.course ?? '') ? Number(params.course) : 0;
        const showForm = editing !== null || params.new !== undefined;

        // A new batch defaults to the branch in focus, else the main branch, and
        // to its course's own mode.
        const defaultBranch = (await activeBranchId()) || (await mainBranchId());
        const presetType =
          courses.find((course) => course.id === presetCourse)?.course_type === 'online'
            ? 'online'
            : 'offline';

        const formValues = {
          id: editing?.id ?? 0,
          course_id: editing?.course_id ?? presetCourse,
          batch_type: editing?.batch_type ?? presetType,
          name: editing?.name ?? '',
          name_bn: editing?.name_bn ?? '',
          schedule_info: editing?.schedule_info ?? '',
          schedule_info_bn: editing?.schedule_info_bn ?? '',
          start_date: editing?.start_date ? editing.start_date.toISOString().slice(0, 10) : '',
          capacity: editing?.capacity !== null && editing?.capacity !== undefined ? String(editing.capacity) : '',
          fee: decimalInput(editing?.fee),
          status: editing?.status ?? 'active',
          sort_order: String(editing?.sort_order ?? 0),
          branch_id: editing?.branch_id ?? defaultBranch,
        };

        const batchLabels = {
          edit: t.t('common.edit'),
          activate: t.t('abat.activate'),
          deactivate: t.t('abat.deactivate'),
          remove: t.t('common.delete'),
          // The confirmation names the batch, so it is built per row below.
          dismiss: t.t('common.cancel'),
        };

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-ink-heading">{t.t('abat.title')}</h1>
                <p className="mt-1 text-sm text-ink-muted">{t.t('abat.sub')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/admin/courses"
                  className="rounded-orbit border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
                >
                  {t.t('abat.go_courses')}
                </Link>
                {!showForm && courses.length > 0 && (
                  <Link
                    href="/admin/batches?new=1"
                    className="inline-flex items-center gap-2 rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                  >
                    <i className="bi bi-plus-lg" aria-hidden />
                    {t.t('abat.new')}
                  </Link>
                )}
              </div>
            </div>

            {showForm && (
              <Card>
                <CardHeader
                  title={t.t(editing ? 'abat.edit' : 'abat.new')}
                  icon="bi-collection"
                />
                <CardBody>
                  <BatchForm
                    values={formValues}
                    courses={courses.map((course) => ({
                      id: course.id,
                      name: t.pick(course, 'name'),
                      type: course.course_type,
                    }))}
                    branches={branches.map((branch) => ({
                      id: branch.id,
                      name: t.pickPair(branch, 'name'),
                    }))}
                    labels={{
                      course: t.t('abat.f_course'),
                      chooseCourse: t.t('abat.f_choose_course'),
                      type: t.t('abat.f_type'),
                      typeOnline: t.t('abat.type_online'),
                      typeOffline: t.t('abat.type_offline'),
                      type_online: t.t('course.type_online'),
                      type_offline: t.t('course.type_offline'),
                      typeMismatch: t.t('abat.type_mismatch', { type: '{type}' }),
                      name: t.t('abat.f_name'),
                      namePlaceholder: t.t('abat.f_name_ph'),
                      nameBn: t.t('abat.f_name_bn'),
                      schedule: t.t('abat.f_schedule'),
                      schedulePlaceholder: t.t('abat.f_schedule_ph'),
                      scheduleBn: t.t('abat.f_schedule_bn'),
                      start: t.t('abat.f_start'),
                      capacity: t.t('abat.f_capacity'),
                      capacityHelp: t.t('abat.f_capacity_help'),
                      fee: t.t('abat.f_fee'),
                      feeHelp: t.t('abat.f_fee_help'),
                      feePlaceholder: t.t('abat.f_fee_ph'),
                      sort: t.t('abat.f_sort'),
                      sortHelp: t.t('abat.f_sort_help'),
                      status: t.t('abat.f_status'),
                      statusActive: t.t('abat.f_status_active'),
                      statusInactive: t.t('abat.f_status_inactive'),
                      branch: t.t('branch.label'),
                      branchHelp: t.t('abat.branch_help'),
                      save: t.t('abat.save'),
                      back: t.t('abat.back'),
                      cancel: t.t('common.cancel'),
                    }}
                  />
                </CardBody>
              </Card>
            )}

            {courses.length === 0 ? (
              <Card>
                <EmptyState
                  icon="bi-journal-plus"
                  title={t.t('abat.no_courses_title')}
                  body={t.t('abat.no_courses')}
                  action={
                    <Link
                      href="/admin/courses?new=1"
                      className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                    >
                      {t.t('admin.courses.new')}
                    </Link>
                  }
                />
              </Card>
            ) : (
              courses.map((course) => {
                const batches = grouped.get(course.id) ?? [];
                const hasActive = batches.some((batch) => batch.status === 'active');

                return (
                  <Card key={course.id} id={`course-${course.id}`}>
                    <CardHeader
                      title={t.pick(course, 'name')}
                      subtitle={[
                        t.t(`course.type_${course.course_type}`),
                        course.fee !== null ? t.money(Number(course.fee)) : '',
                        course.duration ?? '',
                      ]
                        .filter((part) => part !== '')
                        .join(' · ')}
                      icon="bi-collection"
                      actions={
                        <span className="flex flex-wrap items-center gap-2">
                          {!hasActive && <Badge tone="warning">{t.t('abat.no_active')}</Badge>}
                          <Link
                            href={`/admin/batches?new=1&course=${course.id}`}
                            className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                          >
                            {t.t('abat.add')}
                          </Link>
                          {/* A course is institute-wide, so only an all-branch
                              admin gets the quick edit. */}
                          {admin.role === 'super_admin' && (
                            <CourseQuickForm
                              courseId={course.id}
                              fee={decimalInput(course.fee)}
                              duration={course.duration ?? ''}
                              status={course.status}
                              labels={{
                                courseDetails: t.t('abat.course_details'),
                                fee: t.t('abat.c_fee'),
                                feeHelp: t.t('abat.c_fee_help'),
                                duration: t.t('abat.c_duration'),
                                durationPlaceholder: t.t('abat.c_duration_ph'),
                                status: t.t('abat.c_status'),
                                statusActive: t.t('status.active'),
                                statusInactive: t.t('status.inactive'),
                                more: t.t('abat.c_more'),
                                save: t.t('common.save'),
                                cancel: t.t('common.cancel'),
                              }}
                            />
                          )}
                        </span>
                      }
                    />

                    {batches.length === 0 ? (
                      <CardBody className="text-sm text-ink-muted">{t.t('abat.none')}</CardBody>
                    ) : (
                      <TableWrap>
                        <Table>
                          <Thead>
                            <Tr>
                              <Th>{t.t('abat.col_batch')}</Th>
                              <Th>{t.t('abat.f_schedule')}</Th>
                              <Th alignment="end">{t.t('abat.f_fee')}</Th>
                              <Th alignment="center">{t.t('abat.col_students')}</Th>
                              <Th alignment="center">{t.t('common.status')}</Th>
                              <Th alignment="end">{t.t('common.actions')}</Th>
                            </Tr>
                          </Thead>
                          <Tbody>
                            {batches.map((batch) => {
                              const mismatched =
                                course.course_type !== 'hybrid' &&
                                batch.batch_type !== course.course_type;
                              const count = students.get(batch.id) ?? 0;
                              const branch = branches.find((row) => row.id === batch.branch_id);

                              return (
                                <Tr key={batch.id}>
                                  <Td>
                                    <span className="font-medium text-ink">
                                      {t.pick(batch, 'name')}
                                    </span>
                                    <span className="block text-xs text-ink-muted">
                                      {t.t(
                                        batch.batch_type === 'online'
                                          ? 'abat.type_online'
                                          : 'abat.type_offline'
                                      )}
                                      {branch ? ` · ${t.pickPair(branch, 'name')}` : ''}
                                      {batch.start_date
                                        ? ` · ${t.date(batch.start_date, 'd M Y')}`
                                        : ''}
                                    </span>
                                    {mismatched && (
                                      <span className="mt-1 block text-xs text-amber-600">
                                        {t.t('abat.type_mismatch', {
                                          type: t.t(`course.type_${course.course_type}`),
                                        })}
                                      </span>
                                    )}
                                  </Td>

                                  <Td className="text-xs">{t.pick(batch, 'schedule_info') || '—'}</Td>

                                  <Td alignment="end" numeric>
                                    {batch.fee !== null ? (
                                      t.money(Number(batch.fee))
                                    ) : (
                                      <span className="text-xs text-ink-muted">
                                        {t.t('abat.fee_from_course')}
                                      </span>
                                    )}
                                  </Td>

                                  <Td alignment="center" numeric>
                                    {t.digits(count)}
                                    {batch.capacity !== null && (
                                      <span className="block text-xs text-ink-muted">
                                        / {t.digits(batch.capacity)}
                                      </span>
                                    )}
                                  </Td>

                                  <Td alignment="center">
                                    <Badge tone={batch.status === 'active' ? 'success' : 'neutral'}>
                                      {t.t(
                                        batch.status === 'active'
                                          ? 'status.active'
                                          : 'status.inactive'
                                      )}
                                    </Badge>
                                  </Td>

                                  <Td alignment="end">
                                    <BatchRowActions
                                      batchId={batch.id}
                                      status={batch.status}
                                      labels={{
                                        ...batchLabels,
                                        confirmDelete: t.t('abat.delete_confirm', {
                                          name: t.pick(batch, 'name'),
                                        }),
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
                  </Card>
                );
              })
            )}
          </div>
        );
      }}
    </AdminPage>
  );
}
