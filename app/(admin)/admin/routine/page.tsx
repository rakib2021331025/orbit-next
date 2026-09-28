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
import { RoutineForm, RoutineRowActions } from './RoutineForms';
import { DAYS } from '@/lib/routine/days';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'aroutine.title'),
    robots: { index: false, follow: false },
  };
}

/** A TIME column's clock, which it carries in UTC. */
function hm(time: Date): string {
  return `${String(time.getUTCHours()).padStart(2, '0')}:${String(time.getUTCMinutes()).padStart(2, '0')}`;
}

/**
 * The weekly class routine, from admin/class_routine_management.php.
 *
 * Grouped by day in teaching-week order (Saturday first, as the institute runs),
 * because that is how a timetable is read and checked.
 *
 * Course and batch are free text with suggestions, not a fixed list: the student
 * portal matches them by NAME, and students admitted before the course table
 * existed carry names that are not in it.
 */
export default async function AdminRoutinePage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string; edit?: string; add?: string }>;
}) {
  const params = await searchParams;

  return (
    <AdminPage active="routine" route="/admin/routine" title="">
      {async ({ t }) => {
        const filterCourse = (params.course ?? '').trim().slice(0, 255);
        const branchScope = await branchWhere();

        const [rows, courseRows, batchRows, studentCourses, multiBranch, focus] = await Promise.all([
          prisma.classRoutine
            .findMany({
              where: {
                ...branchScope,
                ...(filterCourse !== '' ? { course: filterCourse } : {}),
              },
              orderBy: [{ start_time: 'asc' }, { id: 'asc' }],
            })
            .catch(() => []),
          prisma.course
            .findMany({
              where: { name: { not: '' } },
              orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
              select: { name: true, name_bn: true },
            })
            .catch(() => []),
          prisma.batch
            .findMany({ where: { name: { not: '' } }, distinct: ['name'], select: { name: true } })
            .catch(() => []),
          // Course names students actually carry, including free text from
          // before the course table existed.
          prisma.student
            .findMany({
              where: { status: 'approved', course: { not: '' } },
              distinct: ['course'],
              select: { course: true },
            })
            .catch(() => []),
          branchesEnabled(),
          activeBranchId(),
        ]);

        const branches = multiBranch ? await branchList() : [];
        const branchName = new Map(branches.map((branch) => [branch.id, t.pickPair(branch, 'name')]));

        const known = new Map(
          courseRows.map((course) => [course.name.trim().toLowerCase(), course])
        );
        const otherCourses = [
          ...new Set(
            [...studentCourses.map((row) => row.course), ...rows.map((row) => row.course)]
              .map((name) => name.trim())
              .filter((name) => name !== '' && !known.has(name.toLowerCase()))
          ),
        ].sort((a, b) => a.localeCompare(b));

        const editId = /^\d+$/.test(params.edit ?? '') ? Number(params.edit) : 0;
        const editing =
          editId > 0
            ? await prisma.classRoutine.findUnique({ where: { id: editId } }).catch(() => null)
            : null;
        const showForm = editing !== null || params.add !== undefined;

        const listHref = `/admin/routine${filterCourse !== '' ? `?course=${encodeURIComponent(filterCourse)}` : ''}`;

        // Grouped by day, in teaching-week order.
        const byDay = new Map<string, typeof rows>();
        for (const row of rows) {
          byDay.set(row.day_of_week, [...(byDay.get(row.day_of_week) ?? []), row]);
        }

        const allCourseNames = [
          ...courseRows.map((course) => course.name),
          ...otherCourses,
        ];

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-ink-heading">{t.t('aroutine.title')}</h1>
                <p className="mt-1 text-sm text-ink-muted">{t.t('aroutine.sub')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <form method="get" className="flex items-end gap-2">
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-ink-muted">{t.t('common.course')}</span>
                    <select
                      name="course"
                      defaultValue={filterCourse}
                      className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                    >
                      <option value="">{t.t('aroutine.all_courses')}</option>
                      {allCourseNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="submit"
                    className="rounded-orbit border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
                  >
                    {t.t('common.filter')}
                  </button>
                </form>

                {!showForm && (
                  <Link
                    href={`${listHref}${listHref.includes('?') ? '&' : '?'}add=1#routineForm`}
                    className="inline-flex items-center gap-2 self-end rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                  >
                    <i className="bi bi-plus-lg" aria-hidden />
                    {t.t('aroutine.add')}
                  </Link>
                )}
              </div>
            </div>

            {showForm && (
              <Card>
                <CardHeader
                  title={t.t(editing ? 'aroutine.edit' : 'aroutine.add')}
                  icon="bi-calendar-week"
                />
                <CardBody>
                  <RoutineForm
                    values={{
                      id: editing?.id ?? 0,
                      course: editing?.course ?? filterCourse,
                      batch: editing?.batch ?? '',
                      day_of_week: editing?.day_of_week ?? DAYS[0],
                      start_time: editing ? hm(editing.start_time) : '',
                      end_time: editing ? hm(editing.end_time) : '',
                      subject: editing?.subject ?? '',
                      teacher_name: editing?.teacher_name ?? '',
                      room_number: editing?.room_number ?? '',
                      branch_id: editing ? editing.branch_id : focus || null,
                    }}
                    courses={courseRows.map((course) => ({
                      value: course.name,
                      label: t.pick(course, 'name'),
                    }))}
                    otherCourses={otherCourses}
                    batches={[...new Set(batchRows.map((batch) => batch.name))]}
                    days={DAYS.map((day) => ({ value: day, label: t.day(day) }))}
                    branches={branches.map((branch) => ({
                      id: branch.id,
                      name: t.pickPair(branch, 'name'),
                    }))}
                    cancelHref={listHref}
                    labels={{
                      course: t.t('common.course'),
                      batch: t.t('common.batch'),
                      batchHint: t.t('aroutine.batch_hint'),
                      day: t.t('aroutine.day'),
                      start: t.t('aroutine.start'),
                      end: t.t('aroutine.end'),
                      subject: t.t('common.subject'),
                      teacher: t.t('aroutine.teacher'),
                      room: t.t('aroutine.room'),
                      roomPlaceholder: t.t('aroutine.room_ph'),
                      branch: t.t('branch.label'),
                      branchAll: t.t('branch.all_branches_shared'),
                      formHint: t.t('aroutine.form_hint'),
                      add: t.t('aroutine.add'),
                      save: t.t('common.save'),
                      cancel: t.t('common.cancel'),
                    }}
                  />
                </CardBody>
              </Card>
            )}

            {rows.length === 0 ? (
              <Card>
                <EmptyState
                  icon="bi-calendar-week"
                  title={t.t(filterCourse !== '' ? 'aroutine.none_filtered' : 'aroutine.none')}
                  body={t.t('aroutine.sub')}
                />
              </Card>
            ) : (
              DAYS.filter((day) => (byDay.get(day) ?? []).length > 0).map((day) => {
                const classes = byDay.get(day) ?? [];

                return (
                  <Card key={day}>
                    <CardHeader
                      title={t.day(day)}
                      icon="bi-calendar-day"
                      actions={
                        <Badge tone="neutral">
                          {t.t('aroutine.count', { count: t.digits(classes.length) })}
                        </Badge>
                      }
                    />
                    <ul className="divide-y divide-line-soft">
                      {classes.map((row) => (
                        <li
                          key={row.id}
                          className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                        >
                          <span className="min-w-0">
                            <span className="block font-medium text-ink">
                              {row.subject}
                              <span className="ms-2 text-xs font-normal text-ink-muted">
                                {t.t('aroutine.time_range', {
                                  start: t.date(row.start_time, 'h:i A'),
                                  end: t.date(row.end_time, 'h:i A'),
                                })}
                              </span>
                            </span>
                            <span className="block text-xs text-ink-muted">
                              {[
                                row.course,
                                row.batch ?? t.t('aroutine.batch_all'),
                                row.teacher_name,
                                row.room_number ? `${t.t('aroutine.room')} ${row.room_number}` : '',
                                multiBranch
                                  ? row.branch_id
                                    ? (branchName.get(row.branch_id) ?? '')
                                    : t.t('branch.all_branches')
                                  : '',
                              ]
                                .filter((part) => part !== '')
                                .join(' · ')}
                            </span>
                          </span>

                          <RoutineRowActions
                            routineId={row.id}
                            editHref={`${listHref}${listHref.includes('?') ? '&' : '?'}edit=${row.id}#routineForm`}
                            labels={{
                              edit: t.t('common.edit'),
                              remove: t.t('common.delete'),
                              confirmDelete: t.t('aroutine.delete_confirm'),
                              dismiss: t.t('common.cancel'),
                            }}
                          />
                        </li>
                      ))}
                    </ul>
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
