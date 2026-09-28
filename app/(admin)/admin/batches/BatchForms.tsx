'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/ui/Feedback';
import { saveBatchAction, toggleBatchAction, deleteBatchAction, saveCourseQuickAction } from './actions';
import { emptyBatchState } from './state';

const CONTROL =
  'w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';
const BAD = 'border-red-400 focus:border-red-500 focus:ring-red-500/25';
const SMALL =
  'rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2';

export interface BatchFormValues {
  id: number;
  course_id: number;
  batch_type: string;
  name: string;
  name_bn: string;
  schedule_info: string;
  schedule_info_bn: string;
  start_date: string;
  capacity: string;
  fee: string;
  status: string;
  sort_order: string;
  branch_id: number;
}

/**
 * The batch form.
 *
 * The type choice is constrained by the course: an offline course's batch being
 * marked online is stored happily by the database and then silently not offered
 * to applicants, which is why the course's own type is shown next to the field.
 */
export function BatchForm({
  values,
  courses,
  branches,
  labels,
}: {
  values: BatchFormValues;
  courses: { id: number; name: string; type: string }[];
  branches: { id: number; name: string }[];
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(saveBatchAction, emptyBatchState);
  const [courseId, setCourseId] = useState(values.course_id);
  const [type, setType] = useState(values.batch_type);

  const editing = values.id > 0;
  const course = courses.find((row) => row.id === courseId);
  const mismatch = course && course.type !== 'hybrid' && course.type !== type;

  const cls = (field: string) => `mt-1 ${CONTROL} ${state.field === field ? BAD : ''}`;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="batch_id" value={values.id} />

      {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}
      {state.message !== '' && <Alert tone="success">{state.message}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-ink">
          {labels.course} *
          <select
            name="course_id"
            required
            value={String(courseId || 0)}
            onChange={(event) => setCourseId(Number(event.currentTarget.value))}
            className={cls('course_id')}
          >
            <option value="0">{labels.chooseCourse}</option>
            {courses.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.type} *
          <select
            name="batch_type"
            value={type}
            onChange={(event) => setType(event.currentTarget.value)}
            className={cls('batch_type')}
          >
            <option value="offline">{labels.typeOffline}</option>
            <option value="online">{labels.typeOnline}</option>
          </select>
          {mismatch && (
            <span className="mt-1 block text-[11px] font-normal text-amber-600">
              {labels.typeMismatch.replace('{type}', labels[`type_${course?.type}`] ?? course?.type ?? '')}
            </span>
          )}
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-ink">
          {labels.name} *
          <input
            name="name"
            required
            maxLength={150}
            placeholder={labels.namePlaceholder}
            defaultValue={values.name}
            className={cls('name')}
          />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.nameBn}
          <input
            name="name_bn"
            maxLength={150}
            lang="bn"
            defaultValue={values.name_bn}
            className={cls('name_bn')}
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-ink">
          {labels.schedule}
          <input
            name="schedule_info"
            maxLength={255}
            placeholder={labels.schedulePlaceholder}
            defaultValue={values.schedule_info}
            className={cls('schedule_info')}
          />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.scheduleBn}
          <input
            name="schedule_info_bn"
            maxLength={255}
            lang="bn"
            defaultValue={values.schedule_info_bn}
            className={cls('schedule_info_bn')}
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block text-xs font-medium text-ink">
          {labels.start}
          <input
            name="start_date"
            type="date"
            defaultValue={values.start_date}
            className={cls('start_date')}
          />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.capacity}
          <input
            name="capacity"
            type="number"
            min={1}
            max={100000}
            defaultValue={values.capacity}
            className={cls('capacity')}
          />
          <span className="mt-1 block text-[11px] font-normal text-ink-muted">
            {labels.capacityHelp}
          </span>
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.fee}
          <input
            name="fee"
            type="number"
            step="0.01"
            min="0"
            placeholder={labels.feePlaceholder}
            defaultValue={values.fee}
            className={cls('fee')}
          />
          <span className="mt-1 block text-[11px] font-normal text-ink-muted">{labels.feeHelp}</span>
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.sort}
          <input
            name="sort_order"
            type="number"
            defaultValue={values.sort_order}
            className={cls('sort_order')}
          />
          <span className="mt-1 block text-[11px] font-normal text-ink-muted">{labels.sortHelp}</span>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-ink">
          {labels.status}
          <select name="status" defaultValue={values.status} className={cls('status')}>
            <option value="active">{labels.statusActive}</option>
            <option value="inactive">{labels.statusInactive}</option>
          </select>
        </label>

        {branches.length > 0 ? (
          <label className="block text-xs font-medium text-ink">
            {labels.branch}
            <select
              name="branch_id"
              defaultValue={String(values.branch_id || 0)}
              className={cls('branch_id')}
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] font-normal text-ink-muted">
              {labels.branchHelp}
            </span>
          </label>
        ) : (
          <input type="hidden" name="branch_id" value={values.branch_id || ''} />
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
        >
          {labels.save}
        </button>
        <Link href="/admin/batches" className={SMALL}>
          {editing ? labels.back : labels.cancel}
        </Link>
      </div>
    </form>
  );
}

