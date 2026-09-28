'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/ui/Feedback';
import { saveRoutineAction, deleteRoutineAction } from './actions';

const CONTROL =
  'w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';
const SMALL =
  'rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2';

const EMPTY = { error: '', message: '' };

export interface RoutineValues {
  id: number;
  course: string;
  batch: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  subject: string;
  teacher_name: string;
  room_number: string;
  branch_id: number | null;
}

/**
 * Adding or editing one class in the weekly routine.
 *
 * Course and batch are free text with suggestions rather than a strict list: the
 * student portal matches them by NAME, and older students carry course names
 * that are not in the course table at all. A hard list would make those students'
 * timetables impossible to fill in.
 */
export function RoutineForm({
  values,
  courses,
  otherCourses,
  batches,
  days,
  branches,
  cancelHref,
  labels,
}: {
  values: RoutineValues;
  courses: { value: string; label: string }[];
  otherCourses: string[];
  batches: string[];
  days: { value: string; label: string }[];
  branches: { id: number; name: string }[];
  cancelHref: string;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(saveRoutineAction, EMPTY);
  const editing = values.id > 0;

  return (
    <form action={action} id="routineForm" className="space-y-4">
      <input type="hidden" name="id" value={values.id} />

      {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}
      {state.message !== '' && <Alert tone="success">{state.message}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-ink">
          {labels.course} *
          <input
            name="course"
            required
            list="routine-courses"
            maxLength={255}
            defaultValue={values.course}
            className={`mt-1 ${CONTROL}`}
          />
          <datalist id="routine-courses">
            {courses.map((course) => (
              <option key={course.value} value={course.value}>
                {course.label}
              </option>
            ))}
            {otherCourses.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.batch}
          <input
            name="batch"
            list="routine-batches"
            maxLength={100}
            defaultValue={values.batch}
            className={`mt-1 ${CONTROL}`}
          />
          <datalist id="routine-batches">
            {batches.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <span className="mt-1 block text-[11px] font-normal text-ink-muted">
            {labels.batchHint}
          </span>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-medium text-ink">
          {labels.day} *
          <select
            name="day_of_week"
            defaultValue={values.day_of_week}
            className={`mt-1 ${CONTROL}`}
          >
            {days.map((day) => (
              <option key={day.value} value={day.value}>
                {day.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.start} *
          <input
            name="start_time"
            type="time"
            required
            defaultValue={values.start_time}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.end} *
          <input
            name="end_time"
            type="time"
            required
            defaultValue={values.end_time}
            className={`mt-1 ${CONTROL}`}
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-medium text-ink">
          {labels.subject} *
          <input
            name="subject"
            required
            maxLength={255}
            defaultValue={values.subject}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.teacher} *
          <input
            name="teacher_name"
            required
            maxLength={255}
            defaultValue={values.teacher_name}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.room}
          <input
            name="room_number"
            maxLength={50}
            placeholder={labels.roomPlaceholder}
            defaultValue={values.room_number}
            className={`mt-1 ${CONTROL}`}
          />
        </label>
      </div>

      {branches.length > 0 && (
        <label className="block text-xs font-medium text-ink sm:max-w-xs">
          {labels.branch}
          <select
            name="branch_id"
            defaultValue={values.branch_id ? String(values.branch_id) : ''}
            className={`mt-1 ${CONTROL}`}
          >
            <option value="">{labels.branchAll}</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <p className="text-[11px] text-ink-muted">{labels.formHint}</p>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
        >
          {editing ? labels.save : labels.add}
        </button>
        <Link href={cancelHref} className={SMALL}>
          {labels.cancel}
        </Link>
      </div>
    </form>
  );
}

/** Edit and remove, on one routine row. */
export function RoutineRowActions({
  routineId,
  editHref,
  labels,
}: {
  routineId: number;
  editHref: string;
  labels: { edit: string; remove: string; confirmDelete: string; dismiss: string };
}) {
  const [state, action, pending] = useActionState(deleteRoutineAction, EMPTY);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {state.error !== '' && (
        <span className="w-full text-end text-xs text-red-600">{state.error}</span>
      )}

      <Link href={editHref} className={SMALL}>
        {labels.edit}
      </Link>

      {confirming ? (
        <form action={action} className="inline-flex items-center gap-2">
          <input type="hidden" name="id" value={routineId} />
          <span className="text-xs text-ink">{labels.confirmDelete}</span>
          <button
            type="submit"
            disabled={pending}
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
