import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { getLang, translate } from '@/lib/i18n';
import { studentPhotoUrl } from '@/lib/storage/url';
import {
  attendanceBatches,
  legacyCourses,
  batchRoster,
  unbatchedRoster,
  dayMap,
} from '@/lib/attendance/register';
import { RegisterForm } from './RegisterForm';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'att.mark_title'),
    robots: { index: false, follow: false },
  };
}

/**
 * Taking attendance, from admin/attendance.php.
 *
 * `?batch=` accepts a real batch id **or** `0`, which means "students who are in
 * no batch" — older records that still need a register. Any other value is
 * ignored rather than trusted, and the batch list is the allow-list: a batch id
 * belonging to another branch simply does not open.
 */
export default async function AdminAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ batch?: string; date?: string; legacy_course?: string }>;
}) {
  const params = await searchParams;

  return (
    <AdminPage active="attendance" route="/admin/attendance" title="">
      {async ({ t }) => {
        const [batches, legacy] = await Promise.all([attendanceBatches(), legacyCourses()]);
        const batchById = new Map(batches.map((batch) => [batch.id, batch]));

        const rawBatch = params.batch ?? '';
        const chosen =
          /^\d+$/.test(rawBatch) && (Number(rawBatch) === 0 || batchById.has(Number(rawBatch)))
            ? Number(rawBatch)
            : null;

        const today = new Date();
        const todayText = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
          today.getDate()
        ).padStart(2, '0')}`;
        const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? '') ? (params.date as string) : todayText;

        // A legacy course filter only means anything for the batch-less register.
        const legacyCourse =
          chosen === 0 && legacy.includes(params.legacy_course ?? '')
            ? (params.legacy_course as string)
            : '';

        const roster =
          chosen === null ? [] : chosen > 0 ? await batchRoster(chosen) : await unbatchedRoster(legacyCourse);

        const existing =
          chosen !== null && roster.length > 0
            ? await dayMap(
                chosen,
                new Date(`${date}T00:00:00.000Z`),
                roster.map((student) => student.id)
              )
            : new Map();

        const existingLabel =
          [...existing.values()].map((row) => (row.class_label ?? '').trim()).find((label) => label !== '') ??
          '';

        const batchRow = chosen !== null && chosen > 0 ? batchById.get(chosen) : undefined;

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-ink-heading">{t.t('att.mark_title')}</h1>
                <p className="mt-1 text-sm text-ink-muted">{t.t('att.mark_sub')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/admin/attendance-report"
                  className="rounded-orbit border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
                >
                  {t.t('att.report')}
                </Link>
                <Link
                  href="/admin/attendance-calendar"
                  className="rounded-orbit border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
                >
                  {t.t('att.calendar')}
                </Link>
              </div>
            </div>

            <Card>
              <form method="get" className="flex flex-wrap items-end gap-3 px-5 py-4">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('common.batch')}</span>
                  <select
                    name="batch"
                    defaultValue={chosen === null ? '' : String(chosen)}
                    className="max-w-xs rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="">{t.t('att.batch_any')}</option>
                    {batches.map((batch) => (
                      <option key={batch.id} value={batch.id}>
                        {batch.course ? `${t.pick(batch.course, 'name')} — ` : ''}
                        {t.pick(batch, 'name')} (
                        {t.t(batch.batch_type === 'online' ? 'abat.type_online' : 'abat.type_offline')})
                        {batch.status === 'inactive' ? ` · ${t.t('status.inactive')}` : ''}
                      </option>
                    ))}
                    {/* The register for students who predate batches. */}
                    <option value="0">{t.t('att.unassigned')}</option>
                  </select>
                </label>

                {chosen === 0 && legacy.length > 0 && (
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-ink-muted">{t.t('att.legacy_course')}</span>
                    <select
                      name="legacy_course"
                      defaultValue={legacyCourse}
                      className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                    >
                      <option value="">{t.t('att.all_courses_legacy')}</option>
                      {legacy.map((course) => (
                        <option key={course} value={course}>
                          {course}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">{t.t('common.date')}</span>
                  <input
                    type="date"
                    name="date"
                    defaultValue={date}
                    max={todayText}
                    className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                  />
                </label>

                <button
                  type="submit"
                  className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                >
                  {t.t('att.load')}
                </button>
              </form>
            </Card>

            {chosen === null ? (
              <Card>
                <EmptyState
                  icon="bi-calendar-check"
                  title={t.t('att.mark_title')}
                  body={t.t('att.pick_batch')}
                />
              </Card>
            ) : roster.length === 0 ? (
              <Card>
                <EmptyState
                  icon="bi-person-x"
                  title={t.t('att.no_students')}
                  body={t.t('att.pick_batch')}
                />
              </Card>
            ) : (
              <Card>
                <CardHeader
                  title={
                    batchRow
                      ? `${batchRow.course ? `${t.pick(batchRow.course, 'name')} — ` : ''}${t.pick(batchRow, 'name')}`
                      : t.t('att.unassigned')
                  }
                  subtitle={`${t.t('att.register')} · ${t.date(new Date(`${date}T00:00:00`), 'l, d M Y')}`}
                  icon="bi-calendar-check"
                />
                <CardBody>
                  <RegisterForm
                    batchId={chosen}
                    date={date}
                    legacyCourse={legacyCourse}
                    existingLabel={existingLabel}
                    alreadyMarked={existing.size > 0}
                    rows={roster.map((student) => ({
                      id: student.id,
                      name: t.pick(student, 'name'),
                      studentId: student.student_id_no ?? '',
                      roll: student.roll_number ?? '',
                      photo: studentPhotoUrl(student),
                      // Everyone starts Present unless a mark already exists.
                      status: existing.get(student.id)?.status ?? 'present',
                      note: existing.get(student.id)?.note ?? '',
                      inactive: student.student_status !== 'Active',
                    }))}
                    labels={{
                      classLabel: t.t('att.class_label'),
                      classLabelPlaceholder: t.t('att.class_label_ph'),
                      markAll: t.t('att.mark_all'),
                      present: t.t('attendance.present'),
                      late: t.t('attendance.late'),
                      half_day: t.t('attendance.half_day'),
                      absent: t.t('attendance.absent'),
                      short_present: t.t('att.short.present'),
                      short_late: t.t('att.short.late'),
                      short_half_day: t.t('att.short.half_day'),
                      short_absent: t.t('att.short.absent'),
                      roll: t.t('att.roll'),
                      note: t.t('common.note'),
                      inactive: t.t('status.inactive'),
                      notifyAbsent: t.t('att.notify_absent'),
                      alreadyMarked: t.t('att.already_marked'),
                      save: t.t('att.save'),
                      saving: t.t('att.saving'),
                    }}
                  />
                </CardBody>
              </Card>
            )}
          </div>
        );
      }}
    </AdminPage>
  );
}
