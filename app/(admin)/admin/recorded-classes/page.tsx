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
import { paginate, pageHref } from '@/lib/paginate';
import { audienceOptions } from '@/lib/content/audience';
import { RecordingForm, RecordingRowActions } from './RecordingForms';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'rec.admin_title'),
    robots: { index: false, follow: false },
  };
}

/**
 * Recorded classes, from admin/recorded_classes.php.
 *
 * **`?branch=` is reserved** across the admin area for the branch switcher, so
 * this page's own branch filter is `?fbranch=` — the original renamed it for
 * exactly this reason after the two collided.
 */
export default async function AdminRecordedClassesPage({
  searchParams,
}: {
  searchParams: Promise<{
    edit?: string;
    new?: string;
    q?: string;
    course?: string;
    teacher?: string;
    status?: string;
    fbranch?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;

  return (
    <AdminPage active="recordings" route="/admin/recorded-classes" title="">
      {async ({ t }) => {
        const search = (params.q ?? '').trim().slice(0, 100);
        const courseFilter = (params.course ?? '').trim();
        const teacherFilter = /^\d+$/.test(params.teacher ?? '') ? Number(params.teacher) : 0;
        const statusFilter: 'draft' | 'published' | '' =
          params.status === 'draft' || params.status === 'published' ? params.status : '';
        const branchFilter = /^\d+$/.test(params.fbranch ?? '') ? Number(params.fbranch) : 0;

        const branchScope = await branchWhere();
        const where = {
          ...branchScope,
          ...(branchFilter > 0 ? { branch_id: branchFilter } : {}),
          ...(courseFilter !== '' ? { course: courseFilter } : {}),
          ...(teacherFilter > 0 ? { teacher_id: teacherFilter } : {}),
          ...(statusFilter !== '' ? { status: statusFilter } : {}),
          ...(search !== ''
            ? {
                OR: [
                  { title: { contains: search, mode: 'insensitive' as const } },
                  { subject: { contains: search, mode: 'insensitive' as const } },
                  { description: { contains: search, mode: 'insensitive' as const } },
                ],
              }
            : {}),
        };

        const total = await prisma.recordedClass.count({ where }).catch(() => 0);
        const pager = paginate(total, 20, Number(params.page ?? 1));

        const [rows, teachers, multiBranch, focus] = await Promise.all([
          prisma.recordedClass
            .findMany({
              where,
              orderBy: [{ class_date: 'desc' }, { id: 'desc' }],
              take: pager.perPage,
              skip: pager.offset,
            })
            .catch(() => []),
          prisma.teacher
            .findMany({
              where: { status: 'active' },
              orderBy: { name: 'asc' },
              select: { id: true, name: true, name_bn: true },
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
            ? await prisma.recordedClass.findUnique({ where: { id: editId } }).catch(() => null)
            : null;
        const showForm = editing !== null || params.new !== undefined;

        const options = await audienceOptions([editing?.course ?? null], [editing?.batch ?? null]);

        const query = {
          q: search || undefined,
          course: courseFilter || undefined,
          teacher: teacherFilter > 0 ? String(teacherFilter) : undefined,
          status: statusFilter || undefined,
          fbranch: branchFilter > 0 ? String(branchFilter) : undefined,
        };
        const listHref = `/admin/recorded-classes${
          Object.values(query).some((value) => value !== undefined)
            ? `?${new URLSearchParams(
                Object.entries(query).filter(([, value]) => value !== undefined) as [string, string][]
              )}`
            : ''
        }`;

        const duration = (minutes: number | null) => {
          if (!minutes || minutes <= 0) return '';
          const h = Math.floor(minutes / 60);
          const m = minutes % 60;
          if (h > 0 && m > 0) {
            return t.t('rec.dur_hm', { h: t.digits(h), m: t.digits(m) });
          }
          return h > 0 ? t.t('rec.dur_h', { h: t.digits(h) }) : t.t('rec.dur_m', { m: t.digits(m) });
        };

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-ink-heading">{t.t('rec.admin_title')}</h1>
                <p className="mt-1 text-sm text-ink-muted">{t.t('rec.admin_sub')}</p>
              </div>
              {!showForm && (
                <Link
                  href="/admin/recorded-classes?new=1"
                  className="inline-flex items-center gap-2 rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                >
                  <i className="bi bi-plus-lg" aria-hidden />
                  {t.t('rec.add')}
                </Link>
              )}
            </div>

            {showForm && (
              <Card>
                <CardHeader
                  title={t.t(editing ? 'common.edit' : 'rec.add')}
                  subtitle={t.t('rec.drive_help')}
                  icon="bi-collection-play"
                />
                <CardBody>
                  <RecordingForm
                    values={{
                      id: editing?.id ?? 0,
                      title: editing?.title ?? '',
                      description: editing?.description ?? '',
                      subject: editing?.subject ?? '',
                      course: editing?.course ?? '',
                      batch: editing?.batch ?? '',
                      branch_id: editing ? editing.branch_id : focus || null,
                      teacher_id: editing?.teacher_id ?? 0,
                      class_date: editing?.class_date
                        ? editing.class_date.toISOString().slice(0, 10)
                        : '',
                      duration_minutes:
                        editing?.duration_minutes !== null && editing?.duration_minutes !== undefined
                          ? String(editing.duration_minutes)
                          : '',
                      drive_file_id: editing?.drive_file_id ?? '',
                      status: editing?.status ?? 'draft',
                    }}
                    courses={[
                      ...options.courses,
                      ...options.otherCourses.map((name) => ({ value: name, label: name })),
                    ]}
                    batches={[
                      ...options.batches.map((batch) => ({
                        value: batch.value,
                        label: batch.course ? `${batch.course} — ${batch.label}` : batch.label,
                      })),
                      ...options.otherBatches.map((name) => ({ value: name, label: name })),
                    ]}
                    teachers={teachers.map((teacher) => ({
                      id: teacher.id,
                      name: t.pick(teacher, 'name'),
                    }))}
                    branches={branches.map((branch) => ({
                      id: branch.id,
                      name: t.pickPair(branch, 'name'),
                    }))}
                    cancelHref={listHref}
                    labels={{
                      title: t.t('rec.f_title'),
                      titlePlaceholder: t.t('rec.f_title_ph'),
                      subject: t.t('rec.f_subject'),
                      subjectPlaceholder: t.t('rec.f_subject_ph'),
                      drive: t.t('rec.f_drive'),
                      driveHelp: t.t('rec.f_drive_help'),
                      description: t.t('rec.f_description'),
                      course: t.t('rec.f_course'),
                      allCourses: t.t('rec.all_courses'),
                      batch: t.t('rec.f_batch'),
                      allBatches: t.t('rec.all_batches'),
                      batchHelp: t.t('rec.f_batch_help'),
                      teacher: t.t('rec.f_teacher'),
                      teacherNone: t.t('rec.no_teacher'),
                      date: t.t('rec.f_date'),
                      duration: t.t('rec.f_duration'),
                      status: t.t('rec.f_status'),
                      statusDraft: t.t('rec.status_draft'),
                      statusPublished: t.t('rec.status_published'),
                      branch: t.t('rec.f_branch'),
                      branchAll: t.t('rec.all_branches'),
                      branchHelp: t.t('rec.f_branch_help'),
                      save: t.t('common.save'),
                      cancel: t.t('common.cancel'),
                    }}
                  />
                </CardBody>
              </Card>
            )}

            <Card>
              <form method="get" className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-5">
                <label className="flex flex-col gap-1 text-sm lg:col-span-2">
                  <span className="text-ink-muted">{t.t('rec.search')}</span>
                  <input
                    type="search"
                    name="q"
                    defaultValue={search}
                    placeholder={t.t('rec.search_ph')}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('rec.f_course')}</span>
                  <select
                    name="course"
                    defaultValue={courseFilter}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="">{t.t('rec.all_courses')}</option>
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
                  <span className="text-ink-muted">{t.t('rec.f_teacher')}</span>
                  <select
                    name="teacher"
                    defaultValue={String(teacherFilter || 0)}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="0">{t.t('rec.any_teacher')}</option>
                    {teachers.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {t.pick(teacher, 'name')}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('rec.f_status')}</span>
                  <select
                    name="status"
                    defaultValue={statusFilter}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="">{t.t('rec.any_status')}</option>
                    <option value="draft">{t.t('rec.status_draft')}</option>
                    <option value="published">{t.t('rec.status_published')}</option>
                  </select>
                </label>

                {multiBranch && (
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-ink-muted">{t.t('rec.f_branch')}</span>
                    {/* `fbranch`, not `branch`: that one belongs to the switcher. */}
                    <select
                      name="fbranch"
                      defaultValue={String(branchFilter || 0)}
                      className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                    >
                      <option value="0">{t.t('rec.all_branches')}</option>
                      {branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {t.pickPair(branch, 'name')}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <div className="flex items-end gap-2 sm:col-span-2">
                  <button
                    type="submit"
                    className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                  >
                    {t.t('common.filter')}
                  </button>
                  <Link
                    href="/admin/recorded-classes"
                    className="rounded-orbit border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
                  >
                    {t.t('common.clear')}
                  </Link>
                </div>
              </form>
            </Card>

            <Card>
              <CardHeader
                title={t.t('rec.admin_title')}
                icon="bi-collection-play"
                actions={<Badge tone="neutral">{t.digits(total)}</Badge>}
              />

              {rows.length === 0 ? (
                <EmptyState
                  icon="bi-camera-reels"
                  title={t.t(search !== '' ? 'rec.none_search' : 'rec.none_admin')}
                  body={t.t('rec.admin_sub')}
                />
              ) : (
                <ul className="divide-y divide-line-soft">
                  {rows.map((row) => (
                    <li key={row.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-ink-heading">{row.title}</span>
                            <Badge tone={row.status === 'published' ? 'success' : 'neutral'}>
                              {t.t(
                                row.status === 'published' ? 'rec.status_published' : 'rec.status_draft'
                              )}
                            </Badge>
                          </p>
                          {row.description && (
                            <p className="mt-1 line-clamp-2 text-sm text-ink">{row.description}</p>
                          )}
                          <p className="mt-1 text-xs text-ink-muted">
                            {[
                              row.subject ?? '',
                              row.course || t.t('rec.all_courses'),
                              row.batch || t.t('rec.all_batches'),
                              row.teacher_name ?? t.t('rec.no_teacher'),
                              row.class_date ? t.date(row.class_date, 'd M Y') : '',
                              duration(row.duration_minutes),
                              multiBranch
                                ? row.branch_id
                                  ? (branchName.get(row.branch_id) ?? '')
                                  : t.t('rec.all_branches')
                                : '',
                            ]
                              .filter((part) => part !== '')
                              .join(' · ')}
                          </p>
                        </div>

                        <RecordingRowActions
                          recordingId={row.id}
                          status={row.status}
                          editHref={`${listHref}${listHref.includes('?') ? '&' : '?'}edit=${row.id}`}
                          labels={{
                            edit: t.t('common.edit'),
                            publish: t.t('rec.publish'),
                            unpublish: t.t('rec.unpublish'),
                            remove: t.t('common.delete'),
                            confirmDelete: t.t('rec.delete_confirm'),
                            dismiss: t.t('common.cancel'),
                          }}
                        />
                      </div>
                    </li>
                  ))}
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
                        href={pageHref('/admin/recorded-classes', query, pager.page - 1)}
                        className="rounded-orbit border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-2"
                      >
                        {t.t('common.previous')}
                      </Link>
                    )}
                    {pager.page < pager.totalPages && (
                      <Link
                        href={pageHref('/admin/recorded-classes', query, pager.page + 1)}
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
