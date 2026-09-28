import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { getLang, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { uploadUrl } from '@/lib/storage/url';
import { activeBranchId, branchesEnabled } from '@/lib/branch/active';
import { branchList } from '@/lib/branch/stats';
import { mainBranchId } from '@/lib/branch/assign';
import { courseList } from '@/lib/courses/manage';
import { CourseForm } from './CourseForm';
import { CourseRowActions } from './CourseRowActions';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'admin.courses.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * Course management, from admin/courses.php.
 *
 * Batches live on their own screen; this page links to it, because a course and
 * its batches are edited at different times by different people — the course text
 * once, the batches every term.
 *
 * Two warnings on a row are worth the space: a course with no active batch cannot
 * be enrolled in at all, and an active batch whose type contradicts the course's
 * is silently not offered.
 */
export default async function AdminCoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; new?: string; q?: string; type?: string }>;
}) {
  const params = await searchParams;

  return (
    <AdminPage active="courses" route="/admin/courses" title="">
      {async ({ t }) => {
        const search = (params.q ?? '').trim();
        const type = params.type ?? '';

        const [courses, teachers, multiBranch] = await Promise.all([
          courseList(search, type),
          prisma.teacher
            .findMany({
              orderBy: { name: 'asc' },
              select: { id: true, name: true, designation: true, status: true },
            })
            .catch(() => []),
          branchesEnabled(),
        ]);

        const branches = multiBranch ? await branchList() : [];
        const editId = /^\d+$/.test(params.edit ?? '') ? Number(params.edit) : 0;
        const editing = courses.find((course) => course.id === editId) ?? null;
        const showForm = editing !== null || params.new !== undefined;

        // A new course is ticked for the branch in focus, or the main one: the
        // common case is adding a course at the branch you are looking at.
        const defaultBranch = (await activeBranchId()) || (await mainBranchId());
        const checkedBranches = editing ? editing.branchIds : [defaultBranch];

        const formValues = {
          id: editing?.id ?? 0,
          name: editing?.name ?? '',
          name_bn: editing?.name_bn ?? '',
          course_type: editing?.course_type ?? 'offline',
          short_description: editing?.short_description ?? '',
          short_description_bn: editing?.short_description_bn ?? '',
          description: editing?.description ?? '',
          description_bn: editing?.description_bn ?? '',
          fee: editing?.fee !== null && editing?.fee !== undefined ? String(Number(editing.fee)) : '',
          duration: editing?.duration ?? '',
          duration_bn: editing?.duration_bn ?? '',
          batch_info: editing?.batch_info ?? '',
          batch_info_bn: editing?.batch_info_bn ?? '',
          teacher_id: editing?.teacher_id ?? 0,
          instructor_name: editing?.instructor_name ?? '',
          status: editing?.status ?? 'active',
          enrollment_status: editing?.enrollment_status ?? 'open',
          is_featured: editing?.is_featured ?? false,
          sort_order: editing?.sort_order ?? 0,
          image: editing?.image ?? '',
        };

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-ink-heading">{t.t('admin.courses.title')}</h1>
                <p className="mt-1 text-sm text-ink-muted">{t.t('admin.courses.subtitle')}</p>
              </div>
              {!showForm && (
                <Link
                  href="/admin/courses?new=1"
                  className="inline-flex items-center gap-2 rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                >
                  <i className="bi bi-plus-lg" aria-hidden />
                  {t.t('admin.courses.new')}
                </Link>
              )}
            </div>

            {showForm && (
              <Card>
                <CardHeader
                  title={t.t(editing ? 'admin.courses.edit' : 'admin.courses.new')}
                  subtitle={
                    editing?.updated_at
                      ? t.t('admin.courses.updated_on', { date: t.date(editing.updated_at, 'd M Y') })
                      : undefined
                  }
                  icon="bi-journal-bookmark"
                />
                <CardBody>
                  <CourseForm
                    values={formValues}
                    imageUrl={uploadUrl(formValues.image)}
                    teachers={teachers.map((teacher) => ({
                      id: teacher.id,
                      name: teacher.name,
                      designation: teacher.designation,
                      active: teacher.status === 'active',
                    }))}
                    branches={branches.map((branch) => ({
                      id: branch.id,
                      name: t.pickPair(branch, 'name'),
                    }))}
                    checkedBranches={checkedBranches}
                    labels={{
                      secBasic: t.t('admin.courses.sec_basic'),
                      secContent: t.t('admin.courses.sec_content'),
                      secDetails: t.t('admin.courses.sec_details'),
                      secVisibility: t.t('admin.courses.sec_visibility'),
                      name: t.t('admin.courses.f_name'),
                      nameBn: t.t('admin.courses.f_name_bn'),
                      type: t.t('admin.courses.f_type'),
                      typeHelp: t.t('admin.courses.f_type_help'),
                      typeOnline: t.t('course.type_online'),
                      typeOffline: t.t('course.type_offline'),
                      typeHybrid: t.t('course.type_hybrid'),
                      image: t.t('admin.courses.f_image'),
                      imageHelp: t.t('admin.courses.f_image_help'),
                      removeImage: t.t('admin.courses.f_remove_image'),
                      short: t.t('admin.courses.f_short'),
                      shortBn: t.t('admin.courses.f_short_bn'),
                      shortHelp: t.t('admin.courses.f_short_help'),
                      desc: t.t('admin.courses.f_desc'),
                      descBn: t.t('admin.courses.f_desc_bn'),
                      fee: t.t('admin.courses.f_fee'),
                      feeHelp: t.t('admin.courses.f_fee_help'),
                      duration: t.t('admin.courses.f_duration'),
                      durationBn: t.t('admin.courses.f_duration_bn'),
                      durationPlaceholder: t.t('admin.courses.f_duration_ph'),
                      batchInfo: t.t('admin.courses.f_batch_info'),
                      batchInfoBn: t.t('admin.courses.f_batch_info_bn'),
                      batchInfoPlaceholder: t.t('admin.courses.f_batch_info_ph'),
                      teacher: t.t('admin.courses.f_teacher'),
                      teacherNone: t.t('admin.courses.f_teacher_none'),
                      instructor: t.t('admin.courses.f_instructor'),
                      status: t.t('admin.courses.f_status'),
                      statusActiveLong: t.t('admin.courses.f_status_active'),
                      statusInactiveLong: t.t('admin.courses.f_status_inactive'),
                      statusInactive: t.t('status.inactive'),
                      enrollment: t.t('admin.courses.f_enrollment'),
                      enrollOpen: t.t('admin.courses.f_enroll_open'),
                      enrollClosed: t.t('admin.courses.f_enroll_closed'),
                      sort: t.t('admin.courses.f_sort'),
                      sortHelp: t.t('admin.courses.f_sort_help'),
                      featured: t.t('admin.courses.f_featured'),
                      branches: t.t('branch.label'),
                      save: t.t('common.save'),
                      back: t.t('admin.courses.back'),
                      cancel: t.t('common.cancel'),
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
                    placeholder={t.t('admin.courses.search_ph')}
                    className="w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('admin.courses.f_type')}</span>
                  <select
                    name="type"
                    defaultValue={type}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="">{t.t('common.all')}</option>
                    <option value="online">{t.t('course.type_online')}</option>
                    <option value="offline">{t.t('course.type_offline')}</option>
                    <option value="hybrid">{t.t('course.type_hybrid')}</option>
                  </select>
                </label>

                <button
                  type="submit"
                  className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                >
                  {t.t('common.filter')}
                </button>
                <Link
                  href="/admin/courses"
                  className="rounded-orbit border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
                >
                  {t.t('common.clear')}
                </Link>
              </form>
            </Card>

            <Card>
              <CardHeader title={t.t('admin.courses.title')} icon="bi-journal-bookmark" />

              {courses.length === 0 ? (
                <EmptyState
                  icon="bi-journal-plus"
                  title={t.t('admin.courses.empty')}
                  body={t.t('admin.courses.subtitle')}
                />
              ) : (
                <TableWrap>
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>{t.t('admin.courses.col_course')}</Th>
                        <Th alignment="end">{t.t('admin.courses.f_fee')}</Th>
                        <Th alignment="center">{t.t('admin.courses.col_batches')}</Th>
                        <Th alignment="center">{t.t('admin.courses.col_enrolled')}</Th>
                        <Th alignment="center">{t.t('common.status')}</Th>
                        <Th alignment="end">{t.t('common.actions')}</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {courses.map((course) => (
                        <Tr key={course.id}>
                          <Td>
                            <span className="font-medium text-ink">{t.pick(course, 'name')}</span>
                            <span className="block text-xs text-ink-muted">
                              {t.t(`course.type_${course.course_type}`)}
                              {course.teacher ? ` · ${t.pick(course.teacher, 'name')}` : ''}
                              {course.instructor_name && !course.teacher
                                ? ` · ${course.instructor_name}`
                                : ''}
                            </span>
                            {course.activeBatches === 0 && (
                              <span className="mt-1 block text-xs text-amber-600">
                                {t.t('admin.courses.no_batch_warning')}
                              </span>
                            )}
                            {course.mismatched > 0 && (
                              <span className="mt-1 block text-xs text-red-600">
                                {t.t('admin.courses.type_mismatch', {
                                  n: t.digits(course.mismatched),
                                })}
                              </span>
                            )}
                          </Td>

                          <Td alignment="end" numeric>
                            {course.fee !== null ? t.money(Number(course.fee)) : '—'}
                          </Td>
                          <Td alignment="center" numeric>
                            {t.digits(course.activeBatches)}
                          </Td>
                          <Td alignment="center" numeric>
                            {t.digits(course.enrolled)}
                          </Td>

                          <Td alignment="center">
                            <Badge tone={course.status === 'active' ? 'success' : 'neutral'}>
                              {t.t(course.status === 'active' ? 'status.active' : 'status.inactive')}
                            </Badge>
                            <span className="mt-1 block">
                              <Badge
                                tone={course.enrollment_status === 'open' ? 'info' : 'warning'}
                              >
                                {t.t(`status.${course.enrollment_status}`)}
                              </Badge>
                            </span>
                            {course.is_featured && (
                              <span className="mt-1 block">
                                <Badge tone="info">{t.t('admin.courses.feature')}</Badge>
                              </span>
                            )}
                          </Td>

                          <Td alignment="end">
                            <CourseRowActions
                              courseId={course.id}
                              status={course.status}
                              enrollmentStatus={course.enrollment_status}
                              featured={course.is_featured}
                              labels={{
                                edit: t.t('common.edit'),
                                batches: t.t('admin.courses.manage_batches'),
                                activate: t.t('admin.courses.activate'),
                                deactivate: t.t('admin.courses.deactivate'),
                                openEnrollment: t.t('admin.courses.open_enrollment'),
                                closeEnrollment: t.t('admin.courses.close_enrollment'),
                                feature: t.t('admin.courses.feature'),
                                unfeature: t.t('admin.courses.unfeature'),
                                remove: t.t('common.delete'),
                                confirmDelete: t.t('admin.courses.confirm_delete'),
                                dismiss: t.t('common.cancel'),
                              }}
                            />
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </TableWrap>
              )}
            </Card>
          </div>
        );
      }}
    </AdminPage>
  );
}
