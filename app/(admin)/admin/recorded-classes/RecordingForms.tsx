'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/ui/Feedback';
import { saveRecordingAction, toggleRecordingAction, deleteRecordingAction } from './actions';

const CONTROL =
  'w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';
const SMALL =
  'rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2';

const EMPTY = { error: '', message: '' };

export interface RecordingValues {
  id: number;
  title: string;
  description: string;
  subject: string;
  course: string;
  batch: string;
  branch_id: number | null;
  teacher_id: number;
  class_date: string;
  duration_minutes: string;
  drive_file_id: string;
  status: string;
}

/**
 * Adding or editing a recorded class.
 *
 * The Drive field takes **the whole share link**: that is what an admin has on
 * the clipboard, and the server extracts the file id from it. Asking for a bare
 * id would mean asking people to edit a URL by hand.
 */
export function RecordingForm({
  values,
  courses,
  batches,
  teachers,
  branches,
  cancelHref,
  labels,
}: {
  values: RecordingValues;
  courses: { value: string; label: string }[];
  batches: { value: string; label: string }[];
  teachers: { id: number; name: string }[];
  branches: { id: number; name: string }[];
  cancelHref: string;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(saveRecordingAction, EMPTY);
  const editing = values.id > 0;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={values.id} />

      {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}
      {state.message !== '' && <Alert tone="success">{state.message}</Alert>}

      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <label className="block text-xs font-medium text-ink">
          {labels.title} *
          <input
            name="title"
            required
            maxLength={255}
            placeholder={labels.titlePlaceholder}
            defaultValue={values.title}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.subject}
          <input
            name="subject"
            maxLength={150}
            placeholder={labels.subjectPlaceholder}
            defaultValue={values.subject}
            className={`mt-1 ${CONTROL}`}
          />
        </label>
      </div>

      <label className="block text-xs font-medium text-ink">
        {labels.drive} *
        <input
          name="drive_file_id"
          required
          defaultValue={values.drive_file_id}
          className={`mt-1 ${CONTROL}`}
        />
        <span className="mt-1 block text-[11px] font-normal text-ink-muted">{labels.driveHelp}</span>
      </label>

      <label className="block text-xs font-medium text-ink">
        {labels.description}
        <textarea
          name="description"
          rows={3}
          maxLength={4000}
          defaultValue={values.description}
          className={`mt-1 ${CONTROL}`}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-ink">
          {labels.course}
          <select name="course" defaultValue={values.course} className={`mt-1 ${CONTROL}`}>
            <option value="">{labels.allCourses}</option>
            {courses.map((course) => (
              <option key={course.value} value={course.value}>
                {course.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.batch}
          <select name="batch" defaultValue={values.batch} className={`mt-1 ${CONTROL}`}>
            <option value="">{labels.allBatches}</option>
            {batches.map((batch) => (
              <option key={batch.value} value={batch.value}>
                {batch.label}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] font-normal text-ink-muted">
            {labels.batchHelp}
          </span>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block text-xs font-medium text-ink">
          {labels.teacher}
          <select
            name="teacher_id"
            defaultValue={String(values.teacher_id || 0)}
            className={`mt-1 ${CONTROL}`}
          >
            <option value="0">{labels.teacherNone}</option>
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.date}
          <input
            name="class_date"
            type="date"
            defaultValue={values.class_date}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.duration}
          <input
            name="duration_minutes"
            type="number"
            min={0}
            max={1000}
            defaultValue={values.duration_minutes}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.status}
          <select name="status" defaultValue={values.status} className={`mt-1 ${CONTROL}`}>
            <option value="draft">{labels.statusDraft}</option>
            <option value="published">{labels.statusPublished}</option>
          </select>
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
          <span className="mt-1 block text-[11px] font-normal text-ink-muted">
            {labels.branchHelp}
          </span>
        </label>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
        >
          {labels.save}
        </button>
        <Link href={cancelHref} className={SMALL}>
          {labels.cancel}
        </Link>
      </div>
    </form>
  );
}

/** Publish / unpublish, edit and delete, on one recording. */
export function RecordingRowActions({
  recordingId,
  status,
  editHref,
  labels,
}: {
  recordingId: number;
  status: string;
  editHref: string;
  labels: {
    edit: string;
    publish: string;
    unpublish: string;
    remove: string;
    confirmDelete: string;
    dismiss: string;
  };
}) {
  const [toggleState, toggleAction, togglePending] = useActionState(toggleRecordingAction, EMPTY);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteRecordingAction, EMPTY);
  const [confirming, setConfirming] = useState(false);

  const error = toggleState.error || deleteState.error;

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {error !== '' && <span className="w-full text-end text-xs text-red-600">{error}</span>}

      <Link href={editHref} className={SMALL}>
        {labels.edit}
      </Link>

      <form action={toggleAction} className="inline">
        <input type="hidden" name="id" value={recordingId} />
        <button type="submit" disabled={togglePending} className={SMALL}>
          {status === 'published' ? labels.unpublish : labels.publish}
        </button>
      </form>

      {confirming ? (
        <form action={deleteAction} className="inline-flex items-center gap-2">
          <input type="hidden" name="id" value={recordingId} />
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
