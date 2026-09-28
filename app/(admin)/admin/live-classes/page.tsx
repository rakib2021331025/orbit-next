import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardHeader, StatCard } from '@/components/ui/Card';
import { prisma } from '@/lib/db/prisma';
import { branchesEnabled } from '@/lib/branch/active';
import { branchList } from '@/lib/branch/stats';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { getLang, translate } from '@/lib/i18n';
import { uploadUrl } from '@/lib/storage/url';
import {
  fetchLiveClasses,
  classMaterials,
  classStats,
  classState,
  classFormOptions,
  classFormSelection,
  isClassStatus,
  startOf,
} from '@/lib/classes/data';
import { ClassForm } from '@/components/classes/ClassForm';
import { ClassRowActions } from '@/components/classes/ClassRowActions';
import { MaterialPanel } from '@/components/classes/MaterialPanel';
import {
  saveClassAction,
  setClassStatusAction,
  deleteClassAction,
  addMaterialAction,
  deleteMaterialAction,
} from './actions';

export const dynamic = 'force-dynamic';

const MATERIAL_MB = 25;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'lcl.title_mine'),
    robots: { index: false, follow: false },
  };
}

/**
 * Live classes, from admin/live_classes_management.php.
 *
 * Every teacher's classes, with the teacher and branch chosen on the form. The
 * teacher's own screen is this same view restricted to their classes — the
 * difference is entirely in which actions are handed to it.
 */
