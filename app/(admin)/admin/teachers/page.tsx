import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { getLang, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { uploadUrl } from '@/lib/storage/url';
import { formatPhone } from '@/lib/site/url';
import { branchesEnabled } from '@/lib/branch/active';
import { branchList } from '@/lib/branch/stats';
import { paginate, pageHref } from '@/lib/paginate';
import { TeacherForm, TeacherRowActions } from './TeacherForms';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'atch.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * Teacher accounts, from admin/teachers_management.php.
 *
 * Each row carries what an admin actually asks about a teacher: what they teach,
 * how much of it is scheduled, and whether they can still sign in.
 *
 * Teachers are institute-wide (the page is not on the branch allow-list) — a
 * teacher may work at several branches, which is what `branch_teachers` records.
 */
export default async function AdminTeachersPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; new?: string; q?: string; status?: string; page?: string }>;
}) {
  const params = await searchParams;

  return (
    <AdminPage active="teachers" route="/admin/teachers" title="">
      {async ({ t }) => {
        const search = (params.q ?? '').trim().slice(0, 100);
        const statusFilter: 'active' | 'inactive' | '' =
          params.status === 'active' || params.status === 'inactive' ? params.status : '';

        const where = {
          ...(statusFilter !== '' ? { status: statusFilter } : {}),
          ...(search !== ''
            ? {
                OR: [
                  { name: { contains: search, mode: 'insensitive' as const } },
                  { name_bn: { contains: search, mode: 'insensitive' as const } },
                  { email: { contains: search, mode: 'insensitive' as const } },
                  { phone: { contains: search } },
                ],
              }
            : {}),
        };

        const [total, active, matching] = await Promise.all([
          prisma.teacher.count().catch(() => 0),
          prisma.teacher.count({ where: { status: 'active' } }).catch(() => 0),
          prisma.teacher.count({ where }).catch(() => 0),
        ]);

        const pager = paginate(matching, 20, Number(params.page ?? 1));

        const [rows, multiBranch] = await Promise.all([
          prisma.teacher
            .findMany({
              where,
              orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
              take: pager.perPage,
              skip: pager.offset,
              include: {
                _count: { select: { liveClass_teacher: true, exam_teacher: true } },
                teacherSubject_teacher: { select: { subject: true } },
                teacherBatch_teacher: { select: { batch: true } },
              },
            })
            .catch(() => []),
          branchesEnabled(),
        ]);

        const branches = multiBranch ? await branchList() : [];

        const editId = /^\d+$/.test(params.edit ?? '') ? Number(params.edit) : 0;
        const editing =
          editId > 0
            ? await prisma.teacher
                .findUnique({
                  where: { id: editId },
                  include: {
                    teacherSubject_teacher: { select: { subject: true } },
                    teacherBatch_teacher: { select: { batch: true } },
                    branchTeacher_teacher: { select: { branch_id: true } },
                  },
                })
                .catch(() => null)
            : null;
        const showForm = editing !== null || params.new !== undefined;

        const query = { q: search || undefined, status: statusFilter || undefined };
        const listHref = `/admin/teachers${
          search !== '' || statusFilter !== ''
            ? `?${new URLSearchParams(
                Object.entries(query).filter(([, value]) => value !== undefined) as [string, string][]
              )}`
            : ''
        }`;

        const formLabels = {
          secProfile: t.t('atch.sec_profile'),
          secAssign: t.t('atch.sec_assign'),
          secAccess: t.t('atch.sec_access'),
          secWebsite: t.t('atch.sec_website'),
          secWebsiteHelp: t.t('atch.sec_website_help'),
          name: t.t('atch.f_name'),
          email: t.t('atch.f_email'),
          emailHelp: t.t('atch.f_email_help'),
          phone: t.t('atch.f_phone'),
          phoneHelp: t.t('atch.f_phone_help'),
          designation: t.t('atch.f_designation'),
          designationPlaceholder: t.t('atch.f_designation_ph'),
          qualification: t.t('atch.f_qualification'),
          qualificationPlaceholder: t.t('atch.f_qualification_ph'),
          status: t.t('atch.f_status'),
          statusActiveLong: t.t('atch.f_status_active'),
          statusInactiveLong: t.t('atch.f_status_inactive'),
          bio: t.t('atch.f_bio'),
          subjects: t.t('atch.f_subjects'),
          subjectsPlaceholder: t.t('atch.f_subjects_ph'),
          batches: t.t('atch.f_batches'),
          batchesPlaceholder: t.t('atch.f_batches_ph'),
          listHelp: t.t('atch.f_list_help'),
          branches: t.t('atch.branches'),
          branchesHelp: t.t('atch.branches_help'),
          photo: t.t('atch.f_photo'),
          photoHelp: t.t('atch.f_photo_help'),
          photoKeep: t.t('atch.f_photo_keep'),
          password: t.t('atch.f_password'),
          passwordHelp: t.t('atch.f_password_help'),
          nameBn: t.t('atch.f_name_bn'),
          designationBn: t.t('atch.f_designation_bn'),
          qualificationBn: t.t('atch.f_qualification_bn'),
          experience: t.t('atch.f_experience'),
          experiencePlaceholder: t.t('atch.f_experience_ph'),
          experienceBn: t.t('atch.f_experience_bn'),
          experienceBnPlaceholder: t.t('atch.f_experience_bn_ph'),
          bioBn: t.t('atch.f_bio_bn'),
          sort: t.t('atch.f_sort'),
          sortHelp: t.t('atch.f_sort_help'),
          showWeb: t.t('atch.f_show_web'),
          tempTitle: t.t('atch.temp_title', { name: '{name}' }),
          tempNote: t.t('atch.temp_note'),
          create: t.t('atch.create'),
          save: t.t('common.save'),
          back: t.t('atch.back'),
        };

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-ink-heading">{t.t('atch.title')}</h1>
                <p className="mt-1 text-sm text-ink-muted">{t.t('atch.sub')}</p>
              </div>
              {!showForm && (
                <Link
                  href="/admin/teachers?new=1"
                  className="inline-flex items-center gap-2 rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                >
                  <i className="bi bi-person-plus" aria-hidden />
                  {t.t('atch.add')}
                </Link>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { label: t.t('atch.stat_total'), value: total },
                { label: t.t('atch.stat_active'), value: active },
                { label: t.t('atch.stat_inactive'), value: total - active },
              ].map((stat) => (
                <div key={stat.label} className="rounded-orbit border border-line bg-surface p-4">
                  <span className="block text-xl font-bold text-ink-heading">
                    {t.digits(stat.value)}
                  </span>
                  <span className="block text-sm text-ink-muted">{stat.label}</span>
                </div>
              ))}
            </div>

            {showForm && (
              <Card>
                <CardHeader
                  title={t.t(editing ? 'atch.edit' : 'atch.new')}
                  icon="bi-person-badge"
                />
                <CardBody>
                  <TeacherForm
                    values={{
                      id: editing?.id ?? 0,
                      name: editing?.name ?? '',
                      email: editing?.email ?? '',
                      phone: editing?.phone ?? '',
                      designation: editing?.designation ?? '',
                      qualification: editing?.qualification ?? '',
                      bio: editing?.bio ?? '',
                      status: editing?.status ?? 'active',
                      subjects: (editing?.teacherSubject_teacher ?? [])
                        .map((row) => row.subject)
                        .join(', '),
                      batches: (editing?.teacherBatch_teacher ?? [])
                        .map((row) => row.batch)
                        .join(', '),
                      name_bn: editing?.name_bn ?? '',
                      designation_bn: editing?.designation_bn ?? '',
                      qualification_bn: editing?.qualification_bn ?? '',
                      experience: editing?.experience ?? '',
                      experience_bn: editing?.experience_bn ?? '',
                      bio_bn: editing?.bio_bn ?? '',
                      sort_order: editing?.sort_order ?? 0,
                      show_on_website: editing?.show_on_website ?? true,
                      photo: editing?.photo ?? '',
                    }}
                    branches={branches.map((branch) => ({
                      id: branch.id,
                      name: t.pickPair(branch, 'name'),
                    }))}
                    checkedBranches={(editing?.branchTeacher_teacher ?? []).map(
                      (row) => row.branch_id
                    )}
                    photoUrl={uploadUrl(editing?.photo)}
                    cancelHref={listHref}
                    labels={formLabels}
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
                    placeholder={t.t('atch.search_ph')}
                    className="w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('common.status')}</span>
                  <select
                    name="status"
                    defaultValue={statusFilter}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="">{t.t('common.all')}</option>
                    <option value="active">{t.t('atch.status_active')}</option>
                    <option value="inactive">{t.t('atch.status_inactive')}</option>
                  </select>
                </label>

                <button
                  type="submit"
                  className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                >
                  {t.t('common.filter')}
                </button>
                <Link
                  href="/admin/teachers"
                  className="rounded-orbit border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
                >
                  {t.t('common.clear')}
                </Link>
              </form>
            </Card>

            <Card>
              <CardHeader title={t.t('atch.title')} icon="bi-person-badge" />

              {rows.length === 0 ? (
                <EmptyState
                  icon="bi-person-x"
                  title={t.t(
                    search !== '' || statusFilter !== '' ? 'atch.empty_filtered' : 'atch.empty'
                  )}
                  body={t.t('atch.sub')}
                />
              ) : (
                <ul className="divide-y divide-line-soft">
                  {rows.map((row) => {
                    const subjects = row.teacherSubject_teacher.map((item) => item.subject);
                    const batches = row.teacherBatch_teacher.map((item) => item.batch);

                    return (
                      <li key={row.id} className="px-5 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <span className="flex min-w-0 flex-1 items-start gap-3">
                            {uploadUrl(row.photo) !== '' && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={uploadUrl(row.photo)}
                                alt={t.t('atch.photo_alt', { name: row.name })}
                                className="h-10 w-10 shrink-0 rounded-full border border-line-soft object-cover"
                              />
                            )}
                            <span className="min-w-0">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-ink-heading">
                                  {t.pick(row, 'name')}
                                </span>
                                <Badge tone={row.status === 'active' ? 'success' : 'neutral'}>
                                  {t.t(
                                    row.status === 'active'
                                      ? 'atch.status_active'
                                      : 'atch.status_inactive'
                                  )}
                                </Badge>
                                <Badge tone={row.show_on_website ? 'info' : 'neutral'}>
                                  {t.t(row.show_on_website ? 'atch.web_on' : 'atch.web_off')}
                                </Badge>
                              </span>

                              <span className="block text-xs text-ink-muted">
                                {[row.email, row.phone ? formatPhone(row.phone) : '', row.designation ?? '']
                                  .filter((part) => part !== '')
                                  .join(' · ')}
                              </span>

                              <span className="block text-xs text-ink-muted">
                                {[
                                  subjects.length > 0
                                    ? `${t.t('atch.col_subjects')}: ${subjects.join(', ')}`
                                    : '',
                                  batches.length > 0
                                    ? `${t.t('atch.col_batches')}: ${batches.join(', ')}`
                                    : '',
                                ]
                                  .filter((part) => part !== '')
                                  .join(' · ')}
                              </span>

                              <span className="block text-xs text-ink-muted">
                                {t.t('atch.col_classes')}: {t.digits(row._count.liveClass_teacher)} ·{' '}
                                {t.t('atch.col_exams')}: {t.digits(row._count.exam_teacher)} ·{' '}
                                {row.last_login
                                  ? t.t('atch.last_login', {
                                      date: t.date(row.last_login, 'd M Y'),
                                    })
                                  : t.t('atch.never')}
                              </span>
                            </span>
                          </span>

                          <TeacherRowActions
                            teacherId={row.id}
                            teacherName={row.name}
                            status={row.status}
                            onWebsite={row.show_on_website}
                            editHref={`${listHref}${listHref.includes('?') ? '&' : '?'}edit=${row.id}`}
                            labels={{
                              edit: t.t('common.edit'),
                              changePassword: t.t('atch.password'),
                              passwordFor: t.t('atch.password_for', { name: '{name}' }),
                              passwordNote: t.t('atch.password_note'),
                              password: t.t('atch.f_password'),
                              activate: t.t('atch.activate'),
                              deactivate: t.t('atch.deactivate'),
                              webShow: t.t('atch.web_show'),
                              webHide: t.t('atch.web_hide'),
                              remove: t.t('common.delete'),
                              confirmDelete: t.t('atch.delete_confirm', { name: '{name}' }),
                              tempTitle: t.t('atch.temp_title', { name: '{name}' }),
                              tempNote: t.t('atch.temp_note'),
                              save: t.t('common.save'),
                              cancel: t.t('common.cancel'),
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
                    {t.t('atch.showing', {
                      from: t.digits(pager.from),
                      to: t.digits(pager.to),
                      total: t.digits(pager.total),
                    })}
                  </span>
                  <span className="flex gap-2">
                    {pager.page > 1 && (
                      <Link
                        href={pageHref('/admin/teachers', query, pager.page - 1)}
                        className="rounded-orbit border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-2"
                      >
                        {t.t('common.previous')}
                      </Link>
                    )}
                    {pager.page < pager.totalPages && (
                      <Link
                        href={pageHref('/admin/teachers', query, pager.page + 1)}
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
