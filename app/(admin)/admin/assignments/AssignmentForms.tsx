'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/ui/Feedback';
import { saveAssignmentAction, deleteAssignmentAction } from './actions';

const CONTROL =
  'w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';
const SMALL =
  'rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2';

const EMPTY = { error: '', message: '' };

export interface AssignmentValues {
  id: number;
  title: string;
  description: string;
  course: string;
  batch: string;
  due_date: string;
  branch_id: number | null;
  hasFile: boolean;
}

/** Creating or editing one assignment. */
export function AssignmentForm({
  values,
  courses,
  otherCourses,
  batches,
  otherBatches,
  branches,
  fileHint,
  cancelHref,
  labels,
}: {
  values: AssignmentValues;
  courses: { value: string; label: string }[];
  otherCourses: string[];
  batches: { value: string; label: string }[];
  otherBatches: string[];
  branches: { id: number; name: string }[];
  fileHint: string;
  cancelHref: string;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(saveAssignmentAction, EMPTY);
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
            defaultValue={values.title}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.due} *
          <input
            name="due_date"
            type="date"
            required
            defaultValue={values.due_date}
            className={`mt-1 ${CONTROL}`}
          />
        </label>
      </div>

      <label className="block text-xs font-medium text-ink">
        {labels.instructions} *
        <textarea
          name="description"
          required
          rows={5}
          maxLength={20000}
          defaultValue={values.description}
          className={`mt-1 ${CONTROL}`}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-ink">
          {labels.course}
          <select name="course" defaultValue={values.course} className={`mt-1 ${CONTROL}`}>
            <option value="">{labels.allCourses}</option>
            <optgroup label={labels.coursesGroup}>
              {courses.map((course) => (
                <option key={course.value} value={course.value}>
                  {course.label}
                </option>
              ))}
            </optgroup>
            {otherCourses.length > 0 && (
              <optgroup label={labels.otherGroup}>
                {otherCourses.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.batch}
          <select name="batch" defaultValue={values.batch} className={`mt-1 ${CONTROL}`}>
            <option value="">{labels.allBatches}</option>
            <optgroup label={labels.batchesGroup}>
              {batches.map((batch) => (
                <option key={batch.value} value={batch.value}>
                  {batch.label}
                </option>
              ))}
            </optgroup>
            {otherBatches.length > 0 && (
              <optgroup label={labels.otherGroup}>
                {otherBatches.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <span className="mt-1 block text-[11px] font-normal text-ink-muted">
            {labels.batchHint}
          </span>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-ink">
          {values.hasFile ? labels.replaceFile : labels.chooseFile}
          <input type="file" name="file" className={`mt-1 ${CONTROL}`} />
          <span className="mt-1 block text-[11px] font-normal text-ink-muted">{fileHint}</span>
          {values.hasFile && (
            <span className="mt-2 flex items-center gap-2 text-xs font-normal text-ink">
              <input
                type="checkbox"
                name="remove_file"
                value="1"
                className="h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
              />
              {labels.removeFile}
            </span>
          )}
        </label>

        {branches.length > 0 && (
          <label className="block text-xs font-medium text-ink">
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
      </div>

      <p className="text-[11px] text-ink-muted">{labels.formSub}</p>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
        >
          {editing ? labels.save : labels.create}
        </button>
        {editing && (
          <Link href={cancelHref} className={SMALL}>
            {labels.back}
          </Link>
        )}
      </div>
    </form>
  );
}

/** Submissions, edit and delete, on one assignment. */
export function AssignmentRowActions({
  assignmentId,
  editHref,
  briefHref,
  labels,
}: {
  assignmentId: number;
  editHref: string;
  briefHref: string;
  labels: {
    submissions: string;
    brief: string;
    edit: string;
    remove: string;
    confirmDelete: string;
    dismiss: string;
  };
}) {
  const [state, action, pending] = useActionState(deleteAssignmentAction, EMPTY);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {state.error !== '' && (
        <span className="w-full text-end text-xs text-red-600">{state.error}</span>
      )}

      <Link href={`/admin/assignments/${assignmentId}/submissions`} className={SMALL}>
        {labels.submissions}
      </Link>

      {briefHref !== '' && (
        <a href={briefHref} target="_blank" rel="noopener noreferrer" className={SMALL}>
          {labels.brief}
        </a>
      )}

      <Link href={editHref} className={SMALL}>
        {labels.edit}
      </Link>

      {confirming ? (
        <form action={action} className="inline-flex items-center gap-2">
          <input type="hidden" name="id" value={assignmentId} />
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