export default async function AdminLiveClassesPage({
  searchParams,
}: {
  searchParams: Promise<{
    edit?: string;
    status?: string;
    search?: string;
    new?: string;
    teacher?: string;
  }>;
}) {
  const params = await searchParams;

  return (
    <AdminPage active="live" route="/admin/live-classes" title="">
      {async ({ t }) => {
        const status = isClassStatus(params.status) ? params.status : '';
        const search = (params.search ?? '').trim().slice(0, 150);

        const teacherId = /^[0-9]+$/.test(params.teacher ?? '') ? Number(params.teacher) : 0;

        const [stats, classes, teachers, multiBranch] = await Promise.all([
          // No teacher id: the counters cover the whole institute (or branch).
          classStats(),
          fetchLiveClasses({ ...(teacherId > 0 ? { teacher_id: teacherId } : {}), status, search }, 300),
          prisma.teacher
            .findMany({
              where: { status: 'active' },
              orderBy: { name: 'asc' },
              select: { id: true, name: true, name_bn: true },
            })
            .catch(() => []),
          branchesEnabled(),
        ]);

        const branches = multiBranch ? await branchList() : [];

        const materials = await classMaterials(classes.map((row) => row.id));

        const editId = /^\d+$/.test(params.edit ?? '') ? Number(params.edit) : 0;
        const editing = classes.find((row) => row.id === editId) ?? null;

        const options = await classFormOptions(editing);
        const selection = editing
          ? classFormSelection(editing, options)
          : { course: '', batch: '' };

        // The list's own filters, so returning from a form keeps them.
        const query = new URLSearchParams();
        if (search !== '') query.set('search', search);
        if (status !== '') query.set('status', status);
        const listHref = `/admin/live-classes${query.size > 0 ? `?${query}` : ''}`;

        const ymd = (date: Date) =>
          `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
            date.getUTCDate()
          ).padStart(2, '0')}`;
        const hm = (time: Date) =>
          `${String(time.getUTCHours()).padStart(2, '0')}:${String(time.getUTCMinutes()).padStart(2, '0')}`;

        const kb = (bytes: number | null) => {
          const size = bytes ?? 0;
          if (size <= 0) return '';
          return size >= 1048576
            ? `${t.number(Math.round((size / 1048576) * 10) / 10, 1)} MB`
            : `${t.digits(Math.max(1, Math.round(size / 1024)))} KB`;
        };

        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-ink-heading">{t.t('lcl.title')}</h1>
              <p className="mt-1 text-sm text-ink-muted">{t.t('lcl.sub_admin')}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label={t.t('lcl.stat_today')}
                value={t.digits(stats.today)}
                icon="bi-calendar-day"
                tone={stats.today > 0 ? 'success' : 'default'}
              />
              <StatCard
                label={t.t('lcl.stat_upcoming')}
                value={t.digits(stats.upcoming)}
                icon="bi-calendar-event"
              />
              <StatCard
                label={t.t('lcl.stat_completed')}
                value={t.digits(stats.completed)}
                icon="bi-check2-circle"
              />
              {/* A scheduled class with no link is a class nobody can join, and
                  it is only visible as this number. */}
              <StatCard
                label={t.t('lcl.stat_no_link')}
                value={t.digits(stats.no_link)}
                icon="bi-link-45deg"
                tone={stats.no_link > 0 ? 'danger' : 'default'}
              />
            </div>

            <Card>
              <form method="get" className="flex flex-wrap items-end gap-3 px-5 py-4">
                <label className="flex flex-1 flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('common.search')}</span>
                  <input
                    type="search"
                    name="search"
                    maxLength={150}
                    defaultValue={search}
                    placeholder={t.t('lcl.search_ph')}
                    className="w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('common.teacher')}</span>
                  <select
                    name="teacher"
                    defaultValue={String(teacherId || 0)}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="0">{t.t('common.all')}</option>
                    {teachers.map((row) => (
                      <option key={row.id} value={row.id}>
                        {t.pick(row, 'name')}
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
                    <option value="scheduled">{t.t('lcl.status_scheduled')}</option>
                    <option value="completed">{t.t('status.completed')}</option>
                    <option value="cancelled">{t.t('status.cancelled')}</option>
                  </select>
                </label>

                <button
                  type="submit"
                  className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                >
                  {t.t('common.filter')}
                </button>
                <Link
                  href="/admin/live-classes"
                  className="rounded-orbit border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
                >
                  {t.t('common.clear')}
                </Link>
              </form>
            </Card>

            <ClassForm
              action={saveClassAction}
              teachers={teachers.map((row) => ({ id: row.id, name: t.pick(row, 'name') }))}
              selectedTeacherId={editing?.teacher_id ?? 0}
              branches={
                multiBranch
                  ? branches.map((branch) => ({ id: branch.id, name: t.pickPair(branch, 'name') }))
                  : undefined
              }
              selectedBranchId={editing?.branch_id ?? null}
              values={{
                id: editing?.id ?? 0,
                subject: editing?.subject ?? '',
                topic: editing?.topic ?? '',
                course_id: selection.course,
                batch_id: selection.batch,
                class_mode: editing?.class_mode ?? 'online',
                class_date: editing ? ymd(editing.class_date) : '',
                start_time: editing ? hm(editing.start_time) : '',
                duration_minutes: editing ? String(editing.duration_minutes) : '60',
                meet_url: editing?.meet_url ?? '',
                description: editing?.description ?? '',
                status: editing?.status ?? 'scheduled',
              }}
              courses={options.courses.map((course) => ({
                id: course.id,
                name: t.pick(course, 'name'),
              }))}
              batches={options.batches.map((batch) => ({
                id: batch.id,
                name: t.pick(batch, 'name'),
                course_id: batch.course_id,
              }))}
              keepCourseLabel={t.t('lcl.keep_current', { value: editing?.course ?? '' })}
              keepBatchLabel={t.t('lcl.keep_current', { value: editing?.batch ?? '' })}
              onCancelHref={listHref}
              labels={{
                newTitle: t.t('lcl.form_new'),
                editTitle: t.t('lcl.form_edit'),
                subject: t.t('common.subject'),
                teacher: t.t('common.teacher'),
                teacherNone: t.t('lcl.teacher_none'),
                branch: t.t('branch.label'),
                branchAll: t.t('branch.all_branches_shared'),
                subjectPlaceholder: t.t('lcl.subject_ph'),
                topic: t.t('lcl.topic'),
                topicPlaceholder: t.t('lcl.topic_ph'),
                course: t.t('common.course'),
                batch: t.t('common.batch'),
                courseAll: t.t('lcl.course_all'),
                batchAll: t.t('lcl.batch_all'),
                audienceHelp: t.t('lcl.audience_help'),
                date: t.t('lcl.col_when'),
                startTime: t.t('lcl.start_time'),
                duration: t.t('lcl.duration_min'),
                minutes: t.t('lcl.minutes', { count: t.digits(60) }),
                mode: t.t('lcl.mode'),
                modeOnline: t.t('course.type_online'),
                modeOffline: t.t('course.type_offline'),
                status: t.t('common.status'),
                statusScheduled: t.t('lcl.status_scheduled'),
                statusCompleted: t.t('status.completed'),
                statusCancelled: t.t('status.cancelled'),
                meetUrl: t.t('lcl.meet_url'),
                meetHelp: t.t('lcl.meet_help'),
                description: t.t('common.description'),
                descriptionPlaceholder: t.t('lcl.description_ph'),
                saveNew: t.t('lcl.save_new'),
                saveEdit: t.t('lcl.save_edit'),
                cancelEdit: t.t('lcl.cancel_edit'),
              }}
            />

            <Card>
              <CardHeader
                title={t.t('lcl.list_title')}
                icon="bi-camera-video"
                subtitle={t.t('branch.shared_help')}
                actions={<Badge tone="neutral">{t.digits(classes.length)}</Badge>}
              />

              {classes.length === 0 ? (
                <EmptyState
                  icon="bi-camera-video-off"
                  title={t.t('lcl.empty_title')}
                  body={t.t('lcl.empty')}
                />
              ) : (
                <ul className="divide-y divide-line-soft">
                  {classes.map((row) => {
                    const state = classState(row);
                    const files = materials.get(row.id) ?? [];
                    const audience = [row.course, row.batch].filter(Boolean).join(' · ');

                    return (
                      <li key={row.id} className="px-5 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-ink-heading">{row.subject}</span>
                              <Badge tone={state.tone}>{t.t(`lcl.state.${state.key}`)}</Badge>
                              <Badge tone="neutral">
                                <i
                                  className={
                                    row.class_mode === 'offline'
                                      ? 'bi bi-building me-1'
                                      : 'bi bi-camera-video me-1'
                                  }
                                  aria-hidden
                                />
                                {t.t(
                                  row.class_mode === 'offline'
                                    ? 'course.type_offline'
                                    : 'course.type_online'
                                )}
                              </Badge>
                            </p>

                            {row.topic && (
                              <p className="mt-0.5 text-sm text-ink">{row.topic}</p>
                            )}

                            <p className="mt-1 text-xs text-ink-muted">
                              {t.date(new Date(startOf(row.class_date, row.start_time)), 'd M Y, h:i A')}
                              {' · '}
                              {t.t('lcl.minutes', { count: t.digits(row.duration_minutes) })}
                            </p>

                            <p className="mt-0.5 text-xs text-ink-muted">
                              <i className="bi bi-people me-1" aria-hidden />
                              {audience !== '' ? audience : t.t('lcl.everyone')}
                            </p>

                            {row.meet_url ? (
                              <a
                                href={row.meet_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                              >
                                <i className="bi bi-box-arrow-up-right" aria-hidden />
                                {t.t('lcl.open_meet')}
                              </a>
                            ) : (
                              row.status === 'scheduled' &&
                              row.class_mode === 'online' && (
                                <span className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-red-600">
                                  <i className="bi bi-link-45deg" aria-hidden />
                                  {t.t('lcl.no_link')}
                                </span>
                              )
                            )}

                            <MaterialPanel
                              actions={{ add: addMaterialAction, remove: deleteMaterialAction }}
                              classId={row.id}
                              materials={files.map((material) => ({
                                id: material.id,
                                title: material.title,
                                url: uploadUrl(material.file_path),
                                type: material.file_type ?? '',
                                size: kb(material.file_size),
                              }))}
                              labels={{
                                heading: t.t('lcl.materials'),
                                count: t.digits(row._count.liveClassMaterial_live_class),
                                none: t.t('lcl.no_materials'),
                                title: t.t('common.title'),
                                titlePlaceholder: t.t('lcl.material_title_ph'),
                                file: t.t('lcl.col_files'),
                                help: t.t('lcl.material_help', { size: t.digits(MATERIAL_MB) }),
                                upload: t.t('lcl.upload'),
                                remove: t.t('common.delete'),
                                confirmRemove: t.t('lcl.confirm_delete_material'),
                                dismiss: t.t('common.cancel'),
                              }}
                            />
                          </div>

                          <div className="shrink-0">
                            <ClassRowActions
                              actions={{ setStatus: setClassStatusAction, remove: deleteClassAction }}
                              classId={row.id}
                              status={row.status}
                              editHref={`${listHref}${listHref.includes('?') ? '&' : '?'}edit=${row.id}#scheduleCard`}
                              labels={{
                                edit: t.t('common.edit'),
                                cancel: t.t('lcl.cancel_class'),
                                complete: t.t('lcl.mark_completed'),
                                reopen: t.t('lcl.reopen'),
                                remove: t.t('lcl.delete'),
                                confirmCancel: t.t('lcl.confirm_cancel'),
                                confirmDelete: t.t('lcl.confirm_delete'),
                                dismiss: t.t('common.cancel'),
                              }}
                            />
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        );
      }}
    </AdminPage>
  );
}