/** Activate / deactivate and delete, on one batch. */
export function BatchRowActions({
  batchId,
  status,
  labels,
}: {
  batchId: number;
  status: string;
  labels: {
    edit: string;
    activate: string;
    deactivate: string;
    remove: string;
    confirmDelete: string;
    dismiss: string;
  };
}) {
  const [toggleState, toggleAction, togglePending] = useActionState(
    toggleBatchAction,
    emptyBatchState
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteBatchAction,
    emptyBatchState
  );
  const [confirming, setConfirming] = useState(false);

  const error = toggleState.error || deleteState.error;

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {/* The refusal names every table that still points at the batch, so it is
          worth the full width. */}
      {error !== '' && <span className="w-full text-end text-xs text-red-600">{error}</span>}

      <Link href={`/admin/batches?edit=${batchId}`} className={SMALL}>
        {labels.edit}
      </Link>

      <form action={toggleAction} className="inline">
        <input type="hidden" name="batch_id" value={batchId} />
        <button type="submit" disabled={togglePending} className={SMALL}>
          {status === 'active' ? labels.deactivate : labels.activate}
        </button>
      </form>

      {confirming ? (
        <form action={deleteAction} className="inline-flex items-center gap-2">
          <input type="hidden" name="batch_id" value={batchId} />
          <span className="text-xs text-ink">{labels.confirmDelete}</span>
          <button
            type="submit"
            disabled={deletePending}
            className="rounded-orbit bg-red-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-red-700"
          >
            {labels.remove}
          </button>
          <button type="button" onClick={() => setConfirming(false)} className={SMALL}>
            {labels.dismiss}
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-orbit border border-red-300 px-2.5 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:hover:bg-red-950/40"
        >
          {labels.remove}
        </button>
      )}
    </div>
  );
}

/**
 * The quick course edit: fee, duration, status.
 *
 * Everything else about a course is on the Courses page, which is what the hint
 * says — this exists so that setting up a term does not need two screens.
 */
export function CourseQuickForm({
  courseId,
  fee,
  duration,
  status,
  labels,
}: {
  courseId: number;
  fee: string;
  duration: string;
  status: string;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(saveCourseQuickAction, emptyBatchState);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={SMALL}>
        {labels.courseDetails}
      </button>
    );
  }

  return (
    <form action={action} className="space-y-3 rounded-orbit border border-line bg-surface-2/50 p-3">
      <input type="hidden" name="course_id" value={courseId} />

      {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}
      {state.message !== '' && <Alert tone="success">{state.message}</Alert>}

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-medium text-ink">
          {labels.fee}
          <input
            name="fee"
            type="number"
            step="0.01"
            min="0"
            defaultValue={fee}
            className={`mt-1 ${CONTROL}`}
          />
          <span className="mt-1 block text-[11px] font-normal text-ink-muted">{labels.feeHelp}</span>
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.duration}
          <input
            name="duration"
            maxLength={100}
            placeholder={labels.durationPlaceholder}
            defaultValue={duration}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.status}
          <select name="status" defaultValue={status} className={`mt-1 ${CONTROL}`}>
            <option value="active">{labels.statusActive}</option>
            <option value="inactive">{labels.statusInactive}</option>
          </select>
        </label>
      </div>

      <p className="text-[11px] text-ink-muted">{labels.more}</p>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-orbit bg-primary px-3 py-1.5 text-sm font-medium text-white transition hover:bg-primary-hover"
        >
          {labels.save}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={SMALL}>
          {labels.cancel}
        </button>
      </div>
    </form>
  );
}
